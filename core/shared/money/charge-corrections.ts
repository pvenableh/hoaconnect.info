/**
 * Correcting an owner charge (docs/spec-charge-corrections.md): what may
 * change on a charge, by whom, and what a partial waiver leaves. Pure: the
 * routes in core/server/api/org/money/charges decide with these, and the
 * Charges page shows only what they would accept.
 *
 * Raising a charge, renaming it, or moving its date before it is due gives up
 * nothing, so an admin may. Lowering it, moving it to another household or
 * taking it back gives up income, so the board approves it — except a charge
 * withdrawn within 24 hours of being entered by hand, before anything was
 * paid, reminded or charged late.
 */

/** A charge still asks for money: it can be corrected, waived or moved. */
export const OPEN_CHARGE_STATUSES = ["active", "partially_paid", "overdue"] as const;
export const isOpenChargeStatus = (status: unknown) => (OPEN_CHARGE_STATUSES as readonly string[]).includes(String(status ?? ""));

/** How long a hand-entered charge can be withdrawn without the board. */
export const WITHDRAW_WINDOW_MS = 24 * 60 * 60 * 1000;

/** A late fee on a charge (`source: late_fee`, `source_id` = the charge). */
export interface LateFeeFacts {
  readonly id: string;
  readonly status: string | null;
  readonly amount: unknown;
  readonly amount_paid?: unknown;
  readonly amount_remaining?: unknown;
}

/** What the rules read from a charge. Money comes from Directus as strings. */
export interface ChargeFacts {
  readonly status: string | null;
  readonly source?: string | null;
  readonly request_type?: string | null;
  readonly date_created?: string | null;
  readonly amount: unknown;
  readonly amount_paid?: unknown;
  readonly amount_remaining?: unknown;
  readonly due_date?: string | null;
  readonly reminder_sent?: boolean | null;
  readonly metadata?: unknown;
  /** Any payment transaction recorded against it. */
  readonly hasTransactions?: boolean;
  /** Its late fees, canceled ones included (they are skipped here). */
  readonly lateFees?: readonly LateFeeFacts[];
  /** A waive or move approval is open on it. */
  readonly approvalOpen?: boolean;
}

export const cents = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};
export const fromCents = (c: number): number => Math.round(c) / 100;

/** What is still owed: `amount_remaining` when known, else amount less paid. */
export function remainingCents(c: Pick<ChargeFacts, "amount" | "amount_paid" | "amount_remaining">): number {
  if (c.amount_remaining != null && c.amount_remaining !== "") return Math.max(0, cents(c.amount_remaining));
  return Math.max(0, cents(c.amount) - cents(c.amount_paid));
}

const dayOf = (v: string | null | undefined) => (v ? String(v).slice(0, 10) : null);

/** Late fees that count: not canceled. */
export const chargedLateFees = (c: Pick<ChargeFacts, "lateFees">) => (c.lateFees ?? []).filter((f) => f.status !== "canceled");

/** Late fees still owed: open, with something remaining. */
export const openLateFees = (c: Pick<ChargeFacts, "lateFees">) =>
  chargedLateFees(c).filter((f) => isOpenChargeStatus(f.status) && remainingCents(f as ChargeFacts) > 0);

/** The sum still owed on a charge's late fees, in dollars. */
export const openLateFeesTotal = (c: Pick<ChargeFacts, "lateFees">) =>
  fromCents(openLateFees(c).reduce((sum, f) => sum + remainingCents(f as ChargeFacts), 0));

/** A reminder went out for it: the flag, or any stage stamped in `metadata.reminders`. */
export function wasReminded(c: Pick<ChargeFacts, "reminder_sent" | "metadata">): boolean {
  if (c.reminder_sent) return true;
  const m = c.metadata && typeof c.metadata === "object" ? (c.metadata as { reminders?: unknown }).reminders : null;
  return !!m && typeof m === "object" && Object.keys(m as object).length > 0;
}

/** Entered by a person on the New charge form: no source (the form sets none), or `manual`. */
export const isHandEntered = (c: Pick<ChargeFacts, "source" | "request_type">) =>
  (c.source == null || c.source === "" || c.source === "manual") && c.request_type !== "late_fee";

const NOT_OPEN = "Only a charge that is still owed can be corrected.";
const APPROVAL_OPEN = "A waiver or move of this charge is awaiting approval.";

/**
 * Why a charge cannot be withdrawn now, or null when it can. The window is
 * for undoing a fresh mistake: after it, taking a charge back is a waiver.
 */
export function withdrawRefusal(c: ChargeFacts, now: Date): string | null {
  if (!isOpenChargeStatus(c.status)) return NOT_OPEN;
  if (!isHandEntered(c)) return "Only a charge entered by hand can be withdrawn. Ask to Waive it instead.";
  if (c.approvalOpen) return APPROVAL_OPEN;
  const created = c.date_created ? Date.parse(c.date_created) : NaN;
  if (!Number.isFinite(created) || now.getTime() - created > WITHDRAW_WINDOW_MS) {
    return "It has been more than 24 hours since it was entered. Ask to Waive it instead.";
  }
  if (cents(c.amount_paid) > 0 || c.hasTransactions) return "A payment has been made on it. Ask to Waive it instead.";
  if (wasReminded(c)) return "A reminder has gone out for it. Ask to Waive it instead.";
  if (chargedLateFees(c).length) return "A late fee has been charged on it. Ask to Waive it instead.";
  return null;
}

/**
 * Why the due date cannot be changed now, or null. Moving a date can cause
 * or avoid a late fee, so it changes freely only before the charge is due
 * and before any late fee; and never to a past date.
 */
export function dueDateLock(c: ChargeFacts, today: string): string | null {
  if (!isOpenChargeStatus(c.status)) return NOT_OPEN;
  if (c.approvalOpen) return APPROVAL_OPEN;
  if (c.status === "overdue") return "It is overdue, so its due date can no longer change.";
  const due = dayOf(c.due_date);
  if (due && due < today) return "It is already past due, so its due date can no longer change.";
  if (chargedLateFees(c).length) return "A late fee has been charged on it, so its due date can no longer change.";
  return null;
}

export function dueDateRefusal(c: ChargeFacts, next: string | null, today: string): string | null {
  const lock = dueDateLock(c, today);
  if (lock) return lock;
  const day = dayOf(next);
  if (!day) return "Choose a due date.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return "Choose a valid due date.";
  if (day < today) return "The due date cannot be in the past.";
  return null;
}

/** Why the amount cannot become `next`, or null. Only up: lowering gives up income. */
export function amountRefusal(c: ChargeFacts, next: unknown): string | null {
  if (!isOpenChargeStatus(c.status)) return NOT_OPEN;
  if (c.approvalOpen) return APPROVAL_OPEN;
  const n = Number(next);
  if (!Number.isFinite(n) || n <= 0) return "Enter an amount more than zero.";
  if (cents(n) < cents(c.amount)) return "Lowering a charge gives up income: Ask to Waive part of it.";
  return null;
}

/** A raised amount: what is owed rises by the same difference. */
export function raisedAmount(c: ChargeFacts, next: unknown): { amount: number; amount_remaining: number } {
  const diff = cents(next) - cents(c.amount);
  return { amount: fromCents(cents(next)), amount_remaining: fromCents(remainingCents(c) + diff) };
}

/** Why a waiver cannot be asked for, or null. `cut` absent is all that remains. */
export function waiveRefusal(c: ChargeFacts, cut?: unknown): string | null {
  if (!isOpenChargeStatus(c.status)) return `This charge is already ${c.status === "paid" ? "paid" : "canceled"}.`;
  if (c.approvalOpen) return APPROVAL_OPEN;
  if (cut == null || cut === "") return null;
  const n = Number(cut);
  if (!Number.isFinite(n) || cents(n) <= 0) return "Enter an amount more than zero.";
  if (cents(n) >= remainingCents(c)) return "That is all that's owed: waive all of it instead.";
  return null;
}

/**
 * A partial waiver met: the cut, or what remains if payments since left
 * less. The charge's amount and what remains both drop by it; nothing left
 * means the rest was paid, so it is `paid`.
 */
export function applyCut(c: ChargeFacts, cut: unknown): { waived: number; amount: number; amount_remaining: number; status: string } {
  const remaining = remainingCents(c);
  const waived = Math.min(Math.max(0, cents(cut)), remaining);
  const left = remaining - waived;
  return {
    waived: fromCents(waived),
    amount: fromCents(cents(c.amount) - waived),
    amount_remaining: fromCents(left),
    status: left === 0 ? "paid" : String(c.status),
  };
}

/** Why a charge cannot be moved to another household, or null. Only while nothing is paid. */
export function moveRefusal(c: ChargeFacts): string | null {
  if (!isOpenChargeStatus(c.status)) return NOT_OPEN;
  if (c.request_type === "late_fee") return "A late fee follows its charge: move the charge instead.";
  if (c.approvalOpen) return APPROVAL_OPEN;
  if (cents(c.amount_paid) > 0 || c.hasTransactions) return "A payment has been made on it. Ask to Waive it and enter it again.";
  if (chargedLateFees(c).some((f) => cents(f.amount_paid) > 0)) return "A late fee on it has been paid. Ask to Waive it and enter it again.";
  return null;
}

/** The fields an admin may set freely through PATCH. */
export const FREE_TEXT_FIELDS = ["title", "description", "notes"] as const;
export type FreeTextField = (typeof FREE_TEXT_FIELDS)[number];

/** One field's change, for the Ledger and the owner's notice. */
export interface ChargeChange {
  readonly field: FreeTextField | "amount" | "due_date";
  readonly from: string | number | null;
  readonly to: string | number | null;
}

/** The changes an owner hears of: what they owe, or when it is due. */
export const ownerHearsOf = (changes: readonly ChargeChange[]) => changes.filter((c) => c.field === "amount" || c.field === "due_date");
