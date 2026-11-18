/**
 * POST /api/org/money/approvals/[id]/decide — approve or reject, with an
 * optional note (docs/spec-money-approvals.md).
 *
 * The rule decides who may, from the board seats as they stand now: never
 * the person who asked, never anyone who reshaped the round, never an admin
 * as an admin. Anything the client says about `canDecide` is ignored; a
 * caller the rule does not wait on gets 403. The decision keeps the office
 * its maker holds now, goes to the Ledger (board), and the approval is
 * settled: approved or rejected moves its expense and tells the people
 * concerned.
 *
 * Body: { orgId, decision: "approve" | "reject", note? }.
 */
import { createItem } from "@directus/sdk";
import { z } from "zod";
import { buildMoneyDecisionEntry, expensePhrase } from "#core/shared/ledger/entries";
import { ledgerActorFor } from "#core/server/utils/member-names";

const body = z
  .object({
    orgId: z.string().min(1, "orgId is required"),
    decision: z.enum(["approve", "reject"], { message: "Approve or reject." }),
    note: z.string().trim().max(1000).nullable().optional(),
  })
  // Unknown keys (a `canDecide` the client sends, say) are dropped, never read.
  .strip();

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const parsed = body.safeParse(await readBody(event).catch(() => null));
  if (!parsed.success) throw createError({ statusCode: 400, message: parsed.error.issues[0]?.message ?? "Check the form." });
  const { orgId, decision } = parsed.data;
  const note = parsed.data.note?.trim() || null;

  await requireMoneyRead(event, orgId);
  const userId = String(session.user?.id ?? "");
  const approval = await loadApproval(orgId, String(getRouterParam(event, "id") || ""));
  if (approval.kind === "waive") throw createError({ statusCode: 409, message: "Waivers can't be decided yet." });
  if (!isOpen(approval.state)) throw createError({ statusCode: 409, message: "This approval is already settled." });

  const seats = await loadCurrentSeats(orgId);
  const before = (await loadDecisions([approval.id])).get(approval.id) ?? [];
  const view = viewOf(approval, seats, before);
  if (!callerCanDecide(approval, view, userId)) {
    throw createError({
      statusCode: 403,
      message: approval.excluded.includes(userId)
        ? "You asked for this or changed it, so you can't decide it."
        : view.state === "cannot_approve"
          ? "The board is too small to approve this."
          : before.some((d) => d.decided_by === userId)
            ? "You have already decided this."
            : "Only the board members this approval is waiting on can decide it.",
    });
  }

  const { office, label } = officeLabelOf(seats, userId);
  const now = new Date().toISOString();
  const made = await getTypedDirectus()
    .request(
      createItem("money_approval_decisions" as any, {
        approval: approval.id,
        decided_by: userId,
        office,
        decision,
        note,
        // Unique: a second decision by the same person fails here, whatever raced it.
        unique_key: `${approval.id}:${userId}`,
      } as any)
    )
    .catch(() => {
      throw createError({ statusCode: 409, message: "You have already decided this." });
    });

  const decisions = [...before, { id: String((made as any)?.id ?? ""), approval: approval.id, decided_by: userId, office, decision, note, date_created: now }];
  const actor = await ledgerActorFor(orgId, (session.user ?? {}) as Record<string, any>);
  const expense = approval.expense ? await loadExpense(orgId, approval.expense).catch(() => null) : null;
  if (expense) {
    await writeAuditEntry(
      buildMoneyDecisionEntry({
        organizationId: orgId,
        organizationName: await orgName(orgId),
        approvalId: approval.id,
        kind: approval.kind,
        round: approval.round,
        expense: expenseSubject(expense),
        decision,
        officeLabel: label,
        note,
        actor,
        occurredAt: now,
      })
    ).catch((e) => console.error("[approvals/decide] ledger write failed:", e));
  }

  const after = viewOf(approval, seats, decisions);
  const origin = await safeRequestOrigin(event).catch(() => null);
  const result = await settleApproval({ orgId, approval, view: after, decisions, seats, actor, now, origin });

  // Each decision: whoever asked for it. The outcome notice, if any, came from settleApproval.
  if (result.state === "pending" && approval.requested_by && expense) {
    const who = label ? `${actor.name} (${label})` : actor.name;
    await notifyUsers({
      organizationId: orgId,
      recipientUserIds: [approval.requested_by],
      category: "payment",
      subject: decision === "approve" ? "An approval came in" : "A rejection came in",
      message: `${who} ${decision === "approve" ? "approved" : "rejected"} ${approval.kind === "void" ? "voiding " : ""}${expensePhrase(expenseSubject(expense))}. ${after.approvals} of ${after.needed} approvals so far.`,
      collection: "money_approvals",
      item: approval.id,
      path: "/approvals",
      origin,
      excludeUserId: userId,
    }).catch((e) => console.error("[approvals/decide] requester notice failed:", e));
  }

  return { state: result.state, approvals: after.approvals, needed: after.needed };
});
