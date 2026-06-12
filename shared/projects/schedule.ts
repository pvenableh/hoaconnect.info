/**
 * Project timeline date math — shared between server routes and client
 * composables so the schedule is computed identically everywhere.
 *
 * Durations are in BUSINESS DAYS (Mon–Fri); weekends don't count. This
 * mirrors how Earnest's timeline reads ("a 5-day phase" = one work week).
 */

const MS_PER_DAY = 86_400_000;

/** Parse a YYYY-MM-DD (or ISO) string to a UTC Date at midnight, or null. */
export function parseDateOnly(value: string | null | undefined): Date | null {
  if (!value) return null;
  const s = String(value).slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Format a Date as YYYY-MM-DD (UTC). */
export function toDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** True for Saturday (6) / Sunday (0) in UTC. */
export function isWeekend(d: Date): boolean {
  const day = d.getUTCDay();
  return day === 0 || day === 6;
}

/**
 * Add `businessDays` working days to a start date and return the resulting
 * date (YYYY-MM-DD). A duration of 1 means the work finishes the same day
 * it starts (a single working day), so we advance `businessDays - 1` working
 * days from the start. Returns null when inputs are unusable.
 *
 *   computeEndDate("2026-06-11", 1) -> "2026-06-11" (Thu)
 *   computeEndDate("2026-06-11", 2) -> "2026-06-12" (Fri)
 *   computeEndDate("2026-06-11", 3) -> "2026-06-15" (skips the weekend → Mon)
 */
export function computeEndDate(
  startDate: string | null | undefined,
  businessDays: number | null | undefined
): string | null {
  const start = parseDateOnly(startDate);
  if (!start) return null;
  const days = Number(businessDays);
  if (!Number.isFinite(days) || days < 1) return toDateOnly(start);

  // If the start lands on a weekend, roll forward to the next working day
  // before counting — the phase can't begin on a Saturday.
  let cursor = new Date(start.getTime());
  while (isWeekend(cursor)) cursor = new Date(cursor.getTime() + MS_PER_DAY);

  let remaining = Math.floor(days) - 1;
  while (remaining > 0) {
    cursor = new Date(cursor.getTime() + MS_PER_DAY);
    if (!isWeekend(cursor)) remaining--;
  }
  return toDateOnly(cursor);
}

/** Count of calendar days an event spans (inclusive), for timeline widths. */
export function spanDays(startDate: string | null | undefined, endDate: string | null | undefined): number {
  const start = parseDateOnly(startDate);
  const end = parseDateOnly(endDate);
  if (!start || !end) return 1;
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / MS_PER_DAY) + 1);
}
