/**
 * GET /api/org/money/schedules?orgId=&limit= — the community's recurring
 * charges, read-only, for admins and board seats (requireMoneyRead).
 *
 * One Directus request (readItemsBatch): the schedules and the memberships
 * that answer money:read (moneyAccessFrom). Nothing is returned until it passes.
 */
const FIELDS = [
  "id", "title", "status", "amount", "frequency", "start_date",
  "next_payment_date", "total_payments_generated",
  "member.id", "member.first_name", "member.last_name",
];

export default defineEventHandler(async (event) => {
  const orgId = String(getQuery(event).orgId ?? "");
  if (!orgId) await requireMoneyRead(event); // 401, then 400
  await requireUserSession(event);
  const read = await readItemsBatch({
    schedules: {
      collection: "payment_schedules",
      fields: FIELDS,
      filter: { organization: { _eq: orgId } },
      sort: ["-date_created"],
      limit: moneyLimit(event, 200),
    },
    members: orgMembersSpec(orgId),
  });
  await requireMoneyReadFrom(event, read.members, seatsOfMembers(read.members, orgId));
  return { schedules: numericMoney(read.schedules, ["amount"]) };
});
