/**
 * A community's time zone (`hoa_organizations.timezone`, IANA; Earnest parity
 * round 3, Phase 5a). Reminders fire on the community's wall clock ("dues are
 * due tomorrow" means its tomorrow) and the notification digest goes out at the
 * member's digest hour in it.
 *
 * The default is America/New_York because that is what every digest already
 * used (the one global `DIGEST_TZ`, set to New York in the digest workflow and
 * defaulted to it in the worker): an org that never sets its zone keeps the
 * times it has today. `scripts/create-reminder-log.ts` adds the field with this
 * default; until it runs, the field is absent and this is the answer.
 */
import { validTimeZone } from "./email/recurrence";

export const DEFAULT_ORG_TIMEZONE = "America/New_York";

/** The org's zone, or the default when it is unset or not a real IANA zone. */
export function orgTimeZone(org: { timezone?: string | null } | null | undefined): string {
  return validTimeZone(org?.timezone) ?? DEFAULT_ORG_TIMEZONE;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** The hour (0–23) and weekday (0 = Sunday) of `now` on the wall clock of `timeZone`. */
export function localHourAndWeekday(timeZone: string, now: Date): { hour: number; dow: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: validTimeZone(timeZone) ?? DEFAULT_ORG_TIMEZONE,
    hour: "numeric",
    hour12: false,
    weekday: "short",
  }).formatToParts(now);
  let hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  if (hour === 24) hour = 0;
  const dow = WEEKDAYS.indexOf(parts.find((p) => p.type === "weekday")?.value ?? "Sun");
  return { hour, dow: dow < 0 ? 0 : dow };
}
