import { describe, expect, it } from "vitest";
import {
  buildDemoLedger,
  DEMO_ROUND3,
  DEMO_SEED_NOTE,
  DEMO_TIME_ZONE,
  demoReminderSettings,
  expenseKey,
  LEDGER_MONTHS,
  ledgerMonths,
  ledgerWindowStart,
  nextRecurringRun,
  occupiedKey,
  requestKey,
  sameRows,
} from "../../core/shared/demo/round3";
import { DEMO_DEFS } from "../../core/shared/demo/seed";
import { anyReminderEnabled, REMINDER_RULES, resolveReminderSettings } from "../../core/shared/reminders/settings";
import { computeNextRun } from "../../core/shared/email/recurrence";
import { byCategory, expenseEntriesFromExpenses, incomeEntriesFromRequests, monthlySeries, summarize } from "../../core/shared/reporting/ledger";

const NOW = new Date("2026-11-12T15:00:00Z");

/** Day-of-month, weekday (0 = Sunday) and hour of an instant on the demo's wall clock. */
function onTheWall(d: Date) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: DEMO_TIME_ZONE, weekday: "short", hour: "numeric", hour12: false, day: "numeric" }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return { day: Number(get("day")), hour: Number(get("hour")) % 24, dow: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday")) };
}

const ids = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `m${i}`, member_type: "owner" }));

describe("demoReminderSettings", () => {
  it("turns every rule on, so a new rule is on in the demo without being listed here", () => {
    const settings = resolveReminderSettings(demoReminderSettings("admin-1", NOW));
    for (const rule of REMINDER_RULES) expect(settings.rules[rule].enabled).toBe(true);
    expect(anyReminderEnabled(settings)).toBe(true);
  });

  it("carries who approved each rule and when, as the board's own click would", () => {
    const raw = demoReminderSettings("admin-1", NOW);
    for (const rule of REMINDER_RULES) {
      expect(raw.rules?.[rule]).toMatchObject({ enabled: true, approved_by: "admin-1", approved_at: NOW.toISOString() });
    }
  });

  it("leaves every stage on and every lead time at the rule's own default", () => {
    const settings = resolveReminderSettings(demoReminderSettings("admin-1", NOW));
    expect(settings.rules.dues.stages).toEqual({ before: true, due: true, overdue: true });
    expect(settings.rules.dues.days).toBe(7);
    expect(settings.sendHour).toBe(9);
  });
});

describe("nextRecurringRun", () => {
  it.each([
    ["2026-11-12T15:00:00Z", "2026-12-07"], // the first Monday of the NEXT month, the 2nd being past
    ["2026-12-20T12:00:00Z", "2027-01-04"], // across the year
    ["2026-07-01T00:00:00Z", "2026-07-06"], // this month, before its first Monday; EDT
    ["2026-11-01T00:00:00Z", "2026-11-02"], // this month, EST, a day after the clocks went back
  ])("from %s goes out on %s", (now, ymd) => {
    const run = nextRecurringRun(new Date(now));
    const wall = onTheWall(run);
    expect(wall.dow).toBe(1);
    expect(wall.hour).toBe(9);
    expect(wall.day).toBeLessThanOrEqual(7);
    // 9:00 Eastern is 13:00 or 14:00 UTC; the date is the expected Monday's.
    expect(run.toISOString().slice(0, 10)).toBe(ymd);
  });

  it("is never less than an hour away, so a tick can't catch it mid-seed", () => {
    // 08:30 Eastern on the first Monday itself.
    const now = new Date("2026-12-07T13:30:00Z");
    expect(nextRecurringRun(now).getTime()).toBeGreaterThanOrEqual(now.getTime() + 3_600_000);
    expect(onTheWall(nextRecurringRun(now)).day).toBeLessThanOrEqual(7);
    expect(nextRecurringRun(now).toISOString().slice(0, 10)).toBe("2027-01-04");
  });

  it("repeats as the first Monday of every month under monthly_nth_weekday", () => {
    let run = nextRecurringRun(NOW);
    for (let i = 0; i < 14; i++) {
      run = computeNextRun(run, "monthly_nth_weekday", DEMO_TIME_ZONE)!;
      const wall = onTheWall(run);
      expect(wall).toMatchObject({ dow: 1, hour: 9 });
      expect(wall.day).toBeLessThanOrEqual(7);
    }
  });
});

describe("the ledger window", () => {
  it("is twelve months, oldest first, ending on the current one", () => {
    const months = ledgerMonths(NOW);
    expect(months).toHaveLength(LEDGER_MONTHS);
    expect(months[0]).toEqual({ year: 2025, month: 12 });
    expect(months.at(-1)).toEqual({ year: 2026, month: 11 });
    expect(ledgerWindowStart(NOW)).toBe("2025-12-01");
  });
});

describe("buildDemoLedger", () => {
  const orgs = (["demo", "demo-classic"] as const).map((slug) => ({ slug, cfg: DEMO_ROUND3[slug], def: DEMO_DEFS.find((d) => d.slug === slug)! }));

  it("has content for every demo community, and a directory member to message", () => {
    expect(Object.keys(DEMO_ROUND3).sort()).toEqual(DEMO_DEFS.map((d) => d.slug).sort());
    for (const { cfg, def } of orgs) expect(def.members.map((m) => m.email)).toContain(cfg.dmPeerEmail);
  });

  it("the DM peer's Directus login uses a real top-level domain (Directus refuses `.demo`; the real run failed on it)", () => {
    for (const { cfg } of orgs) {
      expect(cfg.dmPeerUserEmail).toMatch(/^[a-z0-9.]+@hoaconnect\.info$/);
      expect(cfg.dmPeerUserEmail).not.toBe(cfg.dmPeerEmail);
    }
  });

  it.each(orgs)("$slug: bills only owners, once a month each, at the community's dues", ({ cfg }) => {
    const members = [...ids(3), { id: "tenant", member_type: "tenant" }];
    const { requests } = buildDemoLedger(cfg, "org-1", members, new Date("2026-11-30T12:00:00Z"));
    expect(requests.some((r) => r.member === "tenant")).toBe(false);
    const dues = requests.filter((r) => r.request_type === "monthly_dues");
    expect(dues).toHaveLength(3 * 12);
    expect(new Set(dues.map((r) => `${r.member}|${r.period_start}`)).size).toBe(dues.length);
    for (const r of dues) expect(r).toMatchObject({ amount: cfg.dues, amount_paid: cfg.dues, amount_remaining: 0, status: "paid", organization: "org-1" });
  });

  it.each(orgs)("$slug: includes one assessment per owner and exactly one late fee", ({ cfg }) => {
    const { requests } = buildDemoLedger(cfg, "org-1", ids(4), new Date("2026-11-30T12:00:00Z"));
    expect(requests.filter((r) => r.request_type === "assessment")).toHaveLength(4);
    expect(requests.filter((r) => r.request_type === "late_fee")).toHaveLength(1);
  });

  it.each(orgs)("$slug: never dates anything after now, on any day of the month", ({ cfg }) => {
    for (const now of ["2026-11-01T00:00:00Z", "2026-11-02T14:59:00Z", "2026-11-12T15:00:00Z", "2026-12-31T23:59:00Z", "2027-02-28T10:00:00Z"]) {
      const { requests, expenses } = buildDemoLedger(cfg, "org-1", ids(4), new Date(now));
      for (const r of requests) expect(new Date(r.paid_at).getTime()).toBeLessThanOrEqual(new Date(now).getTime());
      for (const e of expenses) expect(new Date(`${e.expense_date}T15:00:00Z`).getTime()).toBeLessThanOrEqual(new Date(now).getTime());
    }
  });

  it.each(orgs)("$slug: insurance is paid in the quarter's first month, the rest every month", ({ cfg }) => {
    const { expenses } = buildDemoLedger(cfg, "org-1", ids(4), new Date("2026-11-30T12:00:00Z"));
    const insurance = expenses.filter((e) => e.category === "insurance");
    expect(insurance.map((e) => e.expense_date.slice(5, 7)).sort()).toEqual(["01", "04", "07", "10"]);
    expect(expenses.filter((e) => e.category === "utilities")).toHaveLength(12);
    for (const e of expenses) expect(e.status).toBe("paid");
  });

  it.each(orgs)("$slug: reads as a healthy small association — a year in the black, every month drawn", ({ cfg }) => {
    const members = ids(4);
    const { requests, expenses } = buildDemoLedger(cfg, "org-1", members, new Date("2026-11-30T12:00:00Z"));
    const entries = [...incomeEntriesFromRequests(requests), ...expenseEntriesFromExpenses(expenses)];
    const summary = summarize(entries, { openingBalance: cfg.openingBalance, openingBalanceAsOf: ledgerWindowStart(new Date("2026-11-30T12:00:00Z")) });
    expect(summary.totalIncome).toBeGreaterThan(0);
    expect(summary.totalExpense).toBeGreaterThan(0);
    expect(summary.net).toBeGreaterThan(0);
    expect(summary.closingBalance).toBeGreaterThan(cfg.openingBalance);
    const series = monthlySeries(entries, { openingBalance: cfg.openingBalance, openingBalanceAsOf: "2025-12-01" });
    expect(series).toHaveLength(12);
    // Money never runs out partway through the year.
    for (const month of series) expect(month.runningBalance).toBeGreaterThan(0);
    expect(byCategory(entries, "in").map((c) => c.category).sort()).toEqual(["assessment", "late_fee", "monthly_dues"]);
    expect(byCategory(entries, "out").length).toBeGreaterThanOrEqual(5);
  });

  it("is repeatable: the same day gives the same rows", () => {
    const cfg = DEMO_ROUND3.demo;
    expect(buildDemoLedger(cfg, "org-1", ids(4), NOW)).toEqual(buildDemoLedger(cfg, "org-1", ids(4), NOW));
  });

  it("stamps every row, which is the only thing that makes it the seed's to replace", () => {
    const { requests, expenses } = buildDemoLedger(DEMO_ROUND3.demo, "org-1", ids(4), NOW);
    expect(requests.length).toBeGreaterThan(0);
    for (const row of [...requests, ...expenses]) expect(row.notes).toBe(DEMO_SEED_NOTE);
  });

  it("leaves a month to whoever already billed it, and bills every other", () => {
    const members = ids(4);
    const occupied = new Set([occupiedKey("m0", "2026-09-01"), occupiedKey({ id: "m1" }, "2026-09-01T00:00:00")]);
    const free = buildDemoLedger(DEMO_ROUND3.demo, "org-1", members, NOW).requests.filter((r) => r.request_type === "monthly_dues");
    const taken = buildDemoLedger(DEMO_ROUND3.demo, "org-1", members, NOW, occupied).requests.filter((r) => r.request_type === "monthly_dues");
    expect(free.length - taken.length).toBe(2);
    const missing = free.filter((r) => !taken.some((t) => t.member === r.member && t.due_date === r.due_date));
    expect(missing.map((r) => `${r.member}|${r.due_date}`).sort()).toEqual(["m0|2026-09-01", "m1|2026-09-01"]);
  });

  it("matches the dues the billing engine writes in Harborview, so Charges and Reports agree", () => {
    // Production holds Sept dues of $100–$250 per member there; the seed's monthly dues sit in the same range.
    expect(DEMO_ROUND3.demo.dues).toBeGreaterThanOrEqual(100);
    expect(DEMO_ROUND3.demo.dues).toBeLessThanOrEqual(250);
  });

  it("writes only to the org it is told", () => {
    const { requests, expenses } = buildDemoLedger(DEMO_ROUND3.demo, "org-X", ids(4), NOW);
    for (const row of [...requests, ...expenses]) expect(row.organization).toBe("org-X");
  });
});

describe("comparing the ledger that is there with the one that would be written", () => {
  const { requests, expenses } = buildDemoLedger(DEMO_ROUND3.demo, "org-1", ids(4), NOW);

  it("matches the rows as Directus returns them: decimals as strings, timestamps without the Z", () => {
    const back = requests.map((r) => ({ ...r, amount: String(r.amount.toFixed(2)), amount_paid: r.amount_paid.toFixed(2), paid_at: r.paid_at.replace(/\.000Z$/, "") }));
    expect(sameRows(back.map(requestKey), requests.map(requestKey))).toBe(true);
    const eback = expenses.map((e) => ({ ...e, amount: e.amount.toFixed(2), expense_date: `${e.expense_date}T00:00:00` }));
    expect(sameRows(eback.map(expenseKey), expenses.map(expenseKey))).toBe(true);
  });

  it("reads a member given as an expanded object the same as an id", () => {
    const r = requests[0]!;
    expect(requestKey({ ...r, member: { id: r.member } })).toBe(requestKey(r));
  });

  it("says no when a row is missing, extra, or changed", () => {
    const want = requests.map(requestKey);
    expect(sameRows(want.slice(1), want)).toBe(false);
    expect(sameRows([...want, "extra"], want)).toBe(false);
    expect(sameRows(requests.map((r, i) => requestKey(i === 0 ? { ...r, amount_paid: 1 } : r)), want)).toBe(false);
  });

  it("counts duplicates: the same row twice is not the same as once", () => {
    expect(sameRows(["a", "a", "b"], ["a", "b", "b"])).toBe(false);
    expect(sameRows(["b", "a", "a"], ["a", "a", "b"])).toBe(true);
  });
});
