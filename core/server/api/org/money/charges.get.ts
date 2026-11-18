/**
 * GET /api/org/money/charges?orgId=&limit=&view= — every charge in the
 * community, read-only, for admins and board seats (requireMoneyRead).
 * `view=glance` keeps what the home Money glance counts: paid charges with a
 * date, and anything still open.
 *
 * Each row says whether a waiver of it is awaiting approval
 * (`waiver_pending`), and `viewer.canEnter` whether the caller may ask for
 * one (money:enter): the page shows "Ask to waive" only then.
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
  const charges = numericMoney(rows, ["amount", "amount_paid", "amount_remaining"]) as Array<Record<string, any>>;
  const [canEnter, waivers] = glance
    ? [false, [] as ApprovalRow[]]
    : await Promise.all([canEnterMoney(event, orgId), loadApprovals(orgId, { kind: { _eq: "waive" }, state: { _in: [...OPEN_STATES] } })]);
  const pending = new Set(waivers.map((a) => a.charge).filter(Boolean));
  return {
    charges: glance ? charges : charges.map((c) => ({ ...c, waiver_pending: pending.has(String(c.id)) })),
    viewer: { canEnter },
  };
});
