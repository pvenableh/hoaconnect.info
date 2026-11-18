/**
 * GET /api/org/money/approvals?orgId=&view=open|awaiting-me|all — the
 * community's money approvals with their subject, the rule's view now and
 * `canDecide` for the caller (money:read: every board seat, admins).
 * docs/spec-money-approvals.md.
 */
export default defineEventHandler(async (event) => {
  const orgId = await requireMoneyRead(event);
  const session = await getUserSession(event);
  const userId = session?.user?.id ? String(session.user.id) : null;
  const view = String(getQuery(event).view || "open");
  if (!["open", "awaiting-me", "all"].includes(view)) throw createError({ statusCode: 400, message: "view is open, awaiting-me or all" });

  const rows = await loadApprovals(orgId, view === "all" ? {} : { state: { _in: [...OPEN_STATES] } });
  const items = await describeApprovals(orgId, rows.slice(0, moneyLimit(event, 200)), userId);
  const open = items.filter((i) => i.state === "pending" || i.state === "cannot_approve");
  return {
    approvals: view === "all" ? items : view === "awaiting-me" ? open.filter((i) => i.canDecide) : open,
    awaitingMe: open.filter((i) => i.canDecide).length,
  };
});
