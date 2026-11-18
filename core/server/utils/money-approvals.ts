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
import {
  buildExpenseApprovedEntry,
  buildExpenseVoidedEntry,
  expensePhrase,
  nameWithOffice,
  type ExpenseSubject,
} from "#core/shared/ledger/entries";
import type { LedgerActor } from "#core/shared/ledger/entry";
import { roleIdOf } from "#core/shared/ops/permissions";
import { expenseCommunity } from "#core/shared/expenses/expense-writes";

export type ApprovalKind = "spend" | "void" | "waive";
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
  "requested_by", "excluded", "reason", "date_created", "decided_at",
] as const;
const DECISION_FIELDS = ["id", "approval", "decided_by", "office", "decision", "note", "date_created"] as const;
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

export async function loadApprovals(orgId: string, filter: Record<string, unknown> = {}): Promise<ApprovalRow[]> {
  const rows = ((await getTypedDirectus().request(
    readItems("money_approvals" as any, {
      filter: { organization: { _eq: orgId }, ...filter } as any,
      fields: [...APPROVAL_FIELDS] as any,
      sort: ["-date_created"] as any,
      limit: -1,
    })
  )) ?? []) as any[];
  return rows.map(normaliseApproval).filter((a) => a.organization === orgId);
}

/** One approval, 404 unless it is the community's. */
export async function loadApproval(orgId: string, id: string): Promise<ApprovalRow> {
  const [row] = await loadApprovals(orgId, { id: { _eq: id } });
  if (!row) throw createError({ statusCode: 404, message: "No such approval in this community." });
  return row;
}

export async function loadDecisions(approvalIds: readonly string[]): Promise<Map<string, DecisionRow[]>> {
  const out = new Map<string, DecisionRow[]>();
  if (!approvalIds.length) return out;
  const rows = ((await getTypedDirectus().request(
    readItems("money_approval_decisions" as any, {
      filter: { approval: { _in: [...approvalIds] } } as any,
      fields: [...DECISION_FIELDS] as any,
      sort: ["date_created"] as any,
      limit: -1,
    })
  )) ?? []) as any[];
  for (const d of rows.map(normaliseDecision)) out.set(d.approval, [...(out.get(d.approval) ?? []), d]);
  return out;
}

const asRuleDecisions = (rows: readonly DecisionRow[]): Decision[] =>
  rows.filter((d) => !!d.decided_by).map((d) => ({ userId: d.decided_by!, decision: d.decision, office: d.office }));

/** The rule's view, with a settled approval's stored state. */
export type ApprovalView = Omit<RuleView, "state"> & { state: StoredState };

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

export async function orgName(orgId: string): Promise<string | null> {
  const rows = ((await getTypedDirectus().request(
    readItems("hoa_organizations", { filter: { id: { _eq: orgId } } as any, fields: ["name"] as any, limit: 1 })
  )) ?? []) as any[];
  return rows[0]?.name ?? null;
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
    } as any)
  );
  return { approval: normaliseApproval(row), view };
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
  view: RuleView;
  expense: ExpenseSubject;
  origin?: string | null;
}): Promise<void> {
  if (input.view.state !== "pending" || !input.view.waitingOn.length) return;
  const what = expensePhrase(input.expense);
  const lead = input.approval.kind === "void" ? `Voiding ${what} needs your approval.` : `${what[0]!.toUpperCase()}${what.slice(1)} needs your approval.`;
  const round = input.approval.round > 1 ? ` It changed, so this is round ${input.approval.round}.` : "";
  await notifyUsers({
    organizationId: input.orgId,
    recipientUserIds: [...input.view.waitingOn],
    category: "payment",
    subject: input.approval.kind === "void" ? "Voiding an expense needs your approval" : "Spending needs your approval",
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

  await d.request(updateItem("money_approvals" as any, approval.id, { state: view.state, ...ruleFields(view), decided_at: now } as any));
  if (approval.kind === "waive" || !approval.expense) return { state: view.state, ledger: null };

  const expense = await loadExpense(orgId, approval.expense);
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
    await supersede((await openApprovalsFor(orgId, expense.id, "spend"))[0] ?? null, now);
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

/** The office label a person decides as today ("President"), or null for no seat. */
export function officeLabelOf(seats: readonly Seat[], userId: string): { office: string | null; label: string | null } {
  const office = officeOf(seats, userId);
  return { office, label: office ? OFFICE_LABELS[office] ?? null : null };
}

/** A system actor, for a settlement no person's action caused (the board changed). */
export const SYSTEM_ACTOR: LedgerActor = { userId: null, name: "HOA Connect", email: null };
