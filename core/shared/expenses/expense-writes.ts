/**
 * An admin entering or changing an expense: the bodies POST and PATCH
 * /api/org/expenses take, and whose row is whose.
 *
 * Not Directus on the admin's own token: the HOA Admin rules on
 * `payment_expenses` checked only the row's own `organization`, so through the
 * API an admin could name another community's project, or another community's
 * file as the receipt, and the asset proxy then served that file to them as
 * their receipt (core/server/utils/expense-receipts.ts). The routes check
 * both, and the HOA Admin create and update are removed
 * (scripts/lib/admin-scope-perms.ts REMOVED_ADMIN_RULES).
 *
 * `paid` is not set here. POST /api/org/expenses/record owns that move and
 * records it in the Community Ledger; an expense already paid may say so
 * again, because the form sends its status back unchanged.
 *
 * Pure: no Directus.
 */
import { z } from "zod";

export const EXPENSE_CATEGORY_VALUES = ["maintenance", "utilities", "insurance", "landscaping", "admin", "other"] as const;
export const EXPENSE_STATUS_VALUES = ["draft", "approved", "paid"] as const;

const NOT_HERE = "An expense becomes paid when its payment is recorded, not here.";

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

export const createExpenseBody = z
  .object({
    orgId,
    expense: z.object({ ...fields, status: z.enum(["draft", "approved"], { message: NOT_HERE }).optional() }).strict(),
  })
  .strict();

export const patchExpenseBody = z
  .object({
    orgId,
    id,
    patch: z
      .object({ ...fields, status: z.enum(EXPENSE_STATUS_VALUES).optional() })
      .partial()
      .strict()
      .refine(someField, "Nothing to change."),
  })
  .strict();

export type CreateExpenseBody = z.infer<typeof createExpenseBody>;
export type PatchExpenseBody = z.infer<typeof patchExpenseBody>;

/** Why a change may not set this status, or null: `paid` only on a row that is paid already. */
export function statusRefusal(current: unknown, next: string | undefined): string | null {
  return next === "paid" && current !== "paid" ? NOT_HERE : null;
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
