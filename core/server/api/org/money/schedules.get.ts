/**
 * GET /api/org/money/schedules?orgId=&limit= — the community's recurring
 * charges, read-only, for admins and board seats (requireMoneyRead).
 */
import { readItems } from "@directus/sdk";

const FIELDS = [
  "id", "title", "status", "amount", "frequency", "start_date",
  "next_payment_date", "total_payments_generated",
  "member.id", "member.first_name", "member.last_name",
];

export default defineEventHandler(async (event) => {
  const orgId = await requireMoneyRead(event);
  const rows = await getTypedDirectus().request(
    readItems("payment_schedules", {
      fields: FIELDS as any,
      filter: { organization: { _eq: orgId } } as any,
      sort: ["-date_created"] as any,
      limit: moneyLimit(event, 200),
    })
  );
  return { schedules: numericMoney(rows, ["amount"]) };
});
