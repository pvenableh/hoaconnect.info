/**
 * POST /api/org/expenses/[id]/void — cancel an expense; it stays on record
 * (docs/spec-money-approvals.md). money:enter.
 *
 *   draft, rejected, or submitted with no decisions   voided at once, by the
 *                                                     person who entered it or
 *                                                     an admin
 *   submitted with decisions, approved, or paid       opens a `void` approval;
 *                                                     whoever asks cannot
 *                                                     decide it
 *
 * Body: { orgId, reason }.
 */
import { updateItem } from "@directus/sdk";
import { buildExpenseVoidedEntry } from "#core/shared/ledger/entries";
import { voidExpenseBody, voidsAtOnce } from "#core/shared/expenses/expense-writes";
import { ledgerActorFor } from "#core/server/utils/member-names";

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const id = String(getRouterParam(event, "id") || "");
  const parsed = voidExpenseBody.safeParse(await readBody(event).catch(() => null));
  if (!parsed.success) throw createError({ statusCode: 400, message: parsed.error.issues[0]?.message ?? "Check the form." });
  const { orgId, reason } = parsed.data;

  const viewer = await requireMoneyEnter(event, orgId);
  const row = await loadExpense(orgId, id);
  const spendId = row.approval ? String(row.approval?.id ?? row.approval) : null;
  const spend = spendId ? (await loadApprovals(orgId, { id: { _eq: spendId } }))[0] ?? null : null;
  const decided = spend ? (await loadDecisions([spend.id])).get(spend.id)?.length ?? 0 : 0;
  const now = new Date().toISOString();
  const origin = await safeRequestOrigin(event).catch(() => null);

  if (voidsAtOnce(row.status, decided)) {
    await requireExpenseAction(orgId, row, viewer, "void");
    await getTypedDirectus().request(updateItem("payment_expenses", id, { status: "void", void_reason: reason } as any));
    await supersede(spend, now);
    // A draft was never record; a submission or a rejection was, for the board.
    if (row.status !== "draft") {
      const entry = buildExpenseVoidedEntry({
        organizationId: orgId,
        organizationName: await orgName(orgId),
        expense: expenseSubject(row),
        previousStatus: String(row.status),
        reason,
        approvalId: null,
        actor: await ledgerActorFor(orgId, (session.user ?? {}) as Record<string, any>),
        occurredAt: now,
      });
      await writeAuditEntry(entry).catch((e) => console.error("[expenses/void] ledger write failed:", e));
    }
    return { voided: true, approval: null };
  }

  await requireExpenseAction(orgId, row, viewer, "ask_void");
  const seats = await loadCurrentSeats(orgId);
  const { approval, view } = await openApproval({
    orgId,
    kind: "void",
    expense: id,
    round: 1,
    requestedBy: viewer.userId,
    excluded: [],
    reason,
    seats,
  });
  await notifyApprovers({ orgId, approval, view, expense: expenseSubject(row), origin });
  return { voided: false, approval: { id: approval.id, state: view.state, needed: view.needed } };
});
