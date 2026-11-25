/**
 * GET /api/org/money/approvals?orgId=&view=open|awaiting-me|all — the
 * community's money approvals with their subject, the rule's view now and
 * `canDecide` for the caller (money:read: every board seat, admins).
 * docs/spec-money-approvals.md.
 */
export default defineEventHandler(async (event) => {
  const view = String(getQuery(event).view || "open");
  if (!["open", "awaiting-me", "all"].includes(view)) {
    await requireMoneyRead(event);
    throw createError({ statusCode: 400, message: "view is open, awaiting-me or all" });
  }
  // The list's four reads (approvals, decisions, memberships with their board
  // terms, owed late fees) need only the org, and the memberships and seats
  // they return answer money:read too, so the check costs no reads of its own
  // (Directus serves concurrent reads nearly in turn: each one adds to the
  // wait). Nothing is described or returned until the check passes.
  const queryOrg = String(getQuery(event).orgId ?? "");
  if (!queryOrg) await requireMoneyRead(event); // 401, then 400
  const session = await requireUserSession(event);
  const userId = session?.user?.id ? String(session.user.id) : null;
  const list = await readApprovalList(queryOrg, view === "all" ? {} : { state: { _in: [...OPEN_STATES] } });
  await requireMoneyReadFrom(event, list.members, list.seats);

  const items = await describeApprovals(queryOrg, list.rows.slice(0, moneyLimit(event, 200)), userId, list.seats, list);
  const open = items.filter((i) => i.state === "pending" || i.state === "cannot_approve");
  return {
    approvals: view === "all" ? items : view === "awaiting-me" ? open.filter((i) => i.canDecide) : open,
    awaitingMe: open.filter((i) => i.canDecide).length,
  };
});
