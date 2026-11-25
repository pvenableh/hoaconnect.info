/**
 * GET /api/org/money/approvals/[id]?orgId= — one approval: its decisions, who
 * it waits on, who is excluded, and `canDecide` for the caller (money:read).
 *
 * The list route's four reads narrowed to this approval (readApprovalList), so
 * the approval, its subject, its decisions, the seats, the names and the
 * money:read answer all come back in one round trip. Directus serves
 * concurrent reads nearly in turn, so reads saved are time saved. 403 comes
 * before 404: nobody without money:read learns whether an id exists.
 */
export default defineEventHandler(async (event) => {
  const orgId = String(getQuery(event).orgId ?? "");
  if (!orgId) await requireMoneyRead(event); // 401, then 400
  const session = await requireUserSession(event);
  const id = String(getRouterParam(event, "id") || "");
  const list = await readApprovalList(orgId, { id: { _eq: id } });
  await requireMoneyReadFrom(event, list.members, list.seats);
  const approval = list.rows[0];
  if (!approval) throw createError({ statusCode: 404, message: "No such approval in this community." });
  const [item] = await describeApprovals(orgId, [approval], session?.user?.id ? String(session.user.id) : null, list.seats, list);
  return { approval: item };
});
