/**
 * GET /api/org/money/charges?orgId=&limit=&view= — every charge in the
 * community, read-only, for admins and board seats (requireMoneyRead).
 * `view=glance` keeps what the home Money glance counts: paid charges with a
 * date, and anything still open.
 */
import { readItems } from "@directus/sdk";

const FIELDS = [
  "id", "title", "status", "request_type", "amount", "amount_paid",
  "amount_remaining", "due_date", "paid_at", "date_created",
  "member.id", "member.first_name", "member.last_name",
];

export default defineEventHandler(async (event) => {
  const orgId = await requireMoneyRead(event);
  const glance = getQuery(event).view === "glance";
  const filter: Record<string, unknown> = { organization: { _eq: orgId } };
  if (glance) filter._or = [{ paid_at: { _nnull: true } }, { status: { _nin: ["paid", "canceled"] } }];
  const rows = await getTypedDirectus().request(
    readItems("payment_requests", {
      fields: FIELDS as any,
      filter: filter as any,
      sort: ["-date_created"] as any,
      limit: moneyLimit(event, 200),
    })
  );
  return { charges: rows ?? [] };
});
