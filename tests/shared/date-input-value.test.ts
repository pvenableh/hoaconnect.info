import { describe, it, expect } from "vitest";
import {
  toCalendarDate,
  toCalendarDateTime,
  fromDateValue,
  fromDateTimeValue,
} from "~/components/ui/date-input/value";

describe("DateInput v-model contract (same strings as the raw inputs)", () => {
  it("round-trips a date", () => {
    expect(fromDateValue(toCalendarDate("2026-03-07"))).toBe("2026-03-07");
  });

  it("round-trips a datetime-local value", () => {
    expect(fromDateTimeValue(toCalendarDateTime("2026-03-07T09:05"))).toBe("2026-03-07T09:05");
  });

  it("reads a Directus timestamp for its wall-clock date and time", () => {
    expect(fromDateValue(toCalendarDate("2026-10-24T23:30:00.000Z"))).toBe("2026-10-24");
    expect(fromDateTimeValue(toCalendarDateTime("2026-10-24T23:30:00"))).toBe("2026-10-24T23:30");
  });

  it("a date-only value opens a datetime field at midnight", () => {
    expect(fromDateTimeValue(toCalendarDateTime("2026-10-24"))).toBe("2026-10-24T00:00");
  });

  it("empty and junk read as no value, and no value emits ''", () => {
    for (const v of ["", null, undefined, "soon", "2026-13-01"]) {
      expect(toCalendarDate(v as any)).toBeUndefined();
    }
    expect(fromDateValue(undefined)).toBe("");
    expect(fromDateTimeValue(null)).toBe("");
  });
});
