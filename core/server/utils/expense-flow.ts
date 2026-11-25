/**
 * The expense lifecycle on the server (docs/spec-money-approvals.md): opening
 * a spend round, and what each row of the Expenses page carries: its
 * approval's progress and the actions the caller may take. The routes under
 * core/server/api/org/expenses share these, so a button the page shows is one
 * the route accepts.
 */
import { updateItem } from "@directus/sdk";
import { expenseActions, type ExpenseAction } from "#core/shared/expenses/expense-writes";
import { progressLabel, type Seat } from "#core/shared/money/approval-rule";
import { roleIdOf } from "#core/shared/ops/permissions";

const idOf = (v: unknown): string | null => roleIdOf(v as never) ?? null;

/**
 * Opens the next spend round on an expense and makes it `submitted`: the
 * previous round, if open, is superseded. The person who entered it, whoever
 * asks, and whoever reshaped it are excluded. The people it waits on are told.
 */
export async function startSpendRound(input: {
  orgId: string;
  expense: any;
  requestedBy: string;
  reshapedBy?: string | null;
  now: string;
  origin?: string | null;
}): Promise<{ approval: ApprovalRow; view: ReturnType<typeof viewOf> }> {
  const { orgId, expense, now } = input;
  const seats = await loadCurrentSeats(orgId);
  const previousId = idOf(expense.approval);
  const previous = previousId ? (await loadApprovals(orgId, { id: { _eq: previousId } }))[0] ?? null : null;
  await supersede(previous, now);

  const enteredBy = idOf(expense.entered_by);
  const { approval, view } = await openApproval({
    orgId,
    kind: "spend",
    expense: String(expense.id),
    round: (previous?.round ?? 0) + 1,
    requestedBy: input.requestedBy,
    excluded: [enteredBy, input.reshapedBy].filter((x): x is string => !!x),
    seats,
  });
  await getTypedDirectus().request(updateItem("payment_expenses", expense.id, { status: "submitted", approval: approval.id } as any));
  await notifyApprovers({ orgId, approval, view, expense: expenseSubject(expense), origin: input.origin });
  return { approval, view: viewOf(approval, seats, []) };
}

export interface ExpenseApprovalSummary {
  id: string;
  state: StoredState;
  round: number;
  mode: string;
  needed: number;
  approvals: number;
  rejections: number;
  progress: string;
}

export interface ExpenseExtras {
  /** Its current spend approval as the rule sees it now. `approval` stays the row's id. */
  approval_summary: ExpenseApprovalSummary | null;
  /** A void approval is open on it. */
  void_pending: boolean;
  /** What the caller may do (expenseActions). */
  actions: ExpenseAction[];
  entered_by_name: string | null;
  paid_by_name: string | null;
}

/**
 * Each expense's current spend approval, as the rule sees it now, and the
 * caller's actions on it. One read of the seats, one of the approvals, one of
 * their decisions.
 */
export async function describeExpenses(
  orgId: string,
  rows: readonly any[],
  viewer: { userId: string | null; isAdmin: boolean; canEnter: boolean },
  seatsArg?: readonly Seat[],
  /**
   * What a caller already read (the expenses list, in one batch): the seats,
   * the community's expense approvals (a superset of these rows' is fine:
   * they are looked up by id and by expense), their decisions, and the names.
   */
  pre?: { approvals: readonly ApprovalRow[]; decisions: Map<string, DecisionRow[]>; names: Map<string, string> }
): Promise<ExpenseExtras[]> {
  const seats = seatsArg ?? (await loadCurrentSeats(orgId));
  const expenseIds = rows.map((r) => String(r.id));
  const approvals = pre ? pre.approvals : expenseIds.length ? await loadApprovals(orgId, { expense: { _in: expenseIds } }) : [];
  const byId = new Map(approvals.map((a) => [a.id, a]));
  const decisions = pre ? pre.decisions : await loadDecisions(approvals.map((a) => a.id));
  const voidOpen = new Set(approvals.filter((a) => a.kind === "void" && isOpen(a.state)).map((a) => a.expense));
  const names = pre ? pre.names : await namesFor(orgId, rows.flatMap((r) => [idOf(r.entered_by), idOf(r.paid_by)]));

  return rows.map((r) => {
    const current = byId.get(idOf(r.approval) ?? "") ?? null;
    const own = current ? decisions.get(current.id) ?? [] : [];
    const view = current ? readViewOf(current, seats, own) : null;
    const enteredBy = idOf(r.entered_by);
    const paidBy = idOf(r.paid_by);
    return {
      approval_summary:
        current && view
          ? {
              id: current.id,
              state: view.state as StoredState,
              round: current.round,
              mode: view.mode,
              needed: view.needed,
              approvals: view.approvals,
              rejections: view.rejections,
              progress: progressLabel(view),
            }
          : null,
      void_pending: voidOpen.has(String(r.id)),
      actions: expenseActions(
        { status: r.status, enteredBy, decisions: own.length, voidPending: voidOpen.has(String(r.id)) },
        viewer
      ),
      entered_by_name: enteredBy ? names.get(enteredBy) ?? null : null,
      paid_by_name: paidBy ? names.get(paidBy) ?? null : null,
    };
  });
}

/** 403 unless the caller may take this action on this expense now. */
export async function requireExpenseAction(
  orgId: string,
  expense: any,
  viewer: { userId: string; isAdmin: boolean },
  action: ExpenseAction
): Promise<ExpenseExtras> {
  const [extras] = await describeExpenses(orgId, [expense], { ...viewer, canEnter: true });
  if (!extras!.actions.includes(action)) {
    throw createError({ statusCode: action === "delete" || action === "void" ? 403 : 409, message: refusalFor(action, expense.status) });
  }
  return extras!;
}

function refusalFor(action: ExpenseAction, status: unknown): string {
  switch (action) {
    case "delete":
      return status === "draft" ? "Only the person who entered this draft, or an admin, can delete it." : "Only a draft can be deleted. Void it instead.";
    case "void":
      return "Voiding it at once is for the person who entered it, or an admin.";
    case "submit":
      return "Only a draft or a rejected expense can be submitted.";
    case "pay":
      return "Only a submitted or approved expense can be recorded paid.";
    case "ask_void":
      return "Voiding this expense is already waiting for approval, or it can't be voided.";
    default:
      return "This expense can't be changed now.";
  }
}
