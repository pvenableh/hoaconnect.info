import { describe, it, expect } from "vitest";
import {
  parseDateOnly,
  toDateOnly,
  isWeekend,
  computeEndDate,
  spanDays,
  nextBusinessDay,
  computeDependencyShifts,
  type ScheduleEvent,
} from "~~/shared/projects/schedule";

describe("parseDateOnly / toDateOnly", () => {
  it("round-trips a YYYY-MM-DD string", () => {
    const d = parseDateOnly("2026-06-11");
    expect(d).not.toBeNull();
    expect(toDateOnly(d!)).toBe("2026-06-11");
  });

  it("accepts an ISO timestamp and keeps the date part", () => {
    expect(toDateOnly(parseDateOnly("2026-06-11T18:30:00Z")!)).toBe("2026-06-11");
  });

  it("returns null for garbage", () => {
    expect(parseDateOnly("nope")).toBeNull();
    expect(parseDateOnly("")).toBeNull();
    expect(parseDateOnly(null)).toBeNull();
  });
});

describe("isWeekend", () => {
  it("flags Saturday and Sunday (UTC)", () => {
    expect(isWeekend(parseDateOnly("2026-06-13")!)).toBe(true); // Sat
    expect(isWeekend(parseDateOnly("2026-06-14")!)).toBe(true); // Sun
  });
  it("clears Monday–Friday", () => {
    expect(isWeekend(parseDateOnly("2026-06-11")!)).toBe(false); // Thu
    expect(isWeekend(parseDateOnly("2026-06-12")!)).toBe(false); // Fri
  });
});

describe("computeEndDate (business days)", () => {
  it("a 1-day phase finishes the day it starts", () => {
    // 2026-06-11 is a Thursday
    expect(computeEndDate("2026-06-11", 1)).toBe("2026-06-11");
  });

  it("a 2-day phase finishes the next working day", () => {
    expect(computeEndDate("2026-06-11", 2)).toBe("2026-06-12"); // Thu → Fri
  });

  it("skips the weekend when the span crosses it", () => {
    // Thu(11) day1, Fri(12) day2, skip Sat/Sun, Mon(15) day3
    expect(computeEndDate("2026-06-11", 3)).toBe("2026-06-15");
  });

  it("rolls a weekend start forward to Monday before counting", () => {
    // Sat 2026-06-13 → start Monday 15th; 1 business day ends same day
    expect(computeEndDate("2026-06-13", 1)).toBe("2026-06-15");
  });

  it("treats a 5-day phase as a full work week", () => {
    // Mon 2026-06-08 + 5 business days → Fri 2026-06-12
    expect(computeEndDate("2026-06-08", 5)).toBe("2026-06-12");
  });

  it("clamps non-positive / non-finite durations to the start date", () => {
    expect(computeEndDate("2026-06-11", 0)).toBe("2026-06-11");
    expect(computeEndDate("2026-06-11", -3)).toBe("2026-06-11");
    expect(computeEndDate("2026-06-11", null)).toBe("2026-06-11");
  });

  it("returns null when the start date is unusable", () => {
    expect(computeEndDate(null, 5)).toBeNull();
    expect(computeEndDate("bad", 5)).toBeNull();
  });
});

describe("spanDays", () => {
  it("counts inclusive calendar days", () => {
    expect(spanDays("2026-06-11", "2026-06-11")).toBe(1);
    expect(spanDays("2026-06-11", "2026-06-15")).toBe(5);
  });
  it("defaults to 1 on missing input", () => {
    expect(spanDays(null, "2026-06-15")).toBe(1);
    expect(spanDays("2026-06-11", null)).toBe(1);
  });
});

describe("nextBusinessDay", () => {
  it("returns the following weekday", () => {
    expect(nextBusinessDay("2026-06-11")).toBe("2026-06-12"); // Thu → Fri
  });
  it("jumps the weekend", () => {
    expect(nextBusinessDay("2026-06-12")).toBe("2026-06-15"); // Fri → Mon
  });
  it("returns null for garbage", () => {
    expect(nextBusinessDay(null)).toBeNull();
  });
});

describe("computeDependencyShifts", () => {
  // A(Mon 8th, 2d → Tue 9th) → B(Wed 10th, 2d → Thu 11th) → C(Fri 12th, 1d)
  const chain = (): ScheduleEvent[] => [
    { id: "A", title: "A", event_date: "2026-06-08", duration_days: 2, end_date: "2026-06-09" },
    { id: "B", title: "B", event_date: "2026-06-10", duration_days: 2, end_date: "2026-06-11", depends_on: "A" },
    { id: "C", title: "C", event_date: "2026-06-12", duration_days: 1, end_date: "2026-06-12", depends_on: "B" },
  ];

  it("is empty when nothing actually moves", () => {
    // Re-assert A's current dates → no movement anywhere.
    expect(computeDependencyShifts(chain(), "A", "2026-06-08", 2)).toEqual([]);
  });

  it("cascades a forward shift through the whole chain", () => {
    // Push A out by a week: Mon 15th, 2d → Tue 16th.
    const shifts = computeDependencyShifts(chain(), "A", "2026-06-15", 2);
    expect(shifts.map((s) => s.id)).toEqual(["A", "B", "C"]);
    const byId = Object.fromEntries(shifts.map((s) => [s.id, s]));
    expect(byId.A.newEnd).toBe("2026-06-16");
    expect(byId.B.newStart).toBe("2026-06-17"); // next business day after A's end
    expect(byId.B.newEnd).toBe("2026-06-18");
    expect(byId.C.newStart).toBe("2026-06-19"); // next business day after B's end (Fri)
  });

  it("only pushes forward — slack downstream absorbs an early move", () => {
    // Move A earlier; B already starts after A's new end, so B/C don't move.
    const shifts = computeDependencyShifts(chain(), "A", "2026-06-01", 2);
    expect(shifts.map((s) => s.id)).toEqual(["A"]);
  });

  it("stops the cascade when a dependent still has room", () => {
    // C sits far in the future; shifting B by a day shouldn't reach C.
    const events: ScheduleEvent[] = [
      { id: "B", title: "B", event_date: "2026-06-10", duration_days: 2, end_date: "2026-06-11" },
      { id: "C", title: "C", event_date: "2026-07-01", duration_days: 1, end_date: "2026-07-01", depends_on: "B" },
    ];
    const shifts = computeDependencyShifts(events, "B", "2026-06-11", 2);
    expect(shifts.map((s) => s.id)).toEqual(["B"]);
  });

  it("is cycle-safe", () => {
    const events: ScheduleEvent[] = [
      { id: "X", event_date: "2026-06-08", duration_days: 1, end_date: "2026-06-08", depends_on: "Y" },
      { id: "Y", event_date: "2026-06-09", duration_days: 1, end_date: "2026-06-09", depends_on: "X" },
    ];
    expect(() => computeDependencyShifts(events, "X", "2026-06-15", 1)).not.toThrow();
  });
});
