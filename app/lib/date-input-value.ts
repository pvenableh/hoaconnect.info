/**
 * The v-model contract DateInput / DateTimeInput keep: the SAME strings the raw
 * inputs they replace emit, so the sweep from `<Input type="date" v-model>` is a
 * tag swap and no call site, payload or Directus field changes shape.
 *
 *   date            "YYYY-MM-DD"        (Directus `date`)
 *   datetime-local  "YYYY-MM-DDTHH:mm"  (Directus `dateTime`, no zone)
 *   cleared         ""                  (what an emptied raw input emits)
 *
 * Inbound values are forgiving: a Directus timestamp ("2026-10-24T09:30:00",
 * "2026-10-24T09:30:00.000Z") is read for its wall-clock date/time, which is
 * what the raw input showed when bound to the same value.
 */
import { CalendarDate, CalendarDateTime } from "@internationalized/date";

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})/;
const TIME_RE = /T(\d{2}):(\d{2})/;

export function toCalendarDate(value: string | null | undefined): CalendarDate | undefined {
  const m = value ? DATE_RE.exec(value) : null;
  if (!m) return undefined;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return undefined;
  return new CalendarDate(y, mo, d);
}

export function toCalendarDateTime(
  value: string | null | undefined,
): CalendarDateTime | undefined {
  const date = toCalendarDate(value);
  if (!date) return undefined;
  const t = TIME_RE.exec(value!);
  return new CalendarDateTime(
    date.year,
    date.month,
    date.day,
    t ? Number(t[1]) : 0,
    t ? Number(t[2]) : 0,
  );
}

const pad = (n: number, w = 2) => String(n).padStart(w, "0");

export function fromDateValue(
  value: { year: number; month: number; day: number } | null | undefined,
): string {
  if (!value) return "";
  return `${pad(value.year, 4)}-${pad(value.month)}-${pad(value.day)}`;
}

export function fromDateTimeValue(
  value: { year: number; month: number; day: number; hour?: number; minute?: number } | null | undefined,
): string {
  if (!value) return "";
  return `${fromDateValue(value)}T${pad(value.hour ?? 0)}:${pad(value.minute ?? 0)}`;
}
