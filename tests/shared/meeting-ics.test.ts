import { describe, expect, it } from "vitest";
import { buildMeetingIcs, icsEscape, icsFold } from "#core/shared/meetings/ics";

describe("buildMeetingIcs", () => {
  const now = new Date("2026-11-03T12:00:00Z");

  it("a one-hour VEVENT in UTC with the place and the community", () => {
    const ics = buildMeetingIcs({ id: "m1", title: "Board meeting", startsAt: "2026-11-10T19:00:00Z", location: "Clubhouse, Room 2", orgName: "Oak Court" }, now)!;
    expect(ics.split("\r\n")).toEqual(
      expect.arrayContaining([
        "BEGIN:VCALENDAR",
        "UID:meeting-m1@hoaconnect",
        "DTSTAMP:20261103T120000Z",
        "DTSTART:20261110T190000Z",
        "DTEND:20261110T200000Z",
        "SUMMARY:Board meeting",
        "LOCATION:Clubhouse\\, Room 2",
        "END:VEVENT",
        "END:VCALENDAR",
      ])
    );
    expect(ics.endsWith("\r\n")).toBe(true);
  });

  it("no start date → null, so the route 404s instead of serving a broken file", () => {
    expect(buildMeetingIcs({ id: "m1", title: "x", startsAt: "" })).toBeNull();
    expect(buildMeetingIcs({ id: "m1", title: "x", startsAt: "not a date" })).toBeNull();
  });

  it("escapes TEXT and folds long lines", () => {
    expect(icsEscape("a,b;c\\d\ne")).toBe("a\\,b\;c\\\\d\\ne");
    const folded = icsFold(`SUMMARY:${"x".repeat(200)}`).split("\r\n");
    expect(folded.length).toBeGreaterThan(2);
    expect(folded.every((l) => l.length <= 75)).toBe(true);
    expect(folded.slice(1).every((l) => l.startsWith(" "))).toBe(true);
  });
});
