/**
 * What the Approvals page reads (docs/spec-money-approvals.md): each
 * approval with its subject, the rule's view now, who has decided, who it
 * waits on, who is excluded, and `canDecide` for the caller. `canDecide` is
 * for showing the buttons only: POST .../decide checks the rule again and
 * never reads it from the client.
 *
 * Reads never write. An open approval whose board changed under it reads as
 * it is stored until the board change settles it (resettleCommunity).
 */
import type { Seat } from "#core/shared/money/approval-rule";
import { OFFICE_LABELS, progressLabel } from "#core/shared/money/approval-rule";
import { readItems } from "@directus/sdk";
import { openLateFeesTotal, type LateFeeFacts } from "#core/shared/money/charge-corrections";
import { namesByUser } from "#core/shared/members/display-name";

const person = (id: string, names: Map<string, string>, seats: readonly Seat[]) => {
  const { label } = officeLabelOf(seats, id);
  return { userId: id, name: names.get(id) ?? "A board member", office: label };
};

async function gatherByIds(orgId: string, approvals: ApprovalRow[], seatsArg?: readonly Seat[]): Promise<Gathered> {
  // Every read below depends only on the approvals and the org, never on each
  // other, so they go out in one round trip. The names of the people already
  // known (requesters, exclusions, seats) ride in that trip too; only a
  // decider outside them needs a second read, after the decisions.
  const expenseIds = [...new Set(approvals.map((a) => a.expense).filter((x): x is string => !!x))];
  // A waiver's charge names a household: these routes are money:read only
  // (every board seat, admins), the people who read the charges already.
  const chargeIds = [...new Set(approvals.map((a) => a.charge).filter((x): x is string => !!x))];
  const householdIds = [
    ...new Set(approvals.flatMap((a) => (a.kind === "move" ? [a.proposed?.member, a.proposed?.from_member] : [])).filter((x): x is string => !!x)),
  ];
  const seatsRead = seatsArg ? Promise.resolve(seatsArg) : loadCurrentSeats(orgId);
  const known = new Set<string>();
  for (const a of approvals) {
    if (a.requested_by) known.add(a.requested_by);
    a.excluded.forEach((u) => known.add(u));
  }
  const knownNames = seatsRead.then((rows) => {
    const ids = new Set(known);
    rows.forEach((s) => ids.add(s.userId));
    return namesFor(orgId, ids).then((names) => ({ ids, names }));
  });
  const [seats, decisions, expenses, charges, feesByCharge, households, first] = await Promise.all([
    seatsRead,
    loadDecisions(approvals.map((a) => a.id)),
    expenseIds.length
      ? getTypedDirectus()
          .request(
            readItems("payment_expenses", {
              filter: { id: { _in: expenseIds }, organization: { _eq: orgId } } as any,
              fields: ["id", "title", "vendor", "amount", "status", "category", "paid_without_approval", "expense_date"] as any,
              limit: -1,
            })
          )
          .then((r) => ((r ?? []) as any[]))
      : Promise.resolve([] as any[]),
    chargeIds.length
      ? getTypedDirectus()
          .request(
            readItems("payment_requests", {
              filter: { id: { _in: chargeIds }, organization: { _eq: orgId } } as any,
              fields: ["id", "title", "amount", "amount_remaining", "status", "member.first_name", "member.last_name", "member.email"] as any,
              limit: -1,
            })
          )
          .then((r) => ((r ?? []) as any[]))
      : Promise.resolve([] as any[]),
    // A full waiver takes its charge's unpaid late fees; a move names both households.
    lateFeesOf(orgId, chargeIds),
    householdIds.length
      ? getTypedDirectus()
          .request(
            readItems("hoa_members", {
              filter: { id: { _in: householdIds }, organization: { _eq: orgId } } as any,
              fields: ["id", "first_name", "last_name", "email"] as any,
              limit: -1,
            })
          )
          .then((r) => ((r ?? []) as any[]))
      : Promise.resolve([] as any[]),
    knownNames,
  ]);
  const expenseById = new Map(expenses.map((e) => [String(e.id), e]));
  const chargeById = new Map(charges.map((c) => [String(c.id), c]));
  const householdName = new Map(households.map((m) => [String(m.id), chargeHousehold(m)]));

  const stray = new Set<string>();
  for (const list of decisions.values()) for (const d of list) if (d.decided_by && !first.ids.has(d.decided_by)) stray.add(d.decided_by);
  const names = stray.size ? new Map([...first.names, ...(await namesFor(orgId, stray))]) : first.names;

  return { seats, decisions, expenseById, chargeById, feesByCharge, householdName, names };
}

/** The same facts from `readApprovalList`; only a full waiver's late fees still need a read of their own. */
async function gatherFromList(approvals: ApprovalRow[], list: ApprovalList): Promise<Gathered> {
  const fullWaiverCharges = [...new Set(approvals.filter((a) => a.kind === "waive" && a.amount == null).map((a) => a.charge).filter((x): x is string => !!x))];
  const feesByCharge = new Map(fullWaiverCharges.flatMap((c) => (list.owedLateFees.has(c) ? [[c, list.owedLateFees.get(c)!] as const] : [])));
  const householdName = new Map(list.members.map((m) => [String(m.id), chargeHousehold(m)]));
  const names = namesByUser(list.members.filter((m) => !!m.user));
  return { seats: list.seats, decisions: list.decisions, expenseById: list.expenseById, chargeById: list.chargeById, feesByCharge, householdName, names };
}

/** Everything `describeApprovals` reads besides the approvals themselves. */
interface Gathered {
  seats: readonly Seat[];
  decisions: Map<string, DecisionRow[]>;
  expenseById: Map<string, any>;
  chargeById: Map<string, any>;
  feesByCharge: Map<string, LateFeeFacts[]>;
  householdName: Map<string, string | null>;
  names: Map<string, string>;
}

const EXPENSE_NESTED = [
  "expense.id", "expense.organization", "expense.title", "expense.vendor", "expense.amount", "expense.status",
  "expense.category", "expense.paid_without_approval", "expense.expense_date",
] as const;
const CHARGE_NESTED = [
  "charge.id", "charge.organization", "charge.title", "charge.amount", "charge.amount_remaining", "charge.status",
  "charge.member.first_name", "charge.member.last_name", "charge.member.email",
] as const;

/** What the list route starts from the org alone, in one round trip (see `readApprovalList`). */
export interface ApprovalList {
  rows: ApprovalRow[];
  seats: Seat[];
  decisions: Map<string, DecisionRow[]>;
  expenseById: Map<string, any>;
  chargeById: Map<string, any>;
  members: any[];
  /** Late fees with something still owed, by charge: a full waiver's cost, read without waiting for its charge. */
  owedLateFees: Map<string, LateFeeFacts[]>;
}

/**
 * The approvals, every decision, every membership with its board terms, each
 * approval's expense/charge subject and the late fees still owed, all started
 * at once from the org: none of them needs another's answer. They go as ONE
 * request (readItemsBatch, GraphQL): Directus spends ~40ms of CPU on each
 * authenticated request and serves them in turn, so four REST reads take
 * ~230ms where one batch takes ~105ms.
 * The subjects ride in the approvals read as nested fields; the decisions are
 * filtered by their approval's community instead of by id; the names, the
 * households and the board seats (`seatsOfMembers`, loadCurrentSeats' rule)
 * come from one read of the community's memberships, whose `role` also lets
 * the route answer money:read without reads of its own (moneyReadFromList).
 * `describeApprovals` picks out what the page shows.
 */
export async function readApprovalList(orgId: string, approvalFilter: Record<string, unknown>): Promise<ApprovalList> {
  const read = await readItemsBatch({
    approvals: {
      collection: "money_approvals",
      filter: { organization: { _eq: orgId }, ...approvalFilter },
      fields: [...APPROVAL_FIELDS, ...EXPENSE_NESTED, ...CHARGE_NESTED],
      sort: ["-date_created"],
      limit: -1,
    },
    decisions: {
      collection: "money_approval_decisions",
      filter: orgDecisionsFilter(orgId, approvalFilter),
      fields: DECISION_FIELDS,
      sort: ["date_created"],
      limit: -1,
    },
    // The seats and the money:read answer come from these rows.
    members: {
      collection: "hoa_members",
      filter: { organization: { _eq: orgId } },
      fields: ["id", "user", "first_name", "last_name", "email", "status", "role", ...MEMBER_TERM_FIELDS],
      deep: { board_member_terms: { _filter: { status: { _eq: "published" } }, _limit: -1 } },
      limit: -1,
    },
    lateFees: { collection: "payment_requests", filter: owedLateFeesFilter(orgId), fields: LATE_FEE_FIELDS, limit: -1 },
  });
  const raw = read.approvals;
  const members = read.members;
  const decisions = decisionsByApproval(read.decisions);
  const owedLateFees = lateFeesByCharge(read.lateFees);
  const seats = seatsOfMembers(members, orgId);
  // The subject must be the community's own, as the id-filtered reads required.
  const expenseById = new Map<string, any>();
  const chargeById = new Map<string, any>();
  for (const r of raw) {
    const e = r.expense && typeof r.expense === "object" ? r.expense : null;
    if (e && String(e.organization?.id ?? e.organization ?? "") === orgId) expenseById.set(String(e.id), e);
    const c = r.charge && typeof r.charge === "object" ? r.charge : null;
    if (c && String(c.organization?.id ?? c.organization ?? "") === orgId) chargeById.set(String(c.id), c);
  }
  const rows = raw.map(normaliseApproval).filter((a) => a.organization === orgId);
  return { rows, seats, decisions, expenseById, chargeById, members, owedLateFees };
}

export async function describeApprovals(
  orgId: string,
  approvals: ApprovalRow[],
  userId: string | null,
  seatsArg?: readonly Seat[],
  list?: ApprovalList
) {
  const g = list ? await gatherFromList(approvals, list) : await gatherByIds(orgId, approvals, seatsArg);
  const { seats, decisions, expenseById, chargeById, feesByCharge, householdName, names } = g;

  return approvals.map((a) => {
    const own = decisions.get(a.id) ?? [];
    const view = readViewOf(a, seats, own);
    const e = a.expense ? expenseById.get(a.expense) : null;
    const c = a.charge ? chargeById.get(a.charge) : null;
    return {
      id: a.id,
      kind: a.kind,
      round: a.round,
      state: view.state,
      mode: view.mode,
      needed: view.needed,
      approvals: view.approvals,
      rejections: view.rejections,
      remaining: view.remaining,
      progress: progressLabel(view),
      smallBoard: view.smallBoard,
      reason: a.reason,
      date_created: a.date_created,
      decided_at: a.decided_at,
      requested_by: a.requested_by ? { userId: a.requested_by, name: names.get(a.requested_by) ?? "Someone" } : null,
      excluded: a.excluded.map((u) => ({ userId: u, name: names.get(u) ?? "Someone" })),
      waiting_on: view.waitingOn.map((u) => person(u, names, seats)),
      decisions: own.map((d) => ({
        id: d.id,
        decision: d.decision,
        note: d.note,
        date_created: d.date_created,
        office: OFFICE_LABELS[d.office ?? ""] ?? null,
        name: d.decided_by ? names.get(d.decided_by) ?? "A board member" : "A former board member",
      })),
      subject: e
        ? {
            type: "expense" as const,
            id: String(e.id),
            title: e.title ?? "",
            vendor: e.vendor ?? null,
            amount: e.amount == null ? null : Number(e.amount),
            status: e.status ?? null,
            paid_without_approval: e.paid_without_approval === true,
          }
        : c
          ? {
              type: "charge" as const,
              id: String(c.id),
              title: c.title ?? "",
              amount: c.amount == null ? null : Number(c.amount),
              amount_remaining: c.amount_remaining == null ? null : Number(c.amount_remaining),
              status: c.status ?? null,
              household: chargeHousehold(c.member),
              // A partial waiver's cut; null for all that remains.
              waive_amount: a.kind === "waive" ? a.amount : null,
              // What a full waiver would take with it, as it stands now.
              late_fees: a.kind === "waive" && a.amount == null ? openLateFeesTotal({ lateFees: feesByCharge.get(String(c.id)) ?? [] }) : 0,
              move:
                a.kind === "move"
                  ? {
                      from: householdName.get(a.proposed?.from_member ?? "") ?? null,
                      to: householdName.get(a.proposed?.member ?? "") ?? null,
                    }
                  : null,
            }
          : null,
      canDecide: callerCanDecide(a, view, userId),
    };
  });
}

export type ApprovalItem = Awaited<ReturnType<typeof describeApprovals>>[number];
