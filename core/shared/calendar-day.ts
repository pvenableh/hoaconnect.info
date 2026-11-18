/**
 * Showing a date that has no time. A Directus `date` column (a charge's
 * `due_date`, a schedule's `next_payment_date`) arrives as "2026-12-01".
 * `new Date("2026-12-01")` is midnight UTC, which a viewer west of UTC sees as
 * the evening before: "Nov 30, 2026" for a charge due Dec 1. A calendar day
 * is formatted as written, in UTC, so every viewer sees the same day.
 *
 * A timestamp ("2026-12-01T14:30:00Z", a `paid_at`) is a moment, and is still
 * shown on the viewer's own calendar.
 */
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

const DEFAULT: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" };

/** "Dec 1, 2026" for "2026-12-01"; a timestamp on the viewer's calendar; `empty` for nothing or nonsense. */
export function formatCalendarDay(
  value: string | null | undefined,
  options: Intl.DateTimeFormatOptions = DEFAULT,
  empty = "—",
  locale = "en-US"
): string {
  if (!value) return empty;
  const m = DATE_ONLY.exec(String(value).trim());
  if (m) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const day = new Date(Date.UTC(y, mo - 1, d));
    // "2026-13-45" would roll over into another month: not a day at all.
    if (day.getUTCFullYear() !== y || day.getUTCMonth() !== mo - 1 || day.getUTCDate() !== d) return empty;
    return day.toLocaleDateString(locale, { ...options, timeZone: "UTC" });
  }
  const at = new Date(value);
  return Number.isNaN(at.getTime()) ? empty : at.toLocaleDateString(locale, options);
}
