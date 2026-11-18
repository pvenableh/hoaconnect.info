/**
 * PATCH /api/org/expenses/[id] — change an expense (money:enter).
 *
 * Body: { orgId, patch }. What may change depends on its status
 * (editPlan, core/shared/expenses/expense-writes.ts):
 *   draft                         anything
 *   submitted, nobody decided     anything; a change to the amount, vendor or
 *                                 title changes the open round in place, and
 *                                 the editor can no longer decide it
 *   submitted with a decision,    anything; a change to the amount, vendor or
 *   approved, rejected            title supersedes the round and opens a new
 *                                 one that the editor cannot decide, and the
 *                                 expense goes back to submitted
 *   paid                          notes and receipt only
 *   void                          nothing
 * Status never changes here except through a new round. The row must be the
 * community's; a project must be one of its, a new receipt one of its files.
 */
import { updateItem } from "@directus/sdk";
import { editPlan, patchExpenseBody } from "#core/shared/expenses/expense-writes";
import { assertProjectInOrg } from "#core/server/utils/responsibilities";
import { assertReceiptInOrg } from "#core/server/utils/expense-receipts";

const asId = (v: unknown): string | null =>
  typeof v === "string" ? v : ((v as { id?: unknown } | null)?.id as string | undefined) ?? null;

export default defineEventHandler(async (event) => {
  await requireUserSession(event);
  const id = String(getRouterParam(event, "id") || "");
  const parsed = patchExpenseBody.safeParse(await readBody(event).catch(() => null));
  if (!parsed.success) throw createError({ statusCode: 400, message: parsed.error.issues[0]?.message ?? "Check the form." });
  const { orgId, patch } = parsed.data;

  const viewer = await requireMoneyEnter(event, orgId);
  const row = await loadExpense(orgId, id);

  await requireExpenseAction(orgId, row, viewer, "edit");
  const current = { ...row, project: asId(row.project), receipt: asId(row.receipt) };
  const round = row.approval ? (await loadApprovals(orgId, { id: { _eq: asId(row.approval) } }))[0] ?? null : null;
  const decided = round ? (await loadDecisions([round.id])).get(round.id)?.length ?? 0 : 0;
  const plan = editPlan(row.status, current, patch as Record<string, unknown>, decided);
  if (plan.refusal) throw createError({ statusCode: 400, message: plan.refusal });
  if (!plan.changed.length) return numericMoney([row as object], ["amount"])[0];

  await assertProjectInOrg(orgId, patch.project);
  // The receipt it already has is its own; only a new one is checked.
  if (patch.receipt && patch.receipt !== asId(row.receipt)) await assertReceiptInOrg(orgId, patch.receipt, viewer.userId);

  const changes = Object.fromEntries(plan.changed.map((k) => [k, (patch as Record<string, unknown>)[k]]));
  const updated = await getTypedDirectus().request(updateItem("payment_expenses" as never, id, changes as never));

  if (plan.amendsRound && round) {
    await amendRound(orgId, round, viewer.userId);
    return numericMoney([updated as object], ["amount"])[0];
  }
  if (plan.newRound) {
    const now = new Date().toISOString();
    await startSpendRound({
      orgId,
      expense: { ...row, ...changes },
      // The round is still the original asker's; the editor is excluded as its reshaper.
      requestedBy: round?.requested_by ?? asId(row.entered_by) ?? viewer.userId,
      reshapedBy: viewer.userId,
      now,
      origin: await safeRequestOrigin(event).catch(() => null),
    });
    return { ...numericMoney([updated as object], ["amount"])[0], status: "submitted" };
  }
  return numericMoney([updated as object], ["amount"])[0];
});
