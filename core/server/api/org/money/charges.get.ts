/**
 * GET /api/org/money/charges?orgId=&limit=&view= — every charge in the
 * community, read-only, for admins and board seats (requireMoneyRead).
 * `view=glance` keeps what the home Money glance counts: paid charges with a
 * date, and anything still open.
 *
 * Each row says what may be done to it now (docs/spec-charge-corrections.md),
 * decided here by the same pure rules the routes use, so the page shows only
 * what the server will accept:
 *
 *   approval_pending   { kind: waive | move, amount } while one awaits the
 *                      board, else null (`waiver_pending` kept for a waive)
 *   late_fees_open     what its unpaid late fees come to
 *   withdrawable       inside the 24-hour withdraw window
 *   movable            nothing paid on it or its late fees, nothing waiting
 *   due_date_lock      why its due date cannot change now, or null
 *   withdrawn_by_name  who withdrew it, when it was
 *
 * `viewer.canEnter` (money:enter) shows Ask to Waive and Move;
 * `viewer.canCorrect` (admins) shows Edit and Withdraw. None of it for
 * `view=glance`. The reminder metadata the rules read is not returned.
 */
import { readItems } from "@directus/sdk";
import { dueDateLock, moveRefusal, openLateFeesTotal, withdrawRefusal } from "#core/shared/money/charge-corrections";
import { todayUtc } from "#core/shared/roles/role-context";

const FIELDS = [
  "id", "title", "status", "request_type", "amount", "amount_paid",
  "amount_remaining", "due_date", "paid_at", "date_created",
  "member.id", "member.first_name", "member.last_name",
];
const CORRECTION_READ = [
  "source", "description", "notes", "reminder_sent", "metadata",
  "withdrawn_at", "withdrawn_by", "withdrawn_reason",
];

export default defineEventHandler(async (event) => {
  const orgId = await requireMoneyRead(event);
  const glance = getQuery(event).view === "glance";
  const filter: Record<string, unknown> = { organization: { _eq: orgId } };
  if (glance) filter._or = [{ paid_at: { _nnull: true } }, { status: { _nin: ["paid", "canceled"] } }];
  const rows = await getTypedDirectus().request(
    readItems("payment_requests", {
      fields: (glance ? FIELDS : [...FIELDS, ...CORRECTION_READ]) as any,
      filter: filter as any,
      sort: ["-date_created"] as any,
      limit: moneyLimit(event, 200),
    })
  );
  const charges = numericMoney(rows, ["amount", "amount_paid", "amount_remaining"]) as Array<Record<string, any>>;
  if (glance) return { charges, viewer: { canEnter: false, canCorrect: false } };

  const ids = charges.map((c) => String(c.id));
  const [canEnter, admin, open, fees, paid] = await Promise.all([
    canEnterMoney(event, orgId),
    checkAdminAccess(event, orgId),
    loadApprovals(orgId, { kind: { _in: [...CHARGE_APPROVAL_KINDS] }, state: { _in: [...OPEN_STATES] } }),
    lateFeesOf(orgId, ids),
    chargesWithPayments(ids),
  ]);
  const pending = new Map(open.filter((a) => a.charge).map((a) => [String(a.charge), a]));
  const names = await namesFor(orgId, charges.map((c) => c.withdrawn_by as string | null));
  const now = new Date();
  const today = todayUtc();

  return {
    charges: charges.map(({ metadata, reminder_sent, source, ...c }) => {
      const id = String(c.id);
      const approval = pending.get(id) ?? null;
      const facts = factsOf({ ...c, metadata, reminder_sent, source }, { lateFees: fees.get(id) ?? [], hasTransactions: paid.has(id), approvalOpen: !!approval });
      return {
        ...c,
        waiver_pending: approval?.kind === "waive",
        approval_pending: approval ? { kind: approval.kind, amount: approval.amount } : null,
        late_fees_open: openLateFeesTotal(facts),
        withdrawable: withdrawRefusal(facts, now) === null,
        movable: moveRefusal(facts) === null,
        due_date_lock: dueDateLock(facts, today),
        withdrawn_by_name: c.withdrawn_by ? names.get(String(c.withdrawn_by)) ?? null : null,
      };
    }),
    viewer: { canEnter, canCorrect: !!admin.isAdmin },
  };
});
