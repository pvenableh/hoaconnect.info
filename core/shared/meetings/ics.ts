/**
 * A meeting as an iCalendar file (Phase 6: the "Add to calendar" button on the
 * meeting reminder's push). Pure — no Directus, no H3. The hoa_meetings row has
 * a start and no end, so the event runs an hour; the title, place and the
 * community's name carry what the member needs to place it.
 */
export interface IcsMeeting {
  id: string;
  title: string;
  startsAt: string;
  location?: string | null;
  orgName?: string | null;
  durationMinutes?: number;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** 20261110T190000Z */
export function icsUtc(d: Date): string {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

/** RFC 5545 TEXT escaping. */
export function icsEscape(text: string): string {
  return String(text ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/;/g, "\;")
    .replace(/,/g, "\\,");
}

/** Fold a content line at 75 octets (approximated by characters), continuation lines begin with a space. */
export function icsFold(line: string): string {
  if (line.length <= 75) return line;
  const parts = [line.slice(0, 75)];
  for (let i = 75; i < line.length; i += 74) parts.push(` ${line.slice(i, i + 74)}`);
  return parts.join("\r\n");
}

/** null when the start isn't a real date. */
export function buildMeetingIcs(m: IcsMeeting, now: Date = new Date()): string | null {
  const start = new Date(m.startsAt);
  if (Number.isNaN(start.getTime())) return null;
  const end = new Date(start.getTime() + (m.durationMinutes ?? 60) * 60_000);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//HOA Connect//Meetings//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:meeting-${m.id}@hoaconnect`,
    `DTSTAMP:${icsUtc(now)}`,
    `DTSTART:${icsUtc(start)}`,
    `DTEND:${icsUtc(end)}`,
    `SUMMARY:${icsEscape(m.title || "Meeting")}`,
    ...(m.location ? [`LOCATION:${icsEscape(m.location)}`] : []),
    ...(m.orgName ? [`DESCRIPTION:${icsEscape(`${m.orgName} — agenda and documents are in the portal.`)}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return `${lines.map(icsFold).join("\r\n")}\r\n`;
}
