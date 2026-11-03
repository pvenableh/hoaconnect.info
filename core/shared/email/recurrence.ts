/**
 * Recurring emails (Earnest parity round 3, Phase 4): the rules, the next run,
 * and the sentence the composer shows under the Repeat picker. Shared so the
 * preview says exactly what completion will do (`completeSend` in
 * core/server/utils/email-send-queue.ts rolls a finished occurrence forward
 * through `computeNextRun`).
 *
 * Arithmetic is on the wall clock in `timeZone` (the composer's, stored as
 * `hoa_emails.recurrence_timezone`; UTC when there is none): 9:00 stays 9:00
 * across a daylight-saving change, and "the second Tuesday" is the sender's
 * Tuesday, not UTC's.
 *
 * Each run is computed from the one before it (there is no separate anchor),
 * so a monthly email on the 31st settles on the 30th or 28th after a short
 * month. The nth-weekday rules don't drift: every occurrence is itself the nth
 * (or last) weekday.
 */
import { fromAbsolute, toCalendarDate, type ZonedDateTime } from "@internationalized/date";

export const RECURRENCE_RULES = [
  "none",
  "daily",
  "weekly",
  "biweekly",
  "monthly",
  "monthly_nth_weekday",
  "monthly_last_weekday",
  "quarterly",
  "annual",
] as const;
export type RecurrenceRule = (typeof RECURRENCE_RULES)[number];

export function isRecurrenceRule(v: unknown): v is RecurrenceRule {
  return typeof v === "string" && (RECURRENCE_RULES as readonly string[]).includes(v);
}

/** A valid IANA zone, or null. */
export function validTimeZone(tz: unknown): string | null {
  if (typeof tz !== "string" || !tz || tz.length > 64) return null;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return null;
  }
}

const zoned = (d: Date, timeZone?: string | null) => fromAbsolute(d.getTime(), validTimeZone(timeZone) ?? "UTC");

/** 0 = Sunday … 6 = Saturday, of the zoned date. */
function weekdayOf(z: ZonedDateTime): number {
  const c = toCalendarDate(z);
  return new Date(Date.UTC(c.year, c.month - 1, c.day)).getUTCDay();
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Which occurrence of its weekday in the month a date is: 1–5. */
export function weekOrdinal(day: number): number {
  return Math.ceil(day / 7);
}

/** Is this the last such weekday of its month? */
export function isLastWeekdayOfMonth(z: { year: number; month: number; day: number }): boolean {
  return z.day + 7 > daysInMonth(z.year, z.month);
}

/** The nth (1–4, or 5 = last) given weekday of the month after `z`, at `z`'s time. */
function nthWeekdayNextMonth(z: ZonedDateTime, weekday: number, n: number | "last"): ZonedDateTime {
  const first = z.set({ day: 1 }).add({ months: 1 });
  const firstDow = weekdayOf(first);
  const dim = daysInMonth(first.year, first.month);
  let day = 1 + ((weekday - firstDow + 7) % 7);
  if (n === "last") {
    while (day + 7 <= dim) day += 7;
  } else {
    day += (n - 1) * 7;
    if (day > dim) day -= 7; // a fifth that this month doesn't have: its last
  }
  return first.set({ day });
}

/**
 * The run after `base`, or null when the rule doesn't repeat. `base` is the
 * occurrence that just ran (its `scheduled_at`).
 */
export function computeNextRun(base: Date, rule: string | null | undefined, timeZone?: string | null): Date | null {
  if (!rule || rule === "none" || Number.isNaN(base.getTime())) return null;
  const z = zoned(base, timeZone);
  let next: ZonedDateTime;
  switch (rule) {
    case "daily":
      next = z.add({ days: 1 });
      break;
    case "weekly":
      next = z.add({ weeks: 1 });
      break;
    case "biweekly":
      next = z.add({ weeks: 2 });
      break;
    case "monthly":
      next = z.add({ months: 1 });
      break;
    case "quarterly":
      next = z.add({ months: 3 });
      break;
    case "annual":
      next = z.add({ years: 1 });
      break;
    case "monthly_nth_weekday": {
      const n = weekOrdinal(z.day);
      next = nthWeekdayNextMonth(z, weekdayOf(z), n >= 5 ? "last" : n);
      break;
    }
    case "monthly_last_weekday":
      next = nthWeekdayNextMonth(z, weekdayOf(z), "last");
      break;
    default:
      return null;
  }
  return next.toDate();
}

// ── The sentence ────────────────────────────────────────────────────────────

const ORDINAL_WORDS = ["first", "second", "third", "fourth", "fifth"];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function dayOrdinal(d: number): string {
  const s = d % 100 >= 11 && d % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][d % 10] || "th";
  return `${d}${s}`;
}

/** The Repeat picker's choices for a chosen date: the nth-weekday ones name the weekday. */
export function recurrenceOptions(scheduledAt: Date | null, timeZone?: string | null): Array<{ value: RecurrenceRule; label: string }> {
  const opts: Array<{ value: RecurrenceRule; label: string }> = [
    { value: "none", label: "Does not repeat" },
    { value: "daily", label: "Daily" },
    { value: "weekly", label: "Weekly" },
    { value: "biweekly", label: "Every two weeks" },
    { value: "monthly", label: "Monthly" },
  ];
  if (scheduledAt && !Number.isNaN(scheduledAt.getTime())) {
    const z = zoned(scheduledAt, timeZone);
    const wd = WEEKDAYS[weekdayOf(z)];
    const n = weekOrdinal(z.day);
    if (n <= 4) opts.push({ value: "monthly_nth_weekday", label: `Monthly on the ${ORDINAL_WORDS[n - 1]} ${wd}` });
    if (isLastWeekdayOfMonth(z)) opts.push({ value: "monthly_last_weekday", label: `Monthly on the last ${wd}` });
  }
  opts.push({ value: "quarterly", label: "Every three months" }, { value: "annual", label: "Yearly" });
  return opts;
}

/**
 * "Every second Tuesday at 9:00 AM — first on Tue, Nov 10, then Tue, Dec 8."
 * Null for a one-off send.
 */
export function recurrenceSentence(
  rule: string | null | undefined,
  scheduledAt: Date | null,
  timeZone?: string | null,
  locale = "en-US"
): string | null {
  if (!rule || rule === "none" || !scheduledAt || Number.isNaN(scheduledAt.getTime())) return null;
  const tz = validTimeZone(timeZone) ?? "UTC";
  const z = zoned(scheduledAt, tz);
  const wd = WEEKDAYS[weekdayOf(z)];
  const time = new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", timeZone: tz }).format(scheduledAt);
  const monthDay = new Intl.DateTimeFormat(locale, { month: "long", day: "numeric", timeZone: tz }).format(scheduledAt);
  const n = weekOrdinal(z.day);
  const cadence: Record<string, string> = {
    daily: "Every day",
    weekly: `Every ${wd}`,
    biweekly: `Every other ${wd}`,
    monthly: `Every month on the ${dayOrdinal(z.day)}`,
    monthly_nth_weekday: `Every ${n >= 5 ? "last" : ORDINAL_WORDS[n - 1]} ${wd} of the month`,
    monthly_last_weekday: `Every last ${wd} of the month`,
    quarterly: `Every three months on the ${dayOrdinal(z.day)}`,
    annual: `Every year on ${monthDay}`,
  };
  const head = cadence[rule];
  if (!head) return null;
  const short = new Intl.DateTimeFormat(locale, { weekday: "short", month: "short", day: "numeric", timeZone: tz });
  const next = computeNextRun(scheduledAt, rule, tz);
  return `${head} at ${time} — first on ${short.format(scheduledAt)}${next ? `, then ${short.format(next)}` : ""}.`;
}
