/**
 * Unit record dates (core/shared/units/record-dates.ts): a picked day is the
 * day the unit page shows, in every US zone. Before, a pet registered on
 * 11/16 showed as Nov 15 anywhere west of UTC (seen 2026-11-16 in Park
 * Terrace 2).
 */
import { afterEach, describe, it, expect } from "vitest";
import { dateInputToTimestamp, timestampToDateInput } from "#core/shared/units/record-dates";

const ORIGINAL_TZ = process.env.TZ;
afterEach(() => {
  process.env.TZ = ORIGINAL_TZ;
});

/** Node reads TZ afresh after a change, so local-time methods follow it. */
function inZone<T>(tz: string, fn: () => T): T {
  process.env.TZ = tz;
  return fn();
}

/** What the unit page shows (`fmtDate` in app/pages/[slug]/admin/units/[id].vue). */
const shown = (ts: string) => new Date(ts).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });

const ZONES = [
  "Pacific/Honolulu",
  "America/Anchorage",
  "America/Los_Angeles",
  "America/Phoenix",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Puerto_Rico",
  "UTC",
  "Europe/Berlin",
  "Asia/Tokyo",
];

describe("dateInputToTimestamp", () => {
  it("saves a picked day as noon UTC", () => {
    expect(dateInputToTimestamp("2026-11-16")).toBe("2026-11-16T12:00:00.000Z");
  });

  it("gives null for empty, junk and days that do not exist", () => {
    for (const v of ["", null, undefined, "soon", "2026-13-01", "2026-02-30", "2026-11-16T00:00:00Z"]) {
      expect(dateInputToTimestamp(v)).toBeNull();
    }
  });

  it("keeps a leap day", () => {
    expect(dateInputToTimestamp("2028-02-29")).toBe("2028-02-29T12:00:00.000Z");
  });
});

describe("the picked day is the day shown, in every zone", () => {
  for (const tz of ZONES) {
    it(tz, () =>
      inZone(tz, () => {
        for (const day of ["2026-11-16", "2026-03-08", "2026-11-01", "2026-12-31", "2027-01-01"]) {
          const saved = dateInputToTimestamp(day)!;
          expect(timestampToDateInput(saved)).toBe(day);
          const [y, m, d] = day.split("-").map(Number);
          expect(shown(saved)).toBe(new Date(y!, m! - 1, d!).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }));
        }
      }),
    );
  }

  it("the old conversion showed a day early in New York", () =>
    inZone("America/New_York", () => {
      const old = new Date("2026-11-16").toISOString();
      expect(shown(old)).toBe("Nov 15, 2026");
      expect(shown(dateInputToTimestamp("2026-11-16")!)).toBe("Nov 16, 2026");
    }));
});

describe("timestampToDateInput", () => {
  it("reads a stamped time as its day in the viewer's zone, as the page shows it", () => {
    // 9 pm on 16 November in New York is already the 17th in UTC.
    inZone("America/New_York", () => expect(timestampToDateInput("2026-11-17T02:00:00.000Z")).toBe("2026-11-16"));
    inZone("UTC", () => expect(timestampToDateInput("2026-11-17T02:00:00.000Z")).toBe("2026-11-17"));
  });

  it("gives '' for empty and invalid values", () => {
    for (const v of ["", null, undefined, "not a date"]) expect(timestampToDateInput(v)).toBe("");
  });
});
