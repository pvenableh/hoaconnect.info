/**
 * Calendar dates on a unit's records (a pet's or vehicle's "registered since",
 * a lease's start and end). The fields are timestamps, but the forms pick a
 * day, and the unit page shows a day in the viewer's time zone.
 *
 * A picked day is saved as noon UTC: the same calendar day everywhere from
 * UTC−11 to UTC+11, so every US zone reads back the day that was picked.
 * Midnight UTC, which `new Date("2026-11-16").toISOString()` gives, is the
 * evening before anywhere west of UTC, so the page showed a day early.
 *
 * A stored timestamp goes back into a form as its day in the viewer's zone,
 * the same day the page shows. That also holds for rows stamped with the
 * current time (a record with no picked date, an ended record).
 */

const DATE_INPUT = /^(\d{4})-(\d{2})-(\d{2})$/;

/** `YYYY-MM-DD` from a date input → the timestamp to save, or null when empty or not a date. */
export function dateInputToTimestamp(value: string | null | undefined): string | null {
  const m = DATE_INPUT.exec(value ?? "");
  if (!m) return null;
  const at = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
  // Refuse days that roll over (2026-02-30 would become 2 March).
  if (at.getUTCDate() !== Number(m[3]) || at.getUTCMonth() !== Number(m[2]) - 1) return null;
  return at.toISOString();
}

/** A stored timestamp → `YYYY-MM-DD` for a date input, its day in the viewer's zone; "" when empty or invalid. */
export function timestampToDateInput(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
