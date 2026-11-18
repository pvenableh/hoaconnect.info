/**
 * POST /api/org/expenses/[id]/submit — a draft, or a rejected expense, goes
 * to the board: it opens the next spend round and tells the people the rule
 * waits on (docs/spec-money-approvals.md). money:enter. Whoever entered it
 * and whoever submits it can never decide it.
 *
 * Body: { orgId }.
 */
export default defineEventHandler(async (event) => {
  await requireUserSession(event);
  const id = String(getRouterParam(event, "id") || "");
  const orgId = String((await readBody(event).catch(() => null))?.orgId || "");
  const viewer = await requireMoneyEnter(event, orgId);
  const row = await loadExpense(orgId, id);
  await requireExpenseAction(orgId, row, viewer, "submit");

  const { approval, view } = await startSpendRound({
    orgId,
    expense: row,
    requestedBy: viewer.userId,
    now: new Date().toISOString(),
    origin: await safeRequestOrigin(event).catch(() => null),
  });
  return { status: "submitted", approval: { id: approval.id, state: view.state, needed: view.needed, round: approval.round } };
});
