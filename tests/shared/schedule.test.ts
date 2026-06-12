import { describe, it, expect } from "vitest";
import {
  parseDateOnly,
  toDateOnly,
  isWeekend,
  computeEndDate,
  spanDays,
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
