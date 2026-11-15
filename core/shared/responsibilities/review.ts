/**
 * When a job is next due for review — derived, never stored
 * (docs/spec-responsibilities.md). Phase 11 wires it to reminders.
 */
import { parseDateOnly, toDateOnly } from "../projects/schedule";
import type { Cadence } from "./config";

/** Months between reviews. Jobs done more often than monthly are reviewed monthly. */
export const REVIEW_MONTHS: Readonly<Record<Cadence, number>> = {
  daily: 1,
  weekly: 1,
  monthly: 1,
  quarterly: 3,
  annual: 12,
  continuous: 12,
  as_needed: 12,
};

/** d plus n calendar months; the day clamps to the month's end (31 Jan + 1 = 28/29 Feb). */
export function addMonths(d: string, n: number): string {
  const p = parseDateOnly(d);
  if (!p) throw new Error(`Not a date: ${d}`);
  const y = p.getUTCFullYear();
  const m = p.getUTCMonth() + n;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return toDateOnly(new Date(Date.UTC(y, m, Math.min(p.getUTCDate(), lastDay))));
}

/** The next review date, or null when the job was never verified (due now). */
export function nextReview(cadence: Cadence | string | null | undefined, lastVerified: string | null | undefined): string | null {
  if (!lastVerified || !parseDateOnly(lastVerified)) return null;
  const months = REVIEW_MONTHS[(cadence as Cadence) ?? "continuous"] ?? 12;
  return addMonths(String(lastVerified).slice(0, 10), months);
}

/** Never verified, or the next review is before `today`. */
export function isReviewOverdue(
  cadence: Cadence | string | null | undefined,
  lastVerified: string | null | undefined,
  today: string
): boolean {
  const next = nextReview(cadence, lastVerified);
  return next === null || next < today;
}
