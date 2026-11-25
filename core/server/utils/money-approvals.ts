/**
 * Money approvals on the server (docs/spec-money-approvals.md): the seats the
 * rule reads, an approval's view for a caller, opening and settling a round,
 * and who is told. The routes in core/server/api/org/expenses and
 * core/server/api/org/money call these; nothing else writes the two
 * collections, and no Directus policy does either.
 *
 * Reads and writes use the app's token, always filtered by the community.
 */
import { createItem, readItems, updateItem } from "@directus/sdk";
import {
  canDecide,
  evaluateApproval,
  officeOf,
  OFFICE_LABELS,
  type Decision,
  type RuleView,
  type Seat,
} from "#core/shared/money/approval-rule";
import { isCurrentBoardTerm, todayUtc } from "#core/shared/roles/role-context";
import { applyCut, moveRefusal, openLateFees, openLateFeesTotal, remainingCents, fromCents } from "#core/shared/money/charge-corrections";
import {
  waiverPhrase,
  movePhrase,
  buildChargeMovedEntry,
  formatMoney,
  formatDay,
  buildChargeWaivedEntry,
  buildExpenseApprovedEntry,
  buildExpenseVoidedEntry,
  chargePhrase,
  expensePhrase,
  nameWithOffice,
  type ChargeSubject,
  type ExpenseSubject,
} from "#core/shared/ledger/entries";
import type { LedgerActor } from "#core/shared/ledger/entry";
import { roleIdOf } from "#core/shared/ops/permissions";
import type { ReadSpec } from "./directus-graphql";
import { expenseCommunity } from "#core/shared/expenses/expense-writes";
import { ledgerActorFor } from "./member-names";
import { orgName } from "./org-name";
import type { H3Event } from "h3";

export type ApprovalKind = "spend" | "void" | "waive" | "move";
export type StoredState = "pending" | "approved" | "rejected" | "cannot_approve" | "superseded";

export interface ApprovalRow {
  id: string;
  organization: string;
  kind: ApprovalKind;
  expense: string | null;
  charge: string | null;
  round: number;
  state: StoredState;
  mode: string | null;
  needed: number | null;
  requested_by: string | null;
  excluded: string[];
  reason: string | null;
  date_created: string | null;
  decided_at: string | null;
  /** A partial waiver's cut; null for all that remains (docs/spec-charge-corrections.md). */
  amount: number | null;
  /** A move's change: { member, unit, from_member, from_unit }. */
  proposed: Record<string, string | null> | null;
}

export interface DecisionRow {
  id: string;
  approval: string;
  decided_by: string | null;
  office: string | null;
  decision: "approve" | "reject";
  note: string | null;
  date_created: string | null;
}

export const APPROVAL_FIELDS = [
  "id", "organization", "kind", "expense", "charge", "round", "state", "mode", "needed",
  "requested_by", "excluded", "reason", "date_created", "decided_at", "amount", "proposed",
] as const;
export const DECISION_FIELDS = ["id", "approval", "decided_by", "office", "decision", "note", "date_created"] as const;
export const EXPENSE_SUBJECT_FIELDS = [
  "id", "organization", "title", "vendor", "amount", "category", "status", "entered_by", "approval",
  "paid_by", "paid_date", "paid_reference", "paid_without_approval", "void_reason",
  "notes", "description", "expense_date", "receipt", "project.id", "project.title", "project.organization",
] as const;

/** The states an approval can still be decided in. `cannot_approve` reopens when the board changes. */
export const OPEN_STATES: readonly StoredState[] = ["pending", "cannot_approve"];
export const isOpen = (state: unknown) => OPEN_STATES.includes(state as StoredState);

const idOf = (v: unknown): string | null => roleIdOf(v as never) ?? null;
const asIds = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x) : []);

export function normaliseApproval(row: any): ApprovalRow {
  return {
    id: String(row.id),
    organization: idOf(row.organization) ?? "",
    kind: row.kind,
    expense: idOf(row.expense),
    charge: idOf(row.charge),
    round: Number(row.round ?? 1),
    state: row.state ?? "pending",
    mode: row.mode ?? null,
    needed: row.needed == null ? null : Number(row.needed),
    requested_by: idOf(row.requested_by),
    excluded: asIds(row.excluded),
    reason: row.reason ?? null,
    date_created: row.date_created ?? null,
    decided_at: row.decided_at ?? null,
    amount: row.amount == null || row.amount === "" ? null : Number(row.amount),
    proposed: row.proposed && typeof row.proposed === "object" ? (row.proposed as Record<string, string | null>) : null,
  };
}

function normaliseDecision(row: any): DecisionRow {
  return {
    id: String(row.id),
    approval: idOf(row.approval) ?? "",
    decided_by: idOf(row.decided_by),
    office: row.office ?? null,
    decision: row.decision,
    note: row.note ?? null,
    date_created: row.date_created ?? null,
  };
}

/**
 * The community's board seats today: published, current-term
 * `hoa_board_members` rows (isCurrentBoardTerm) whose membership is active
 * and has a login. One row per term; the rule counts a person once.
 */
export async function loadCurrentSeats(orgId: string, today = todayUtc()): Promise<Seat[]> {
  const rows = ((await getTypedDirectus().request(
    readItems("hoa_board_members", {
      filter: {
        status: { _eq: "published" },
        hoa_member: { organization: { _eq: orgId }, status: { _eq: "active" } },
      } as any,
      fields: ["title", "status", "term_start", "term_end", "hoa_member.user", "hoa_member.organization"] as any,
      limit: -1,
    })
  )) ?? []) as any[];
  return rows
    .filter((r) => isCurrentBoardTerm(r, today) && idOf(r.hoa_member?.organization) === orgId)
    .map((r) => ({ userId: idOf(r.hoa_member?.user) ?? "", office: r.title ?? null }))
    .filter((s) => !!s.userId);
}

/** The board terms to nest in a `hoa_members` read for `seatsOfMembers`. */
export const MEMBER_TERM_FIELDS = [
  "board_member_terms.title", "board_member_terms.status", "board_member_terms.term_start", "board_member_terms.term_end",
] as const;

/**
 * The community's memberships, every status, as one batch read
 * (readItemsBatch): names and households, the board seats (seatsOfMembers)
 * and who may read and enter money (moneyAccessFrom), all from the same rows.
 */
export function orgMembersSpec(orgId: string): ReadSpec {
  return {
    collection: "hoa_members",
    filter: { organization: { _eq: orgId } },
    fields: ["id", "user", "first_name", "last_name", "email", "status", "role", "manager_permissions", ...MEMBER_TERM_FIELDS],
    deep: { board_member_terms: { _filter: { status: { _eq: "published" } }, _limit: -1 } },
    limit: -1,
  };
}

/**
 * loadCurrentSeats' answer from the community's memberships read with
 * MEMBER_TERM_FIELDS nested: an active membership with a login, one seat per
 * current published term.
 */
export function seatsOfMembers(members: readonly any[], orgId: string, today = todayUtc()): Seat[] {
  return members
    .filter((m) => m?.status === "active" && !!idOf(m.user) && (idOf(m.organization) ?? orgId) === orgId)
    .flatMap((m) =>
      ((m.board_member_terms ?? []) as any[])
        .filter((t) => t && typeof t === "object" && isCurrentBoardTerm(t, today))
        .map((t) => ({ userId: idOf(m.user)!, office: t.title ?? null }))
    );
}

export async function loadApprovals(orgId: string, filter: Record<string, unknown> = {}): Promise<ApprovalRow[]> {
  return (await readApprovalRows(orgId, filter)).map(normaliseApproval).filter((a) => a.organization === orgId);
}

/** The raw rows, with any extra (nested) fields a caller wants read in the same trip. */
export async function readApprovalRows(orgId: string, filter: Record<string, unknown> = {}, extraFields: readonly string[] = []): Promise<any[]> {
  return ((await getTypedDirectus().request(
    readItems("money_approvals" as any, {
      filter: { organization: { _eq: orgId }, ...filter } as any,
      fields: [...APPROVAL_FIELDS, ...extraFields] as any,
      sort: ["-date_created"] as any,
      limit: -1,
    })
  )) ?? []) as any[];
}

/** One approval, 404 unless it is the community's. */
export async function loadApproval(orgId: string, id: string): Promise<ApprovalRow> {
  const [row] = await loadApprovals(orgId, { id: { _eq: id } });
  if (!row) throw createError({ statusCode: 404, message: "No such approval in this community." });
  return row;
}

export async function loadDecisions(approvalIds: readonly string[]): Promise<Map<string, DecisionRow[]>> {
  if (!approvalIds.length) return new Map();
  return readDecisions({ approval: { _in: [...approvalIds] } });
}

/** Every decision on the community's approvals (narrowed by `approvalFilter`), without waiting to know their ids. */
export async function loadOrgDecisions(orgId: string, approvalFilter: Record<string, unknown> = {}): Promise<Map<string, DecisionRow[]>> {
  return readDecisions(orgDecisionsFilter(orgId, approvalFilter));
}

/** loadOrgDecisions' filter, for a caller that reads the rows itself (readItemsBatch). */
export const orgDecisionsFilter = (orgId: string, approvalFilter: Record<string, unknown> = {}) => ({
  approval: { organization: { _eq: orgId }, ...approvalFilter },
});

async function readDecisions(filter: Record<string, unknown>): Promise<Map<string, DecisionRow[]>> {
  const rows = ((await getTypedDirectus().request(
    readItems("money_approval_decisions" as any, {
      filter: filter as any,
      fields: [...DECISION_FIELDS] as any,
      sort: ["date_created"] as any,
      limit: -1,
    })
  )) ?? []) as any[];
  return decisionsByApproval(rows);
}

/** Decision rows (sorted by date_created) grouped by their approval. */
export function decisionsByApproval(rows: readonly any[]): Map<string, DecisionRow[]> {
  const out = new Map<string, DecisionRow[]>();
  for (const d of rows.map(normaliseDecision)) out.set(d.approval, [...(out.get(d.approval) ?? []), d]);
  return out;
}

const asRuleDecisions = (rows: readonly DecisionRow[]): Decision[] =>
  rows.filter((d) => !!d.decided_by).map((d) => ({ userId: d.decided_by!, decision: d.decision, office: d.office }));

/** The rule's view, with a settled approval's stored state. */
export type ApprovalView = Omit<RuleView, "state"> & { state: StoredState };

/**
 * What a read shows: the rule's view, except that an open approval the rule
 * now calls approved or rejected (its board changed and nothing has settled
 * it yet) still reads as stored, waiting on nobody. Reads never write; a
 * board change settles it (resettleCommunity).
 */
export function readViewOf(approval: ApprovalRow, seats: readonly Seat[], decisions: readonly DecisionRow[]): ApprovalView {
  const view = viewOf(approval, seats, decisions);
  if (isOpen(approval.state) && (view.state === "approved" || view.state === "rejected")) {
    return { ...view, state: approval.state, waitingOn: [] };
  }
  return view;
}

/**
 * The rule's view of an approval. Open: computed from the seats as they stand.
 * Closed: as it was settled, with its approvals counted from its decisions.
 */
export function viewOf(approval: ApprovalRow, seats: readonly Seat[], decisions: readonly DecisionRow[]): ApprovalView {
  const live = evaluateApproval({ seats, excluded: approval.excluded, decisions: asRuleDecisions(decisions) });
  if (isOpen(approval.state)) return live;
  const approvals = decisions.filter((d) => d.decision === "approve").length;
  const rejections = decisions.filter((d) => d.decision === "reject").length;
  const needed = approval.needed ?? live.needed;
  return { ...live, state: approval.state, needed, approvals, rejections, remaining: Math.max(0, needed - approvals), waitingOn: [] };
}

export function callerCanDecide(approval: ApprovalRow, view: ApprovalView, userId: string | null): boolean {
  return isOpen(approval.state) && canDecide(view, userId);
}

/** Names from the community's memberships, with a fallback for anyone missing. */
export async function namesFor(orgId: string, ids: Iterable<string | null | undefined>): Promise<Map<string, string>> {
  return memberNamesFor(orgId, ids);
}

/** "Jane Doe (President)" for each approve decision, in order. */
export function approverNames(decisions: readonly DecisionRow[], names: Map<string, string>): string[] {
  return decisions
    .filter((d) => d.decision === "approve" && d.decided_by)
    .map((d) => nameWithOffice(names.get(d.decided_by!) ?? "A board member", OFFICE_LABELS[d.office ?? ""] ?? null));
}

/** The expense as a ledger subject. */
export function expenseSubject(row: any): ExpenseSubject {
  return {
    expenseId: String(row.id),
    title: row.title ?? "",
    vendor: row.vendor ?? null,
    amount: row.amount,
    paidDate: row.paid_date ?? null,
    projectName: row.project && typeof row.project === "object" ? row.project.title ?? null : null,
  };
}

/** One expense of the community, 404 otherwise. */
export async function loadExpense(orgId: string, id: string): Promise<any> {
  const rows = ((await getTypedDirectus().request(
    readItems("payment_expenses", {
      filter: { id: { _eq: id }, organization: { _eq: orgId } } as any,
      fields: [...EXPENSE_SUBJECT_FIELDS] as any,
      limit: 1,
    })
  )) ?? []) as any[];
  const row = rows[0];
  // Its own organization, and its project's when it names one, must agree:
  // a row that straddles two communities is no one's (expenseCommunity).
  if (!row || expenseCommunity(row) !== orgId) throw createError({ statusCode: 404, message: "No such expense in this community." });
  return row;
}

export const CHARGE_SUBJECT_FIELDS = [
  "id", "organization", "title", "status", "amount", "amount_paid", "amount_remaining", "waiver",
  "member.id", "member.first_name", "member.last_name", "member.email", "member.organization",
] as const;

/** A charge that can still be waived: nothing settled it yet. */
export const isWaivableCharge = (status: unknown) => !["paid", "canceled"].includes(String(status ?? ""));

/**
 * One owner charge of the community, 404 otherwise. Its household must be
 * the community's too: a charge that straddles two communities is no one's.
 */
export async function loadCharge(orgId: string, id: string, extraFields: readonly string[] = []): Promise<any> {
  const rows = ((await getTypedDirectus().request(
    readItems("payment_requests", {
      filter: { id: { _eq: id }, organization: { _eq: orgId } } as any,
      fields: [...CHARGE_SUBJECT_FIELDS, ...extraFields] as any,
      limit: 1,
    })
  )) ?? []) as any[];
  const row = rows[0];
  const memberOrg = row?.member && typeof row.member === "object" ? idOf(row.member.organization) : null;
  if (!row || idOf(row.organization) !== orgId || (memberOrg && memberOrg !== orgId)) {
    throw createError({ statusCode: 404, message: "No such charge in this community." });
  }
  return row;
}

/** The household's name on a charge: "Bob Owner", else their email. */
export function chargeHousehold(member: unknown): string | null {
  if (!member || typeof member !== "object") return null;
  const m = member as { first_name?: string | null; last_name?: string | null; email?: string | null };
  return [m.first_name, m.last_name].filter(Boolean).join(" ").trim() || m.email || null;
}

/**
 * The charge as a ledger subject. With its waiver, it carries what the
 * waiver asks to give up: a partial cut, or (pass `lateFeesTotal`) the late
 * fees a full waiver takes with it.
 */
export function chargeSubject(row: any, approval?: Pick<ApprovalRow, "kind" | "amount"> | null, lateFeesTotal?: number | null): ChargeSubject {
  const partial = approval?.kind === "waive" && approval.amount != null ? approval.amount : null;
  return {
    chargeId: String(row.id),
    title: row.title ?? "",
    amount: row.amount,
    amountRemaining: row.amount_remaining ?? null,
    memberId: idOf(row.member),
    memberName: chargeHousehold(row.member),
    ...(partial != null ? { waiveAmount: partial } : {}),
    ...(partial == null && lateFeesTotal ? { lateFeesTotal } : {}),
  };
}

/** A waiver's subject, read now: a full waiver's open late fees are named in it. */
export async function waiverSubject(orgId: string, row: any, approval: Pick<ApprovalRow, "kind" | "amount">): Promise<ChargeSubject> {
  if (approval.kind !== "waive" || approval.amount != null) return chargeSubject(row, approval);
  const fees = (await lateFeesOf(orgId, [String(row.id)])).get(String(row.id)) ?? [];
  return chargeSubject(row, approval, openLateFeesTotal({ lateFees: fees }));
}

/** The open waivers on a charge. */
export async function openWaiversFor(orgId: string, chargeId: string): Promise<ApprovalRow[]> {
  return loadApprovals(orgId, { charge: { _eq: chargeId }, kind: { _eq: "waive" }, state: { _in: [...OPEN_STATES] } });
}

/** Everyone who may enter money here: admins, every board seat, managers with the projects grant. */
export async function moneyEnterUserIds(orgId: string, seats: readonly Seat[]): Promise<string[]> {
  const ids = new Set(seats.map((s) => s.userId));
  const roles = serverRoleIds();
  const rows = ((await getTypedDirectus().request(
    readItems("hoa_members", {
      filter: { organization: { _eq: orgId }, status: { _eq: "active" } } as any,
      fields: ["user", "role", "manager_permissions", "organization"] as any,
      limit: -1,
    })
  )) ?? []) as any[];
  for (const r of rows) {
    if (idOf(r.organization) !== orgId) continue;
    const role = idOf(r.role);
    const user = idOf(r.user);
    if (!user) continue;
    if (role && roles.adminRoleIds.includes(role)) ids.add(user);
    if (role && role === roles.propertyManager && r.manager_permissions?.projects === true) ids.add(user);
  }
  return [...ids];
}

/** The fields an approval row stores from the rule. */
const ruleFields = (view: Pick<RuleView, "mode" | "needed">) => ({ mode: view.mode, needed: view.needed });

/**
 * Opens a round: a new `money_approvals` row, with the rule's state, mode and
 * needs at the moment it opens. The caller links it to its subject.
 */
export async function openApproval(input: {
  orgId: string;
  kind: ApprovalKind;
  expense?: string | null;
  charge?: string | null;
  round: number;
  requestedBy: string;
  excluded: readonly string[];
  reason?: string | null;
  /** A partial waiver's cut. */
  amount?: number | null;
  /** A move's change. */
  proposed?: Record<string, string | null> | null;
  seats: readonly Seat[];
}): Promise<{ approval: ApprovalRow; view: RuleView }> {
  const excluded = [...new Set([input.requestedBy, ...input.excluded].filter(Boolean))];
  const view = evaluateApproval({ seats: input.seats, excluded, decisions: [] });
  const state: StoredState = view.state === "cannot_approve" ? "cannot_approve" : "pending";
  const row = await getTypedDirectus().request(
    createItem("money_approvals" as any, {
      organization: input.orgId,
      kind: input.kind,
      expense: input.expense ?? null,
      charge: input.charge ?? null,
      round: input.round,
      state,
      ...ruleFields(view),
      requested_by: input.requestedBy,
      excluded,
      reason: input.reason ?? null,
      amount: input.amount ?? null,
      proposed: input.proposed ?? null,
    } as any)
  );
  return { approval: normaliseApproval(row), view };
}

/**
 * A submission nobody has decided changed its amount, vendor or title: the
 * open round stays, the editor joins its excluded, and the rule is asked
 * again (excluding someone can change the mode, the need, or leave nobody).
 */
export async function amendRound(orgId: string, approval: ApprovalRow, editor: string): Promise<void> {
  if (!isOpen(approval.state) || approval.excluded.includes(editor)) return;
  const excluded = [...approval.excluded, editor];
  const view = evaluateApproval({ seats: await loadCurrentSeats(orgId), excluded, decisions: [] });
  const state: StoredState = view.state === "cannot_approve" ? "cannot_approve" : "pending";
  await getTypedDirectus().request(updateItem("money_approvals" as any, approval.id, { excluded, state, ...ruleFields(view) } as any));
}

/** Closes an open round without a decision: a new round replaced it, or its subject was voided. */
export async function supersede(approval: ApprovalRow | null, now: string): Promise<void> {
  if (!approval || !isOpen(approval.state)) return;
  await getTypedDirectus().request(updateItem("money_approvals" as any, approval.id, { state: "superseded", decided_at: now } as any));
}

/** The open approvals of one kind on an expense. */
export async function openApprovalsFor(orgId: string, expenseId: string, kind: ApprovalKind): Promise<ApprovalRow[]> {
  return loadApprovals(orgId, { expense: { _eq: expenseId }, kind: { _eq: kind }, state: { _in: [...OPEN_STATES] } });
}

/** Who the approval is waiting on: told it opened, essential (only the master email switch stops it). */
export async function notifyApprovers(input: {
  orgId: string;
  approval: ApprovalRow;
  view: Pick<RuleView, "waitingOn" | "needed"> & { readonly state: string };
  /** A spend or void's expense. */
  expense?: ExpenseSubject | null;
  /** A waiver's or a move's charge. */
  charge?: ChargeSubject | null;
  origin?: string | null;
}): Promise<void> {
  if (input.view.state !== "pending" || !input.view.waitingOn.length) return;
  const kind = input.approval.kind;
  if (kind === "waive" || kind === "move" ? !input.charge : !input.expense) return;
  const what = kind === "waive" ? waiverPhrase(input.charge!) : kind === "move" ? movePhrase(input.charge!) : expensePhrase(input.expense!);
  const lead =
    kind === "waive"
      ? `Waiving ${what} needs your approval.`
      : kind === "move"
        ? `Moving ${what} needs your approval.`
        : kind === "void"
        ? `Voiding ${what} needs your approval.`
        : `${what[0]!.toUpperCase()}${what.slice(1)} needs your approval.`;
  const round = input.approval.round > 1 ? ` It changed, so this is round ${input.approval.round}.` : "";
  await notifyUsers({
    organizationId: input.orgId,
    recipientUserIds: [...input.view.waitingOn],
    category: "payment",
    subject:
      kind === "waive"
        ? "Waiving a charge needs your approval"
        : kind === "move"
          ? "Moving a charge needs your approval"
          : kind === "void"
          ? "Voiding an expense needs your approval"
          : "Spending needs your approval",
    message: `${lead}${round}`,
    collection: "money_approvals",
    item: input.approval.id,
    path: "/approvals",
    origin: input.origin ?? null,
    essential: true,
    email: {
      bodyHtml: `<p>${escapeHtml(lead + round)}</p><p>${escapeHtml(`It needs ${input.view.needed} approvals. You can approve or reject it in HOA Connect.`)}</p>`,
      cta: { label: "Review it", path: "/approvals" },
    },
  }).catch((e) => console.error("[money-approvals] approver notice failed:", e));
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export interface SettleResult {
  state: StoredState;
  ledger: string | null;
}

/**
 * Brings a stored approval in line with the rule after a decision (or when a
 * read finds the board changed under it): records the rule's mode and needs,
 * and when it is approved or rejected, applies that to its subject, writes
 * the Ledger entry and tells the people concerned.
 */
export async function settleApproval(input: {
  orgId: string;
  approval: ApprovalRow;
  view: ApprovalView;
  decisions: readonly DecisionRow[];
  seats: readonly Seat[];
  actor: LedgerActor;
  now: string;
  origin?: string | null;
}): Promise<SettleResult> {
  const { orgId, approval, view, now } = input;
  const d = getTypedDirectus();
  if (!isOpen(approval.state)) return { state: approval.state, ledger: null };

  if (view.state === "pending" || view.state === "cannot_approve") {
    if (view.state !== approval.state || view.mode !== approval.mode || view.needed !== approval.needed) {
      await d.request(updateItem("money_approvals" as any, approval.id, { state: view.state, ...ruleFields(view) } as any));
    }
    return { state: view.state, ledger: null };
  }

  if (approval.kind === "waive") return settleWaiver(input);
  if (approval.kind === "move") return settleMove(input);
  if (!approval.expense) return { state: approval.state, ledger: null };

  const expense = await loadExpense(orgId, approval.expense);
  // A void of an expense already void (a second request that raced the first)
  // closes with nothing: a second "was voided" would be a false record.
  if (approval.kind === "void" && expense.status === "void") {
    await supersede(approval, now);
    return { state: "superseded", ledger: null };
  }
  await d.request(updateItem("money_approvals" as any, approval.id, { state: view.state, ...ruleFields(view), decided_at: now } as any));

  const subject = expenseSubject(expense);
  const names = await namesFor(orgId, input.decisions.map((x) => x.decided_by));
  const approvedBy = approverNames(input.decisions, names);
  const name = await orgName(orgId);
  let entry = null as ReturnType<typeof buildExpenseApprovedEntry> | null;

  if (approval.kind === "spend") {
    // A paid expense stays paid: its approval ratifies or rejects it, and the flag stays.
    if (expense.status === "submitted") {
      await d.request(updateItem("payment_expenses", expense.id, { status: view.state === "approved" ? "approved" : "rejected" } as any));
    }
    if (view.state === "approved") {
      entry = buildExpenseApprovedEntry({
        organizationId: orgId,
        organizationName: name,
        approvalId: approval.id,
        round: approval.round,
        expense: subject,
        approvedBy,
        ratified: expense.status === "paid",
        actor: input.actor,
        occurredAt: now,
      });
    }
  } else if (approval.kind === "void" && view.state === "approved") {
    await d.request(updateItem("payment_expenses", expense.id, { status: "void", void_reason: approval.reason } as any));
    // The open spend round, and any other void request, have nothing left to decide.
    for (const other of [...(await openApprovalsFor(orgId, expense.id, "spend")), ...(await openApprovalsFor(orgId, expense.id, "void"))]) {
      if (other.id !== approval.id) await supersede(other, now);
    }
    entry = buildExpenseVoidedEntry({
      organizationId: orgId,
      organizationName: name,
      expense: subject,
      previousStatus: String(expense.status ?? ""),
      reason: approval.reason ?? "",
      approvalId: approval.id,
      approvedBy,
      actor: input.actor,
      occurredAt: now,
    });
  }

  let ledger: string | null = null;
  if (entry) {
    try {
      ledger = await writeAuditEntry(entry);
    } catch (e) {
      console.error("[money-approvals] ledger write failed:", e);
    }
  }

  // Whoever asked; for spend, everyone who can record it paid.
  const recipients = new Set<string>(approval.requested_by ? [approval.requested_by] : []);
  if (approval.kind === "spend") for (const u of await moneyEnterUserIds(orgId, input.seats)) recipients.add(u);
  const what = expensePhrase(subject);
  const outcome = view.state === "approved" ? "approved" : "rejected";
  const message =
    approval.kind === "void"
      ? `Voiding ${what} was ${outcome}.`
      : `${what[0]!.toUpperCase()}${what.slice(1)} was ${outcome}${outcome === "approved" && expense.status !== "paid" ? " and can be recorded paid" : ""}.`;
  await notifyUsers({
    organizationId: orgId,
    recipientUserIds: [...recipients],
    category: "payment",
    subject: approval.kind === "void" ? `Void ${outcome}` : `Spending ${outcome}`,
    message,
    collection: "payment_expenses",
    item: expense.id,
    path: "/admin/expenses",
    origin: input.origin ?? null,
    excludeUserId: input.actor.userId,
  }).catch((e) => console.error("[money-approvals] outcome notice failed:", e));

  return { state: view.state, ledger };
}

/**
 * A waiver the rule decided. Approved, all of it: the charge is cancelled,
 * if nothing settled it meanwhile, with its unpaid late fees (decision 4,
 * docs/spec-charge-corrections.md). Approved, part of it: the amount and what
 * remains drop by the cut, or by what remains if payments since left less
 * (the charge is then paid); its late fees stay. Either way `charge_waived`
 * goes to the Ledger (board) and the household is told. Rejected: the charge
 * stays as it was. Whoever asked is told the outcome. A charge paid or
 * cancelled while the waiver was open closes it as superseded, with no
 * entry: there is nothing left to give up.
 */
async function settleWaiver(input: {
  orgId: string;
  approval: ApprovalRow;
  view: ApprovalView;
  decisions: readonly DecisionRow[];
  actor: LedgerActor;
  now: string;
  origin?: string | null;
}): Promise<SettleResult> {
  const { orgId, approval, view, now } = input;
  const d = getTypedDirectus();
  const charge = approval.charge ? await loadCorrectableCharge(orgId, approval.charge).catch(() => null) : null;
  if (!charge || !isWaivableCharge(charge.status)) {
    await supersede(approval, now);
    return { state: "superseded", ledger: null };
  }
  await d.request(updateItem("money_approvals" as any, approval.id, { state: view.state, ...ruleFields(view), decided_at: now } as any));

  const partial = approval.amount != null;
  const fees = (await lateFeesOf(orgId, [String(charge.id)])).get(String(charge.id)) ?? [];
  const feesOpen = partial ? [] : openLateFees({ lateFees: fees });
  const subject = chargeSubject(charge, approval, partial ? null : openLateFeesTotal({ lateFees: fees }));
  let ledger: string | null = null;
  let owed: number | null = null;
  let waived: number | null = null;
  if (view.state === "approved") {
    if (partial) {
      const cut = applyCut(
        { status: charge.status, amount: charge.amount, amount_paid: charge.amount_paid, amount_remaining: charge.amount_remaining },
        approval.amount
      );
      waived = cut.waived;
      owed = cut.amount_remaining;
      await d.request(
        updateItem("payment_requests", charge.id, {
          amount: cut.amount,
          amount_remaining: cut.amount_remaining,
          status: cut.status,
          ...(cut.status === "paid" ? { paid_at: now } : {}),
        } as any)
      );
    } else {
      await d.request(updateItem("payment_requests", charge.id, { status: "canceled" } as any));
      for (const fee of feesOpen) {
        await d.request(updateItem("payment_requests", fee.id, { status: "canceled" } as any));
        for (const other of await openChargeApprovals(orgId, fee.id)) await supersede(other, now);
      }
    }
    // A second request that raced this one has nothing left to decide.
    for (const other of await openChargeApprovals(orgId, String(charge.id))) {
      if (other.id !== approval.id) await supersede(other, now);
    }
    const names = await namesFor(orgId, input.decisions.map((x) => x.decided_by));
    try {
      ledger = await writeAuditEntry(
        buildChargeWaivedEntry({
          organizationId: orgId,
          organizationName: await orgName(orgId),
          approvalId: approval.id,
          charge: chargeSubject(charge),
          reason: approval.reason ?? "",
          approvedBy: approverNames(input.decisions, names),
          partial: waived,
          lateFees: feesOpen.map((f) => ({ id: f.id, amount: fromCents(remainingCents(f as any)) })),
          actor: input.actor,
          occurredAt: now,
        })
      );
    } catch (e) {
      console.error("[money-approvals] ledger write failed:", e);
    }
    const title = chargeTitle(charge);
    await notifyHousehold({
      orgId,
      userId: householdUserOf(charge),
      subject: "A charge to you was waived",
      message: partial
        ? `${formatMoney(waived)} of your charge for ${title} was waived. You now owe ${formatMoney(owed)}.`
        : `Your ${formatMoney(charge.amount)} charge for ${title} was waived${feesOpen.length ? ", with its late fees" : ""}.`,
      chargeId: String(charge.id),
      origin: input.origin ?? null,
    });
  }

  const outcome = view.state === "approved" ? "approved" : "rejected";
  if (approval.requested_by) {
    await notifyUsers({
      organizationId: orgId,
      recipientUserIds: [approval.requested_by],
      category: "payment",
      subject: `Waiver ${outcome}`,
      message: `Waiving ${waiverPhrase(subject)} was ${outcome}${outcome === "approved" ? (partial ? `: ${formatMoney(owed)} is still owed` : ": the charge is canceled") : ""}.`,
      collection: "payment_requests",
      item: String(charge.id),
      path: "/admin/payments",
      origin: input.origin ?? null,
      excludeUserId: input.actor.userId,
    }).catch((e) => console.error("[money-approvals] outcome notice failed:", e));
  }
  return { state: view.state, ledger };
}

/**
 * A move the rule decided (docs/spec-charge-corrections.md, decision 3).
 * Checked again first: a charge settled, paid on (it or its late fees), or
 * whose new household left the community meanwhile closes the move as
 * superseded, and whoever asked is told why. Approved: the charge's member
 * and unit change, its unpaid late fees are cancelled (they were charged to
 * a household that never owed it), `charge_moved` goes to the Ledger (board),
 * and both households are told. Rejected: nothing changes. Whoever asked is
 * told the outcome.
 */
async function settleMove(input: {
  orgId: string;
  approval: ApprovalRow;
  view: ApprovalView;
  decisions: readonly DecisionRow[];
  actor: LedgerActor;
  now: string;
  origin?: string | null;
}): Promise<SettleResult> {
  const { orgId, approval, view, now } = input;
  const d = getTypedDirectus();
  const charge = approval.charge ? await loadCorrectableCharge(orgId, approval.charge).catch(() => null) : null;
  const to = approval.proposed?.member ? await loadHousehold(orgId, approval.proposed.member).catch(() => null) : null;
  const facts = charge ? await chargeFacts(orgId, charge) : null;
  const refusal = !charge || !facts ? "the charge is gone" : moveRefusal({ ...facts, approvalOpen: false });
  if (refusal || !to) {
    await supersede(approval, now);
    if (approval.requested_by && charge) {
      await notifyUsers({
        organizationId: orgId,
        recipientUserIds: [approval.requested_by],
        category: "payment",
        subject: "Move closed",
        message: `Moving ${movePhrase({ ...chargeSubject(charge), moveToName: to ? chargeHousehold(to) : null })} was closed: ${
          !to ? "that household is no longer an active member." : String(refusal).replace(/ Ask to Waive.*$/, "")
        }`,
        collection: "payment_requests",
        item: String(charge.id),
        path: "/admin/payments",
        origin: input.origin ?? null,
        excludeUserId: input.actor.userId,
      }).catch((e) => console.error("[money-approvals] move-closed notice failed:", e));
    }
    return { state: "superseded", ledger: null };
  }
  await d.request(updateItem("money_approvals" as any, approval.id, { state: view.state, ...ruleFields(view), decided_at: now } as any));

  const subject: ChargeSubject = { ...chargeSubject(charge), moveToName: chargeHousehold(to) };
  let ledger: string | null = null;
  if (view.state === "approved") {
    const feesOpen = openLateFees(facts!);
    await d.request(
      updateItem("payment_requests", charge.id, { member: String(to.id), unit: approval.proposed?.unit ?? null } as any)
    );
    for (const fee of feesOpen) {
      await d.request(updateItem("payment_requests", fee.id, { status: "canceled" } as any));
      for (const other of await openChargeApprovals(orgId, fee.id)) await supersede(other, now);
    }
    for (const other of await openChargeApprovals(orgId, String(charge.id))) {
      if (other.id !== approval.id) await supersede(other, now);
    }
    const names = await namesFor(orgId, input.decisions.map((x) => x.decided_by));
    try {
      ledger = await writeAuditEntry(
        buildChargeMovedEntry({
          organizationId: orgId,
          organizationName: await orgName(orgId),
          approvalId: approval.id,
          charge: subject,
          toMemberId: String(to.id),
          reason: approval.reason ?? "",
          approvedBy: approverNames(input.decisions, names),
          lateFees: feesOpen.map((f) => ({ id: f.id, amount: fromCents(remainingCents(f as any)) })),
          actor: input.actor,
          occurredAt: now,
        })
      );
    } catch (e) {
      console.error("[money-approvals] ledger write failed:", e);
    }
    const title = chargeTitle(charge);
    const money = formatMoney(charge.amount);
    await notifyHousehold({
      orgId,
      userId: householdUserOf(charge),
      subject: "A charge was removed from your account",
      message: `A ${money} charge for ${title} was removed from your account: it was entered for the wrong household.`,
      chargeId: String(charge.id),
      origin: input.origin ?? null,
    });
    await notifyHousehold({
      orgId,
      userId: idOf(to.user),
      subject: "A charge was added to your account",
      message: `A ${money} charge for ${title}${charge.due_date ? `, due ${formatDay(String(charge.due_date))},` : ""} was added to your account.`,
      chargeId: String(charge.id),
      origin: input.origin ?? null,
    });
  }

  const outcome = view.state === "approved" ? "approved" : "rejected";
  if (approval.requested_by) {
    await notifyUsers({
      organizationId: orgId,
      recipientUserIds: [approval.requested_by],
      category: "payment",
      subject: `Move ${outcome}`,
      message: `Moving ${movePhrase(subject)} was ${outcome}.`,
      collection: "payment_requests",
      item: String(charge.id),
      path: "/admin/payments",
      origin: input.origin ?? null,
      excludeUserId: input.actor.userId,
    }).catch((e) => console.error("[money-approvals] outcome notice failed:", e));
  }
  return { state: view.state, ledger };
}

/**
 * A charge was paid in full (Mark Paid, or a payment through Stripe): any
 * waiver of it still open has nothing left to give up. Each closes as
 * superseded, and whoever asked is told. Never throws: a payment must not
 * fail, or a webhook retry, because of a waiver.
 */
export async function closeWaiversOfPaidCharge(
  orgId: string | null | undefined,
  chargeId: string,
  origin?: string | null
): Promise<number> {
  if (!orgId || !chargeId) return 0;
  try {
    const open = await openChargeApprovals(orgId, chargeId);
    if (!open.length) return 0;
    const now = new Date().toISOString();
    const charge = await loadCharge(orgId, chargeId).catch(() => null);
    const what = charge ? chargePhrase(chargeSubject(charge)) : "a charge";
    for (const approval of open) {
      await supersede(approval, now);
      if (!approval.requested_by) continue;
      await notifyUsers({
        organizationId: orgId,
        recipientUserIds: [approval.requested_by],
        category: "payment",
        subject: approval.kind === "move" ? "Move closed: the charge was paid" : "Waiver closed: the charge was paid",
        message: `${what[0]!.toUpperCase()}${what.slice(1)} was paid, so the ${approval.kind === "move" ? "move" : "waiver"} you asked for is closed.`,
        collection: "payment_requests",
        item: chargeId,
        path: "/admin/payments",
        origin: origin ?? null,
      }).catch((e) => console.error("[money-approvals] waiver-closed notice failed:", e));
    }
    return open.length;
  } catch (e) {
    console.error("[money-approvals] closing waivers of a paid charge failed:", e);
    return 0;
  }
}

/** The office label a person decides as today ("President"), or null for no seat. */
export function officeLabelOf(seats: readonly Seat[], userId: string): { office: string | null; label: string | null } {
  const office = officeOf(seats, userId);
  return { office, label: office ? OFFICE_LABELS[office] ?? null : null };
}

/**
 * The board changed: ask the rule again about every open approval in the
 * community, and settle what the change decided (approved, rejected, or
 * from "cannot be approved" to waiting, which tells the people it now waits
 * on). Called by the board-term routes and by the daily job, for terms that
 * end on their date. Waivers settle here too: approved cancels the charge.
 */
export async function resettleCommunity(
  orgId: string,
  actor: LedgerActor,
  origin?: string | null
): Promise<{ checked: number; settled: number; reopened: number }> {
  const open = await loadApprovals(orgId, { state: { _in: [...OPEN_STATES] } });
  if (!open.length) return { checked: 0, settled: 0, reopened: 0 };
  const seats = await loadCurrentSeats(orgId);
  const decisions = await loadDecisions(open.map((a) => a.id));
  const now = new Date().toISOString();
  let settled = 0;
  let reopened = 0;
  for (const approval of open) {
    const own = decisions.get(approval.id) ?? [];
    const view = viewOf(approval, seats, own);
    const result = await settleApproval({ orgId, approval, view, decisions: own, seats, actor, now, origin });
    if (result.state === "approved" || result.state === "rejected") settled++;
    if (approval.state === "cannot_approve" && result.state === "pending") {
      if (approval.expense) {
        const expense = await loadExpense(orgId, approval.expense).catch(() => null);
        if (expense) {
          reopened++;
          await notifyApprovers({ orgId, approval, view, expense: expenseSubject(expense), origin });
        }
      } else if (approval.charge) {
        const charge = await loadCharge(orgId, approval.charge).catch(() => null);
        if (charge) {
          reopened++;
          await notifyApprovers({ orgId, approval, view, charge: await chargeApprovalSubject(orgId, charge, approval), origin });
        }
      }
    }
  }
  return { checked: open.length, settled, reopened };
}

/**
 * After a board-term route has written: resettle the community's open
 * approvals, credited to whoever changed the board. Never fails the route.
 */
export async function settleAfterBoardChange(event: H3Event, orgId: string): Promise<void> {
  try {
    const session = await getUserSession(event);
    const actor = await ledgerActorFor(orgId, (session?.user ?? null) as Record<string, any> | null);
    await resettleCommunity(orgId, actor, await safeRequestOrigin(event).catch(() => null));
  } catch (e) {
    console.error("[money-approvals] resettle after a board change failed:", e);
  }
}

/** A system actor, for a settlement no person's action caused (the board changed). */
export const SYSTEM_ACTOR: LedgerActor = { userId: null, name: "HOA Connect", email: null };
