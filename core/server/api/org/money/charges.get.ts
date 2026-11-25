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
 *
 * One Directus request (readItemsBatch), since Directus serves requests in
 * turn: the charges, each with whether a payment was recorded against it
 * (the `transactions` alias), the community's memberships (seats, names, and
 * who may read, enter and correct: moneyAccessFrom), its open waivers and
 * moves, and its late fees, looked up by charge as lateFeesOf would. Nothing
 * is described or returned until money:read passes.
 */
import { dueDateLock, moveRefusal, openLateFeesTotal, withdrawRefusal } from "#core/shared/money/charge-corrections";
import { namesByUser } from "#core/shared/members/display-name";
import { normaliseApproval } from "#core/server/utils/money-approvals";
import { todayUtc } from "#core/shared/roles/role-context";

const FIELDS = [
  "id", "title", "status", "request_type", "amount", "amount_paid",
  "amount_remaining", "due_date", "paid_at", "date_created",
  "member.id", "member.first_name", "member.last_name",
];
const CORRECTION_READ = [
  "source", "description", "notes", "reminder_sent", "metadata",
  "withdrawn_at", "withdrawn_by", "withdrawn_reason",
  // chargesWithPayments' question, asked with the charge: a succeeded or refunded payment.
  "transactions.status",
];
const PAID = ["succeeded", "refunded"];

export default defineEventHandler(async (event) => {
  const orgId = String(getQuery(event).orgId ?? "");
  if (!orgId) await requireMoneyRead(event); // 401, then 400
  await requireUserSession(event);
  const glance = getQuery(event).view === "glance";
  const filter: Record<string, unknown> = { organization: { _eq: orgId } };
  if (glance) filter._or = [{ paid_at: { _nnull: true } }, { status: { _nin: ["paid", "canceled"] } }];
  const charges = {
    collection: "payment_requests",
    fields: glance ? FIELDS : [...FIELDS, ...CORRECTION_READ],
    filter,
    sort: ["-date_created"],
    limit: moneyLimit(event, 200),
    ...(glance ? {} : { deep: { transactions: { _filter: { status: { _in: PAID } }, _limit: 1 } } }),
  };
  const members = orgMembersSpec(orgId);
  const read = glance
    ? { ...(await readItemsBatch({ charges, members })), open: [] as any[], fees: [] as any[] }
    : await readItemsBatch({
        charges,
        members,
        open: {
          collection: "money_approvals",
          fields: APPROVAL_FIELDS,
          filter: { organization: { _eq: orgId }, kind: { _in: [...CHARGE_APPROVAL_KINDS] }, state: { _in: [...OPEN_STATES] } },
          sort: ["-date_created"],
          limit: -1,
        },
        fees: {
          collection: "payment_requests",
          fields: LATE_FEE_FIELDS,
          filter: { organization: { _eq: orgId }, request_type: { _eq: "late_fee" } },
          limit: -1,
        },
      });
  const access = await requireMoneyReadFrom(event, read.members, seatsOfMembers(read.members, orgId));

  const rows = numericMoney(read.charges, ["amount", "amount_paid", "amount_remaining"]) as Array<Record<string, any>>;
  if (glance) return { charges: rows, viewer: { canEnter: false, canCorrect: false } };

  const open = read.open.map(normaliseApproval).filter((a) => a.organization === orgId);
  const pending = new Map(open.filter((a) => a.charge).map((a) => [String(a.charge), a]));
  const fees = lateFeesByCharge(read.fees);
  const names = namesByUser(read.members.filter((m) => !!m.user));
  const now = new Date();
  const today = todayUtc();

  return {
    charges: rows.map(({ metadata, reminder_sent, source, transactions, ...c }) => {
      const id = String(c.id);
      const approval = pending.get(id) ?? null;
      // `deep` narrows the read; the status is checked here too, so the answer never rests on it.
      const hasTransactions = Array.isArray(transactions) && transactions.some((t: any) => PAID.includes(t?.status));
      const facts = factsOf({ ...c, metadata, reminder_sent, source }, { lateFees: fees.get(id) ?? [], hasTransactions, approvalOpen: !!approval });
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
    viewer: { canEnter: access.canEnter, canCorrect: access.isAdmin },
  };
});
