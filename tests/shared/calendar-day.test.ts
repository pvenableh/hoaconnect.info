/**
 * A date with no time is a calendar day: every viewer sees the day as
 * written, whatever their time zone. A timestamp stays on the viewer's own
 * calendar. (A charge due "2026-12-01" read "Nov 30, 2026" west of UTC.)
 */
import { describe, it, expect, afterEach } from "vitest";
import { formatCalendarDay } from "#core/shared/calendar-day";

const realTZ = process.env.TZ;
afterEach(() => {
  process.env.TZ = realTZ;
});

describe("formatCalendarDay", () => {
  it("shows a date-only value as written, west and east of UTC", () => {
    for (const tz of ["America/Los_Angeles", "America/New_York", "UTC", "Asia/Tokyo", "Pacific/Kiritimati"]) {
      process.env.TZ = tz;
      expect(formatCalendarDay("2026-12-01"), tz).toBe("Dec 1, 2026");
      expect(formatCalendarDay("2027-01-01", { year: "numeric", month: "long", day: "numeric" }), tz).toBe("January 1, 2027");
    }
  });

  it("shows a timestamp on the viewer's calendar", () => {
    process.env.TZ = "America/Los_Angeles";
    expect(formatCalendarDay("2026-12-01T03:00:00Z")).toBe("Nov 30, 2026");
    process.env.TZ = "UTC";
    expect(formatCalendarDay("2026-12-01T03:00:00Z")).toBe("Dec 1, 2026");
  });

  it("says nothing for nothing, or for nonsense", () => {
    expect(formatCalendarDay(null)).toBe("—");
    expect(formatCalendarDay("", undefined, "No due date")).toBe("No due date");
    expect(formatCalendarDay("not a date")).toBe("—");
    expect(formatCalendarDay("2026-13-45")).toBe("—");
    expect(formatCalendarDay("2026-02-30")).toBe("—");
  });
});
