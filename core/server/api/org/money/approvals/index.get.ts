/**
 * GET /api/org/money/approvals?orgId=&view=open|awaiting-me|all — the
 * community's money approvals with their subject, the rule's view now and
 * `canDecide` for the caller (money:read: every board seat, admins).
 * docs/spec-money-approvals.md.
 */
export default defineEventHandler(async (event) => {
  // The reads below need only the org, so they start while the money:read check
  // runs; nothing is returned or described until it passes.
  const queryView = String(getQuery(event).view || "open");
  const queryOrg = String(getQuery(event).orgId ?? "");
  const early =
    queryOrg && ["open", "awaiting-me", "all"].includes(queryView)
      ? Promise.all([
          loadApprovals(queryOrg, queryView === "all" ? {} : { state: { _in: [...OPEN_STATES] } }),
          loadCurrentSeats(queryOrg),
        ])
      : null;
  early?.catch(() => {});
  const orgId = await requireMoneyRead(event);
  const session = await getUserSession(event);
  const userId = session?.user?.id ? String(session.user.id) : null;
  const view = String(getQuery(event).view || "open");
  if (!["open", "awaiting-me", "all"].includes(view)) throw createError({ statusCode: 400, message: "view is open, awaiting-me or all" });

  // The approvals and the board seats need only the org: one round trip.
  const [rows, seats] = await (early ?? Promise.all([
    loadApprovals(orgId, view === "all" ? {} : { state: { _in: [...OPEN_STATES] } }),
    loadCurrentSeats(orgId),
  ]));
  const items = await describeApprovals(orgId, rows.slice(0, moneyLimit(event, 200)), userId, seats);
  const open = items.filter((i) => i.state === "pending" || i.state === "cannot_approve");
  return {
    approvals: view === "all" ? items : view === "awaiting-me" ? open.filter((i) => i.canDecide) : open,
    awaitingMe: open.filter((i) => i.canDecide).length,
  };
});
