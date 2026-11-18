/**
 * Entering or changing an expense: the bodies the expense routes take, which
 * fields a status lets change, what each person may do to a row, and whose
 * row is whose (docs/spec-money-approvals.md).
 *
 * Not Directus on anyone's own token: the HOA Admin rules on
 * `payment_expenses` checked only the row's own `organization`, so through the
 * API an admin could name another community's project, or another community's
 * file as the receipt, and the asset proxy then served that file to them as
 * their receipt (core/server/utils/expense-receipts.ts). The routes check
 * both, and no policy writes `payment_expenses`.
 *
 * Status is never a field here. It moves only through the routes: submit,
 * pay, void, and a decision on the expense's approval. A change to the
 * amount, vendor or title of a submitted or approved expense opens a new
 * approval round (decided with the operator 2026-11-17: the vendor is the
 * payee, and the title names what the approval approved).
 *
 * Pure: no Directus.
 */
import { z } from "zod";

export const EXPENSE_CATEGORY_VALUES = ["maintenance", "utilities", "insurance", "landscaping", "admin", "other"] as const;
export const EXPENSE_STATUS_VALUES = ["draft", "submitted", "approved", "rejected", "paid", "void"] as const;
export type ExpenseStatus = (typeof EXPENSE_STATUS_VALUES)[number];

const id = z.string().uuid("That isn't a valid id.");
const text = (max: number) => z.string().trim().max(max).nullable().optional();
// The form's date picker sends a day ("2026-11-16"); a full timestamp is fine too.
const DAY = z.string().date();
const MOMENT = z.string().datetime({ offset: true });
const when = z
  .string()
  .refine((v) => DAY.safeParse(v).success || MOMENT.safeParse(v).success, "Use a date.")
  .nullable()
  .optional();

const fields = {
  title: z.string().trim().min(1, "Give the expense a title.").max(255),
  vendor: text(255),
  category: z.enum(EXPENSE_CATEGORY_VALUES).nullable().optional(),
  amount: z.number({ message: "Use a number." }).finite().positive("Use an amount over zero.").max(100_000_000),
  expense_date: when,
  paid_date: when,
  description: text(5000),
  notes: text(5000),
  receipt: id.nullable().optional(),
  project: id.nullable().optional(),
};

const orgId = z.string().min(1, "orgId is required");
const someField = (v: object) => Object.keys(v).length > 0;

const { paid_date: _paidDate, ...entered } = fields;

/** POST /api/org/expenses: a draft, or submitted straight away. */
export const createExpenseBody = z
  .object({
    orgId,
    expense: z.object(entered).strict(),
    submit: z.boolean().optional(),
  })
  .strict();

/** PATCH /api/org/expenses/[id]. */
export const patchExpenseBody = z
  .object({
    orgId,
    patch: z.object(entered).partial().strict().refine(someField, "Nothing to change."),
  })
  .strict();

/** POST /api/org/expenses/[id]/pay: when the money went out, and its check or transfer. */
export const payExpenseBody = z
  .object({
    orgId,
    paidDate: z.string().refine((v) => DAY.safeParse(v).success || MOMENT.safeParse(v).success, "Use a date."),
    reference: z.string().trim().min(1, "Add the check number or transfer reference.").max(120),
  })
  .strict();

/** POST /api/org/expenses/[id]/void. */
export const voidExpenseBody = z
  .object({ orgId, reason: z.string().trim().min(3, "Say why it is being voided.").max(1000) })
  .strict();

export type CreateExpenseBody = z.infer<typeof createExpenseBody>;
export type PatchExpenseBody = z.infer<typeof patchExpenseBody>;
export type ExpensePatch = PatchExpenseBody["patch"];

/** A change to any of these, once submitted, opens a new approval round. */
export const RESHAPE_FIELDS = ["amount", "vendor", "title"] as const;
/** These change freely while submitted or approved. */
export const FREE_FIELDS = ["notes", "category", "receipt", "description", "project", "expense_date"] as const;
/** A paid expense: only these. To correct one, void it and enter it again. */
export const PAID_FIELDS = ["notes", "receipt"] as const;

const DATE_LIKE = /^\d{4}-\d{2}-\d{2}/;
const plain = (v: unknown): unknown => {
  const id = v && typeof v === "object" ? (v as { id?: unknown }).id : v;
  return id === "" || id === undefined ? null : id;
};

/** Equal as the form means it: a related row and its id, "425.00" and 425, a day and its timestamp. */
function sameValue(a: unknown, b: unknown): boolean {
  const x = plain(a);
  const y = plain(b);
  if (x === y) return true;
  if (x == null || y == null) return false;
  if (typeof x === "number" || typeof y === "number") return Number(x) === Number(y);
  if (typeof x === "string" && typeof y === "string" && DATE_LIKE.test(x) && DATE_LIKE.test(y)) return x.slice(0, 10) === y.slice(0, 10);
  return false;
}

export interface EditPlan {
  /** The fields that actually change. */
  readonly changed: readonly string[];
  /** Why the change is refused, or null. */
  readonly refusal: string | null;
  /** The change reshapes a submitted, approved or rejected expense: a new round. */
  readonly newRound: boolean;
}

/** What an edit does to an expense in this status. */
export function editPlan(status: unknown, current: Record<string, unknown>, patch: Record<string, unknown>): EditPlan {
  const changed = Object.keys(patch).filter((k) => !sameValue(current[k], patch[k]));
  const reshapes = changed.some((k) => (RESHAPE_FIELDS as readonly string[]).includes(k));
  const outside = (allowed: readonly string[]) => changed.filter((k) => !allowed.includes(k));
  switch (status) {
    case "draft":
      return { changed, refusal: null, newRound: false };
    case "rejected":
    case "submitted":
    case "approved":
      return { changed, refusal: null, newRound: reshapes };
    case "paid":
      return outside(PAID_FIELDS).length
        ? { changed, refusal: "A paid expense keeps its amount, vendor and details: only its notes and receipt change. To correct it, void it and enter it again.", newRound: false }
        : { changed, refusal: null, newRound: false };
    case "void":
      return { changed, refusal: "A voided expense stays as it was.", newRound: false };
    default:
      return { changed, refusal: "This expense can't be changed.", newRound: false };
  }
}

export type ExpenseAction = "edit" | "submit" | "pay" | "void" | "ask_void" | "delete";

export interface ExpenseFacts {
  readonly status: unknown;
  readonly enteredBy: string | null;
  /** Decisions on its current spend approval. */
  readonly decisions: number;
  /** A void approval is open. */
  readonly voidPending: boolean;
}

export interface ExpenseViewer {
  readonly userId: string | null;
  readonly isAdmin: boolean;
  readonly canEnter: boolean;
}

/**
 * What this person may do to this expense: the routes refuse anything else,
 * and the page shows only these. Deleting a draft and voiding one that nobody
 * has decided are the enterer's or an admin's; everything else is any
 * money:enter holder's. Approving is not here: it is the rule's, per approval.
 */
export function expenseActions(f: ExpenseFacts, v: ExpenseViewer): ExpenseAction[] {
  if (!v.canEnter || !v.userId) return [];
  const own = v.isAdmin || (!!f.enteredBy && f.enteredBy === v.userId);
  const askVoid: ExpenseAction[] = f.voidPending ? [] : ["ask_void"];
  switch (f.status) {
    case "draft":
      return own ? ["edit", "submit", "delete"] : ["edit", "submit"];
    case "submitted":
      return ["edit", "pay", ...(f.decisions === 0 ? (own ? (["void"] as const) : []) : askVoid)];
    case "approved":
      return ["edit", "pay", ...askVoid];
    case "rejected":
      return own ? ["edit", "submit", "void"] : ["edit", "submit"];
    case "paid":
      return ["edit", ...askVoid];
    default:
      return [];
  }
}

/** Voided at once (no approval): a draft, a rejection, or a submission nobody has decided. */
export function voidsAtOnce(status: unknown, decisions: number): boolean {
  return status === "draft" || status === "rejected" || (status === "submitted" && decisions === 0);
}

const asId = (v: unknown): string | null =>
  typeof v === "string" ? v : ((v as { id?: unknown } | null)?.id as string | undefined) ?? null;

/**
 * The community an expense row belongs to: its own `organization`, and its
 * project's when it names one, which must agree. Null when it has none or the
 * two disagree, so a row that straddles two communities is no one's to edit.
 */
export function expenseCommunity(row: { organization?: unknown; project?: unknown }): string | null {
  const own = asId(row.organization);
  const project = row.project && typeof row.project === "object" ? asId((row.project as { organization?: unknown }).organization) : null;
  if (!own) return null;
  return !project || project === own ? own : null;
}
