import { describe, expect, it } from "vitest";
import { isRsvpResponse, rsvpCounts, rsvpKey, rsvpOpen } from "#core/shared/meetings/rsvp";

describe("meeting RSVP", () => {
  const now = Date.parse("2026-11-26T12:00:00Z");
  const future = "2026-12-08T18:00:00Z";
  it("is open only for a published, scheduled meeting that has not started", () => {
    expect(rsvpOpen({ status: "scheduled", is_published: true, meeting_date: future }, now)).toBe(true);
    expect(rsvpOpen({ status: "scheduled", is_published: true, meeting_date: "2026-11-01T18:00:00Z" }, now)).toBe(false);
    expect(rsvpOpen({ status: "completed", is_published: true, meeting_date: future }, now)).toBe(false);
    expect(rsvpOpen({ status: "scheduled", is_published: false, meeting_date: future }, now)).toBe(false);
    expect(rsvpOpen({ status: "scheduled", is_published: true, meeting_date: null }, now)).toBe(false);
  });
  it("counts each answer and ignores anything else", () => {
    expect(rsvpCounts([{ response: "going" }, { response: "going" }, { response: "maybe" }, { response: "nope" }, {}])).toEqual({ going: 2, maybe: 1, not_going: 0 });
  });
  it("keys one RSVP per member per meeting and checks the answer", () => {
    expect(rsvpKey("m1", "p1")).toBe("m1:p1");
    expect(isRsvpResponse("not_going")).toBe(true);
    expect(isRsvpResponse("yes")).toBe(false);
  });
});
