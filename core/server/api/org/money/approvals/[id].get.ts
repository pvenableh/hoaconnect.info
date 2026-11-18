/**
 * GET /api/org/money/approvals/[id]?orgId= — one approval: its decisions, who
 * it waits on, who is excluded, and `canDecide` for the caller (money:read).
 */
export default defineEventHandler(async (event) => {
  const orgId = await requireMoneyRead(event);
  const session = await getUserSession(event);
  const approval = await loadApproval(orgId, String(getRouterParam(event, "id") || ""));
  const [item] = await describeApprovals(orgId, [approval], session?.user?.id ? String(session.user.id) : null);
  return { approval: item };
});
