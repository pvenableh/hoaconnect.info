/**
 * The reminder rules (Earnest parity round 3, Phase 5a) — pure: every rule ×
 * stage, the windows' edges, the key, the community's clock (DST, a late
 * evening that is already tomorrow in UTC, an org west of UTC), the settings,
 * and what a group of reminders says.
 *
 * New York is on EST (UTC−5) from Sun, Nov 1 2026, so 9:30 am there is 14:30Z.
 */
import { describe, expect, it } from "vitest";
import {
  evaluateReminders,
  groupReminders,
  localDay,
  reminderClock,
  reminderKey,
  type ChargeInput,
  type MeetingInput,
  type PollInput,
  type Reminder,
  type ReminderSnapshot,
  type RequestInput,
} from "#core/shared/reminders/rules";
import { composeReminder } from "#core/shared/reminders/messages";
import {
  anyReminderEnabled,
  REMINDER_RULES,
  resolveReminderSettings,
  type ReminderRuleSettings,
} from "#core/shared/reminders/settings";
import { DEFAULT_ORG_TIMEZONE, localHourAndWeekday, orgTimeZone } from "#core/shared/org-timezone";
import { shouldSendDigest } from "#core/shared/notifications/preferences";

const NY = "America/New_York";
const LA = "America/Los_Angeles";

const allOn = (over: Partial<Record<(typeof REMINDER_RULES)[number], ReminderRuleSettings>> = {}, sendHour = 9) =>
  resolveReminderSettings({
    send_hour: sendHour,
    rules: Object.fromEntries(REMINDER_RULES.map((r) => [r, { enabled: true, ...(over[r] ?? {}) }])),
  });

const snap = (over: Partial<ReminderSnapshot> = {}): ReminderSnapshot => ({
  org: { id: "org", slug: "oak", name: "Oak Court", timeZone: NY, graceDays: 5 },
  settings: allOn(),
  charges: [],
  meetings: [],
  requests: [],
  polls: [],
  vendors: [],
  adminUserIds: [],
  ...over,
});

const charge = (over: Partial<ChargeInput> = {}): ChargeInput => ({
  id: "c1",
  label: "November dues",
  status: "active",
  amountRemaining: 450,
  dueDate: "2026-11-10",
  billedUserId: "u-billed",
  residents: [],
  sentStages: [],
  ...over,
});

const meeting = (over: Partial<MeetingInput> = {}): MeetingInput => ({
  id: "m1",
  title: "Board meeting",
  // Tue, Nov 10, 6:30 pm in New York.
  startsAt: "2026-11-10T23:30:00Z",
  status: "scheduled",
  published: true,
  location: "Clubhouse",
  audienceUserIds: ["u1", "u2"],
  ...over,
});

const request = (over: Partial<RequestInput> = {}): RequestInput => ({
  id: "r1",
  type: "maintenance",
  title: "Leaky faucet",
  status: "open",
  ...over,
});

const poll = (over: Partial<PollInput> = {}): PollInput => ({
  id: "p1",
  question: "Repaint the fence?",
  status: "open",
  createdAt: "2026-11-03T14:00:00Z",
  closesAt: "2026-11-10T14:00:00Z",
  audienceUserIds: ["u1", "u2", "u3"],
  voterUserIds: ["u2"],
  resultSentence: "Yes — 2 of 3 votes",
  ...over,
});

const run = (s: ReminderSnapshot, iso: string) => evaluateReminders(s, new Date(iso));
const stages = (rs: Reminder[]) => rs.map((r) => `${r.rule}.${r.stage}:${r.member}`);

describe("settings", () => {
  it("everything is off by default, and a bad value never throws", () => {
    for (const raw of [undefined, null, "", "{nope", 42, [], { rules: "x" }]) {
      const s = resolveReminderSettings(raw);
      expect(anyReminderEnabled(s)).toBe(false);
      expect(s.sendHour).toBe(9);
    }
  });

  it("reads the JSON (object or string), clamps the send hour and days, and keeps stages on unless false", () => {
    const s = resolveReminderSettings(
      JSON.stringify({ send_hour: 3, rules: { dues: { enabled: true, days: 500, stages: { overdue: false }, tenants: true } } })
    );
    expect(s.sendHour).toBe(6);
    expect(s.rules.dues).toMatchObject({ enabled: true, days: 60, tenants: true, stages: { before: true, due: true, overdue: false } });
    expect(s.rules.meeting.enabled).toBe(false);
    expect(resolveReminderSettings({ send_hour: 23 }).sendHour).toBe(20);
    expect(resolveReminderSettings({ rules: { violation: { days: 0 } } }).rules.violation.days).toBe(1);
  });

  it("the defaults: dues 7 days ahead, violations 3, coverage 30, requests quiet for 7", () => {
    const s = resolveReminderSettings({});
    expect([s.rules.dues.days, s.rules.violation.days, s.rules.coverage.days, s.rules.request.days]).toEqual([7, 3, 30, 7]);
  });
});

describe("the key", () => {
  it("is <rule>:<entity>:<stage>@<anchor>:<user>", () => {
    expect(reminderKey("dues", "c1", "before", "20261110", "u1")).toBe("dues:c1:before@20261110:u1");
    const [r] = run(snap({ charges: [charge()] }), "2026-11-03T14:30:00Z");
    expect(r!.key).toBe("dues:c1:before@20261110:u-billed");
  });

  it("a moved due date or a rescheduled meeting is a new key; a second evaluation is the same one", () => {
    const a = run(snap({ charges: [charge()] }), "2026-11-03T14:30:00Z")[0]!.key;
    const b = run(snap({ charges: [charge()] }), "2026-11-04T15:00:00Z")[0]!.key;
    const moved = run(snap({ charges: [charge({ dueDate: "2026-11-11" })] }), "2026-11-04T15:00:00Z")[0]!.key;
    expect(b).toBe(a);
    expect(moved).not.toBe(a);
    const m1 = run(snap({ meetings: [meeting()] }), "2026-11-10T14:30:00Z")[0]!.key;
    const m2 = run(snap({ meetings: [meeting({ startsAt: "2026-11-10T23:45:00Z" })] }), "2026-11-10T14:30:00Z")[0]!.key;
    expect(m1).toBe("meeting:m1:day@20261110T2330Z:u1");
    expect(m2).not.toBe(m1);
  });
});

describe("the clock", () => {
  it("is the community's: 9 pm in New York is already tomorrow in UTC, and quiet", () => {
    const c = reminderClock(new Date("2026-11-11T02:30:00Z"), NY, 9);
    expect(c.today.toString()).toBe("2026-11-10");
    expect(c.hour).toBe(21);
    expect(c.awake).toBe(false);
    expect(reminderClock(new Date("2026-11-10T14:00:00Z"), NY, 9).awake).toBe(true);
    expect(reminderClock(new Date("2026-11-10T13:59:00Z"), NY, 9).awake).toBe(false);
  });

  it("a date is a wall date; an instant is the local day it falls on", () => {
    expect(localDay("2026-11-10", LA)!.toString()).toBe("2026-11-10");
    expect(localDay("2026-11-10T00:00:00", LA)!.toString()).toBe("2026-11-10");
    expect(localDay("2026-11-10T03:00:00Z", LA)!.toString()).toBe("2026-11-09");
    expect(localDay("nope", LA)).toBeNull();
    expect(localDay(null, LA)).toBeNull();
  });
});

describe("dues — 7 days before, on the day, the day after grace (5)", () => {
  const s = () => snap({ charges: [charge()] });
  it.each([
    ["2026-11-02T14:30:00Z", []],
    ["2026-11-03T14:30:00Z", ["dues.before:u-billed"]],
    ["2026-11-09T14:30:00Z", ["dues.before:u-billed"]],
    ["2026-11-10T14:30:00Z", ["dues.due:u-billed"]],
    ["2026-11-11T14:30:00Z", []],
    ["2026-11-15T14:30:00Z", []],
    ["2026-11-16T14:30:00Z", ["dues.overdue:u-billed"]],
    ["2026-12-15T14:30:00Z", ["dues.overdue:u-billed"]],
    ["2026-12-16T14:30:00Z", []],
  ] as const)("at %s → %j", (iso, want) => {
    expect(stages(run(s(), iso))).toEqual(want);
  });

  it("not before the send hour, not from 9 pm; a late evening still counts as the community's day", () => {
    expect(run(s(), "2026-11-10T13:30:00Z")).toEqual([]); // 8:30 am
    // 8:30 pm on the 10th in New York is the 11th in UTC — still "due today".
    expect(stages(run(s(), "2026-11-11T01:30:00Z"))).toEqual(["dues.due:u-billed"]);
    expect(run(s(), "2026-11-11T02:30:00Z")).toEqual([]); // 9:30 pm: quiet
  });

  it("is essential, in the payment category, by email + bell + push; overdue is urgent", () => {
    const [before] = run(s(), "2026-11-03T14:30:00Z");
    expect(before).toMatchObject({ essential: true, category: "payment", channels: ["bell", "push", "email"], urgency: "low", template: "reminder-dues" });
    expect(run(s(), "2026-11-16T14:30:00Z")[0]!.urgency).toBe("high");
  });

  it("only open charges with a balance", () => {
    for (const over of [{ status: "paid" }, { status: "canceled" }, { status: "draft" }, { amountRemaining: 0 }, { dueDate: null }]) {
      expect(run(snap({ charges: [charge(over)] }), "2026-11-10T14:30:00Z")).toEqual([]);
    }
    expect(stages(run(snap({ charges: [charge({ status: "partially_paid" })] }), "2026-11-10T14:30:00Z"))).toEqual(["dues.due:u-billed"]);
  });

  it("skips a stage the billing worker already sent", () => {
    const c = charge({ sentStages: ["due_soon"] });
    expect(run(snap({ charges: [c] }), "2026-11-03T14:30:00Z")).toEqual([]);
    expect(stages(run(snap({ charges: [c] }), "2026-11-10T14:30:00Z"))).toEqual(["dues.due:u-billed"]);
  });

  it("goes to the billed member and the unit's owners; tenants only when the org says so", () => {
    const residents: ChargeInput["residents"] = [
      { userId: "u-billed", residency: "owner" },
      { userId: "u-owner", residency: "owner" },
      { userId: "u-tenant", residency: "tenant" },
      { userId: "u-unknown", residency: null },
    ];
    const off = run(snap({ charges: [charge({ residents })] }), "2026-11-10T14:30:00Z");
    expect(off.map((r) => [r.member, r.audience])).toEqual([
      ["u-billed", "billed"],
      ["u-owner", "owner"],
      ["u-unknown", "owner"],
    ]);
    const on = run(snap({ settings: allOn({ dues: { tenants: true } }), charges: [charge({ residents })] }), "2026-11-10T14:30:00Z");
    expect(on.map((r) => r.member)).toContain("u-tenant");
  });

  it("a charge with nobody reachable is reported, not dropped silently", () => {
    const seen: string[] = [];
    const rs = evaluateReminders(snap({ charges: [charge({ billedUserId: null })] }), new Date("2026-11-16T14:30:00Z"), (u) =>
      seen.push(`${u.rule}.${u.stage}:${u.entity.id}`)
    );
    expect(rs).toEqual([]);
    expect(seen).toEqual(["dues.overdue:c1"]);
  });

  it("grace comes from the org; `days` moves the first reminder", () => {
    const g0 = snap({ org: { ...snap().org, graceDays: 0 }, charges: [charge()] });
    expect(stages(run(g0, "2026-11-11T14:30:00Z"))).toEqual(["dues.overdue:u-billed"]);
    const three = snap({ settings: allOn({ dues: { days: 3 } }), charges: [charge()] });
    expect(run(three, "2026-11-06T14:30:00Z")).toEqual([]);
    expect(stages(run(three, "2026-11-07T14:30:00Z"))).toEqual(["dues.before:u-billed"]);
  });

  it("a rule or stage that is off still evaluates, marked not enabled (the dry run lists it)", () => {
    const off = snap({ settings: resolveReminderSettings({}), charges: [charge()] });
    expect(run(off, "2026-11-10T14:30:00Z").map((r) => r.enabled)).toEqual([false]);
    const stageOff = snap({ settings: allOn({ dues: { stages: { overdue: false } } }), charges: [charge()] });
    expect(run(stageOff, "2026-11-16T14:30:00Z")[0]!.enabled).toBe(false);
    expect(run(stageOff, "2026-11-10T14:30:00Z")[0]!.enabled).toBe(true);
  });
});

describe("meetings — a week before, the day before, an hour before (push only)", () => {
  const s = (over: Partial<MeetingInput> = {}) => snap({ meetings: [meeting(over)] });
  it.each([
    ["2026-11-03T14:30:00Z", "week"],
    ["2026-11-04T14:30:00Z", null],
    ["2026-11-09T23:30:00Z", "day"],
    ["2026-11-10T14:30:00Z", "day"],
    ["2026-11-10T22:29:00Z", "day"],
    ["2026-11-10T22:35:00Z", "hour"],
    ["2026-11-10T23:30:00Z", null],
  ] as const)("at %s → %s", (iso, want) => {
    const rs = run(s(), iso);
    expect(rs.map((r) => r.stage)).toEqual(want ? [want, want] : []);
  });

  it("the hour-before is a push with a high urgency that expires at the start", () => {
    const [r] = run(s(), "2026-11-10T22:35:00Z");
    expect(r).toMatchObject({ channels: ["push"], urgency: "high", ttlSeconds: 55 * 60 });
  });

  it("says today / tomorrow on the community's clock", () => {
    expect(run(s(), "2026-11-09T23:30:00Z")[0]!.vars.when).toBe("tomorrow at 6:30 PM");
    expect(run(s(), "2026-11-10T14:30:00Z")[0]!.vars.when).toBe("today at 6:30 PM");
    expect(run(s(), "2026-11-03T14:30:00Z")[0]!.vars.when).toBe("Tue, Nov 10 at 6:30 PM");
  });

  it("only published, scheduled, future meetings", () => {
    for (const over of [{ published: false }, { status: "canceled" }, { status: "completed" }, { startsAt: null }]) {
      expect(run(s(over), "2026-11-10T14:30:00Z")).toEqual([]);
    }
  });

  it("the day-before waits for the send hour: an 8 am meeting is reminded at 9 the day before", () => {
    const early = s({ startsAt: "2026-11-11T13:00:00Z" }); // Wed 8:00 am
    expect(run(early, "2026-11-10T13:00:00Z")).toEqual([]); // Tue 8:00 am — before the send hour
    expect(run(early, "2026-11-10T14:05:00Z").map((r) => r.stage)).toEqual(["day", "day"]);
  });
});

describe("requests — a resident's status change; the assignee's 7-day nudge", () => {
  it("a status change reaches the submitter for 48 h, once per status and moment", () => {
    const r = request({ status: "in_progress", statusChangedAt: "2026-11-03T14:00:00Z", submittedBy: "u-sub", workflowState: "scheduled" });
    const [hit] = run(snap({ requests: [r] }), "2026-11-03T14:30:00Z");
    expect(hit).toMatchObject({ rule: "request", stage: "status", member: "u-sub", audience: "submitter", channels: ["bell", "push", "email"] });
    expect(hit!.key).toBe("request:r1:status@in_progress.20261103T1400Z:u-sub");
    expect(hit!.vars.status).toBe("Scheduled");
    expect(run(snap({ requests: [r] }), "2026-11-05T14:01:00Z")).toEqual([]);
  });

  it("waits out the night: a 10 pm change is told at 9 am", () => {
    const r = request({ status: "resolved", statusChangedAt: "2026-11-04T03:00:00Z", submittedBy: "u-sub" });
    expect(run(snap({ requests: [r] }), "2026-11-04T03:30:00Z")).toEqual([]);
    expect(stages(run(snap({ requests: [r] }), "2026-11-04T14:05:00Z"))).toEqual(["request.status:u-sub"]);
  });

  it("not for violations or tasks, not for `open`, not without a change time", () => {
    for (const over of [
      { type: "violation" },
      { type: "task" },
      { status: "open" },
      { statusChangedAt: null },
      { submittedBy: null },
    ]) {
      const r = request({ status: "in_progress", statusChangedAt: "2026-11-03T14:00:00Z", submittedBy: "u-sub", ...over });
      expect(run(snap({ requests: [r] }), "2026-11-03T14:30:00Z").filter((x) => x.stage === "status")).toEqual([]);
    }
  });

  it("nudges the assignee (bell only) after 7 quiet days, keyed to the last activity", () => {
    const r = request({ assignedTo: "u-board", lastActivityAt: "2026-10-27T15:00:00Z" });
    const [hit] = run(snap({ requests: [r] }), "2026-11-03T14:30:00Z");
    expect(hit).toMatchObject({ stage: "stale", member: "u-board", audience: "assignee", channels: ["bell"], urgency: "low" });
    expect(hit!.key).toBe("request:r1:stale@20261027:u-board");
    expect(run(snap({ requests: [request({ assignedTo: "u-board", lastActivityAt: "2026-10-28T15:00:00Z" })] }), "2026-11-03T14:30:00Z")).toEqual([]);
    expect(run(snap({ requests: [request({ lastActivityAt: "2026-10-01T15:00:00Z" })] }), "2026-11-03T14:30:00Z")).toEqual([]);
    expect(
      run(snap({ requests: [request({ status: "resolved", assignedTo: "u-board", lastActivityAt: "2026-10-01T15:00:00Z" })] }), "2026-11-03T14:30:00Z")
    ).toEqual([]);
  });
});

describe("violations — 3 days before the correction date, and on it", () => {
  const v = (over: Partial<RequestInput> = {}) =>
    snap({ requests: [request({ type: "violation", status: "waiting", memberUserId: "u-res", cureBy: "2026-11-06", ...over })] });
  it.each([
    ["2026-11-02T14:30:00Z", null],
    ["2026-11-03T14:30:00Z", "before"],
    ["2026-11-05T14:30:00Z", "before"],
    ["2026-11-06T14:30:00Z", "due"],
    ["2026-11-07T14:30:00Z", null],
  ] as const)("at %s → %s", (iso, want) => {
    expect(run(v(), iso).map((r) => r.stage)).toEqual(want ? [want] : []);
  });

  it("is essential, to the member it is about; resolved or memberless is nothing", () => {
    expect(run(v(), "2026-11-06T14:30:00Z")[0]).toMatchObject({ essential: true, member: "u-res", audience: "violator", urgency: "high", template: "reminder-violation" });
    expect(run(v({ status: "resolved" }), "2026-11-06T14:30:00Z")).toEqual([]);
    expect(run(v({ memberUserId: null }), "2026-11-06T14:30:00Z")).toEqual([]);
  });
});

describe("polls — opened, closing in 24 h, closed with the result", () => {
  it("opened: to everyone who hasn't voted", () => {
    expect(stages(run(snap({ polls: [poll()] }), "2026-11-03T14:30:00Z"))).toEqual(["poll.opened:u1", "poll.opened:u3"]);
  });

  it("closing: in the last day, to members who haven't voted", () => {
    const rs = run(snap({ polls: [poll()] }), "2026-11-09T15:00:00Z");
    expect(stages(rs)).toEqual(["poll.closing:u1", "poll.closing:u3"]);
    expect(rs[0]!.vars.closes).toBe("tomorrow at 9:00 AM");
  });

  it("a poll opened inside its last day is told once (opened, with the close), not twice", () => {
    const p = poll({ createdAt: "2026-11-09T20:00:00Z" });
    expect(run(snap({ polls: [p] }), "2026-11-09T20:30:00Z").map((r) => r.stage)).toEqual(["opened", "opened"]);
  });

  it("closed: everyone, voters too, with the result, for 48 h", () => {
    const rs = run(snap({ polls: [poll()] }), "2026-11-10T15:00:00Z");
    expect(stages(rs)).toEqual(["poll.closed:u1", "poll.closed:u2", "poll.closed:u3"]);
    expect(rs[0]!.vars.result).toBe("Yes — 2 of 3 votes");
    expect(run(snap({ polls: [poll({ status: "closed" })] }), "2026-11-12T15:00:00Z")).toEqual([]);
  });

  it("a draft is nothing", () => {
    expect(run(snap({ polls: [poll({ status: "draft" })] }), "2026-11-03T14:30:00Z")).toEqual([]);
  });
});

describe("coverage — vendor coverage ending, to the admins (bell)", () => {
  const s = () => snap({ vendors: [{ id: "v1", name: "Acme Pools", activeUntil: "2026-12-03" }], adminUserIds: ["a1", "a2"] });
  it.each([
    ["2026-11-02T14:30:00Z", null],
    ["2026-11-03T14:30:00Z", "before"],
    ["2026-12-03T14:30:00Z", "expired"],
    ["2026-12-09T14:30:00Z", "expired"],
    ["2026-12-10T14:30:00Z", null],
  ] as const)("at %s → %s", (iso, want) => {
    const rs = run(s(), iso);
    expect(rs.map((r) => r.stage)).toEqual(want ? [want, want] : []);
    if (want) expect(rs[0]).toMatchObject({ channels: ["bell"], audience: "admin", category: "document" });
  });
});

describe("zones", () => {
  it("west of UTC: 10:30 pm in Los Angeles is the next day in UTC — not yet due", () => {
    const la = snap({ org: { ...snap().org, timeZone: LA }, charges: [charge()] });
    expect(run(la, "2026-11-10T06:30:00Z")).toEqual([]); // Mon 9th, 10:30 pm Pacific
    expect(stages(run(la, "2026-11-10T17:05:00Z"))).toEqual(["dues.due:u-billed"]); // Tue 10th, 9:05 am Pacific
    // The same instant is the 10th in New York, and quiet hours there are past.
    expect(stages(run(snap({ charges: [charge()] }), "2026-11-10T17:05:00Z"))).toEqual(["dues.due:u-billed"]);
  });

  it("DST: the send hour is 9 on the wall clock on the day the clocks spring forward", () => {
    const s = snap({ charges: [charge({ dueDate: "2027-03-14" })] });
    expect(run(s, "2027-03-14T12:30:00Z")).toEqual([]); // 8:30 EDT
    expect(stages(run(s, "2027-03-14T13:05:00Z"))).toEqual(["dues.due:u-billed"]); // 9:05 EDT (was 14:05Z in winter)
  });

  it("DST: a week before is seven calendar days, not 168 hours", () => {
    // Mon Mar 15 2027, 7 pm EDT; a week before is Mon Mar 8 (EST).
    const s = snap({ meetings: [meeting({ startsAt: "2027-03-15T23:00:00Z" })] });
    expect(run(s, "2027-03-08T14:05:00Z").map((r) => r.stage)).toEqual(["week", "week"]);
    expect(run(s, "2027-03-07T14:05:00Z")).toEqual([]);
  });

  it("the org's zone: unset or invalid is New York (the digest's old global)", () => {
    expect(DEFAULT_ORG_TIMEZONE).toBe(NY);
    expect(orgTimeZone({ timezone: LA })).toBe(LA);
    expect(orgTimeZone({ timezone: null })).toBe(NY);
    expect(orgTimeZone({ timezone: "Mars/Olympus" })).toBe(NY);
    expect(orgTimeZone(null)).toBe(NY);
  });

  it("the digest goes out at the member's hour in each community's zone", () => {
    const prefs = { digest_enabled: true, digest_cadence: "daily", digest_hour: 8 };
    const at = new Date("2026-11-03T16:00:00Z"); // 8 am in Los Angeles, 11 am in New York
    const la = localHourAndWeekday(LA, at);
    const ny = localHourAndWeekday(NY, at);
    expect(la).toEqual({ hour: 8, dow: 2 });
    expect(shouldSendDigest(prefs as any, la.hour, la.dow)).toBe(true);
    expect(shouldSendDigest(prefs as any, ny.hour, ny.dow)).toBe(false);
  });
});

describe("what a group says", () => {
  it("one member's charges at one stage are one reminder: lines by due date, the total", () => {
    const s = snap({
      charges: [
        charge({ id: "c2", label: "Pool assessment", amountRemaining: 75, dueDate: "2026-11-09" }),
        charge({ id: "c1", label: "November dues", amountRemaining: 450, dueDate: "2026-11-10" }),
      ],
    });
    const groups = groupReminders(run(s, "2026-11-03T14:30:00Z"));
    expect(groups).toHaveLength(1);
    const c = composeReminder(groups[0]!);
    expect(c.keys).toHaveLength(2);
    expect(c.recipients).toEqual(["u-billed"]);
    expect(c.lines!.map((l) => l.label)).toEqual(["Pool assessment", "November dues"]);
    expect(c.vars.amount).toBe("$525.00");
    expect(c.subject).toBe("Reminder: $525.00 due Mon, Nov 9");
    expect(c.intro).toContain("2 charges totalling $525.00");
    expect(c.entities.map((e) => e.id).sort()).toEqual(["c1", "c2"]);
  });

  it("a meeting's invitees are one notification", () => {
    const groups = groupReminders(run(snap({ meetings: [meeting()] }), "2026-11-10T14:30:00Z"));
    expect(groups).toHaveLength(1);
    const c = composeReminder(groups[0]!);
    expect(c.recipients).toEqual(["u1", "u2"]);
    expect(c.subject).toBe("Reminder: Board meeting today at 6:30 PM");
    expect(c.path).toBe("/meetings");
  });

  it("the board's approved copy replaces the subject and intro, with the vars filled", () => {
    const [g] = groupReminders(run(snap({ charges: [charge()] }), "2026-11-10T14:30:00Z"));
    const c = composeReminder(g!, { subject: "{{amount}} due today — thank you!", intro: "Hi neighbor, {{ amount }} is due {{due}}." });
    expect(c.subject).toBe("$450.00 due today — thank you!");
    expect(c.intro).toBe("Hi neighbor, $450.00 is due Tue, Nov 10.");
  });

  it("each rule and stage has its copy and link", () => {
    const s = snap({
      meetings: [meeting()],
      requests: [
        request({ id: "v1", type: "violation", status: "waiting", memberUserId: "u-res", cureBy: "2026-11-10" }),
        request({ id: "r2", status: "closed", statusChangedAt: "2026-11-10T13:00:00Z", submittedBy: "u-sub" }),
      ],
      polls: [poll({ closesAt: "2026-11-11T14:00:00Z" })],
    });
    const composed = groupReminders(run(s, "2026-11-10T14:30:00Z")).map((g) => composeReminder(g));
    const by = Object.fromEntries(composed.map((c) => [`${c.rule}.${c.stage}`, c]));
    expect(by["violation.due"]!.path).toBe("/requests/v1");
    expect(by["request.status"]!.subject).toBe("Your request is now closed");
    expect(by["poll.closing"]!.subject).toBe("Closing soon: Repaint the fence?");
    expect(by["meeting.day"]!.ctaLabel).toBe("View meeting");
  });
});
