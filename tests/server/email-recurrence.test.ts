/**
 * Recurrence (Earnest parity round 3, Phase 4; core/shared/email/recurrence.ts):
 * the next run for every rule, on the sender's wall clock; the Repeat choices;
 * the sentence; and completion rolling a scheduled occurrence forward in the
 * email's own time zone.
 */
import { describe, expect, it } from "vitest";
import {
  computeNextRun,
  recurrenceOptions,
  recurrenceSentence,
  RECURRENCE_RULES,
  validTimeZone,
} from "#core/shared/email/recurrence";
import { completeSend } from "#core/server/utils/email-send-queue";
import { MemoryStore, fakeClock, seedSending } from "./support/email-queue-memory";

const NY = "America/New_York";
const iso = (d: Date | null) => d?.toISOString() ?? null;

describe("computeNextRun: the table", () => {
  // Tue 2026-11-10 09:00 New York (EST, -05:00) = 14:00Z.
  const tue = new Date("2026-11-10T14:00:00Z");
  it.each([
    ["none", null],
    ["daily", "2026-11-11T14:00:00.000Z"],
    ["weekly", "2026-11-17T14:00:00.000Z"],
    ["biweekly", "2026-11-24T14:00:00.000Z"],
    ["monthly", "2026-12-10T14:00:00.000Z"],
    ["monthly_nth_weekday", "2026-12-08T14:00:00.000Z"], // second Tuesday of December
    ["quarterly", "2027-02-10T14:00:00.000Z"],
    ["annual", "2027-11-10T14:00:00.000Z"],
    ["fortnightly-typo", null],
  ])("%s", (rule, want) => {
    expect(iso(computeNextRun(tue, rule, NY))).toBe(want);
  });

  it("every rule the composer can pick is handled", () => {
    for (const rule of RECURRENCE_RULES) {
      const next = computeNextRun(tue, rule, NY);
      expect(rule === "none" ? next === null : next instanceof Date).toBe(true);
    }
  });

  it("the last Tuesday stays the last Tuesday (Nov 24 → Dec 29 → Jan 26)", () => {
    const a = computeNextRun(new Date("2026-11-24T14:00:00Z"), "monthly_last_weekday", NY)!;
    expect(iso(a)).toBe("2026-12-29T14:00:00.000Z");
    expect(iso(computeNextRun(a, "monthly_last_weekday", NY))).toBe("2027-01-26T14:00:00.000Z");
  });

  it("a fifth weekday rolls to the next month's last (Dec 29 is the 5th Tuesday; January has four)", () => {
    expect(iso(computeNextRun(new Date("2026-12-29T14:00:00Z"), "monthly_nth_weekday", NY))).toBe("2027-01-26T14:00:00.000Z");
  });

  it("the nth weekday doesn't drift: second Tuesday for a year", () => {
    let d = new Date("2026-11-10T14:00:00Z");
    for (let i = 0; i < 12; i++) {
      d = computeNextRun(d, "monthly_nth_weekday", NY)!;
      const local = new Date(d.toLocaleString("en-US", { timeZone: NY }));
      expect(local.getDay()).toBe(2);
      expect(Math.ceil(local.getDate() / 7)).toBe(2);
    }
  });

  it("9:00 stays 9:00 across daylight saving (New York, Oct 27 → Nov 3 2026)", () => {
    const before = new Date("2026-10-27T13:00:00Z"); // 09:00 EDT
    expect(iso(computeNextRun(before, "weekly", NY))).toBe("2026-11-03T14:00:00.000Z"); // 09:00 EST
  });

  it("the sender's Tuesday, not UTC's: Tue 21:00 New York is Wed in UTC", () => {
    const tueEvening = new Date("2026-11-11T02:00:00Z"); // Tue Nov 10, 21:00 EST
    // New York: the second Tuesday of December, 21:00 → Dec 9 02:00Z.
    expect(iso(computeNextRun(tueEvening, "monthly_nth_weekday", NY))).toBe("2026-12-09T02:00:00.000Z");
    // UTC (no zone stored): the second Wednesday of December, 02:00Z.
    expect(iso(computeNextRun(tueEvening, "monthly_nth_weekday", null))).toBe("2026-12-09T02:00:00.000Z");
    // …which differs when the month starts on a Wednesday (Sept 2027 → 2nd Tue is the 14th, 2nd Wed the 8th).
    const aug = new Date("2027-08-11T01:00:00Z"); // Tue Aug 10 2027, 21:00 EDT (second Tuesday)
    expect(iso(computeNextRun(aug, "monthly_nth_weekday", NY))).toBe("2027-09-15T01:00:00.000Z");
    expect(iso(computeNextRun(aug, "monthly_nth_weekday", null))).toBe("2027-09-08T01:00:00.000Z");
  });

  it("monthly on the 31st settles on the month's last day (no overflow into the next month)", () => {
    expect(iso(computeNextRun(new Date("2027-01-31T14:00:00Z"), "monthly", NY))).toBe("2027-02-28T14:00:00.000Z");
  });

  it("validTimeZone accepts IANA zones only", () => {
    expect(validTimeZone(NY)).toBe(NY);
    expect(validTimeZone("Mars/Olympus")).toBeNull();
    expect(validTimeZone(42)).toBeNull();
  });
});

describe("the composer's choices and sentence", () => {
  it("a second Tuesday offers 'Monthly on the second Tuesday'; a last one offers the last", () => {
    const second = recurrenceOptions(new Date("2026-11-10T14:00:00Z"), NY).map((o) => o.label);
    expect(second).toContain("Monthly on the second Tuesday");
    expect(second).not.toContain("Monthly on the last Tuesday");
    const last = recurrenceOptions(new Date("2026-11-24T14:00:00Z"), NY).map((o) => o.label);
    expect(last).toEqual(expect.arrayContaining(["Monthly on the fourth Tuesday", "Monthly on the last Tuesday"]));
    expect(recurrenceOptions(null).map((o) => o.value)).toEqual(["none", "daily", "weekly", "biweekly", "monthly", "quarterly", "annual"]);
  });

  it.each([
    ["monthly_nth_weekday", "Every second Tuesday of the month at 9:00 AM — first on Tue, Nov 10, then Tue, Dec 8."],
    ["weekly", "Every Tuesday at 9:00 AM — first on Tue, Nov 10, then Tue, Nov 17."],
    ["biweekly", "Every other Tuesday at 9:00 AM — first on Tue, Nov 10, then Tue, Nov 24."],
    ["monthly", "Every month on the 10th at 9:00 AM — first on Tue, Nov 10, then Thu, Dec 10."],
    ["annual", "Every year on November 10 at 9:00 AM — first on Tue, Nov 10, then Wed, Nov 10."],
    ["daily", "Every day at 9:00 AM — first on Tue, Nov 10, then Wed, Nov 11."],
  ])("%s", (rule, want) => {
    expect(recurrenceSentence(rule, new Date("2026-11-10T14:00:00Z"), NY)).toBe(want);
  });

  it("no sentence for a one-off or without a date", () => {
    expect(recurrenceSentence("none", new Date())).toBeNull();
    expect(recurrenceSentence("weekly", null)).toBeNull();
  });
});

describe("completion rolls forward in the email's zone", () => {
  it("a scheduled occurrence of a second-Tuesday email returns to scheduled for the next one", async () => {
    const store = new MemoryStore();
    const runKey = "s:2026-11-11T02:00:00.000Z";
    const { emailId } = await seedSending(store, 1, { runKey });
    Object.assign(store.email(emailId), { scheduled_at: "2026-11-11T02:00:00.000Z", recurrence_rule: "monthly_nth_weekday" });
    store.rowsOf(emailId)[0]!.status = "sent";
    (store as any).recurrenceTimeZone = async () => NY;
    await completeSend(store, store.email(emailId), await store.counts(emailId, runKey), fakeClock());
    expect(store.email(emailId)).toMatchObject({ status: "scheduled", scheduled_at: "2026-12-09T02:00:00.000Z", next_run_at: "2026-12-09T02:00:00.000Z" });
  });

  it("without a stored zone it rolls forward on UTC, as before", async () => {
    const store = new MemoryStore();
    const runKey = "s:2026-11-03T12:00:00.000Z";
    const { emailId } = await seedSending(store, 1, { runKey });
    Object.assign(store.email(emailId), { scheduled_at: "2026-11-03T12:00:00.000Z", recurrence_rule: "weekly" });
    store.rowsOf(emailId)[0]!.status = "sent";
    await completeSend(store, store.email(emailId), await store.counts(emailId, runKey), fakeClock());
    expect(store.email(emailId).scheduled_at).toBe("2026-11-10T12:00:00.000Z");
  });
});
