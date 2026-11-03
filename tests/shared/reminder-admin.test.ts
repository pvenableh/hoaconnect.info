/**
 * Settings → Reminders, the pure half (Earnest parity round 3, Phase 5b): how a
 * saved form becomes `settings.reminders` — and who approved it — and how 24
 * hourly dry runs become one answer.
 */
import { describe, expect, it } from "vitest";
import { prepareReminderSettings, summarizeDryRuns, RULE_GUIDE, RULES_WITH_DAYS } from "#core/shared/reminders/admin";
import { REMINDER_RULES, RULE_STAGES, resolveReminderSettings } from "#core/shared/reminders/settings";
import { US_TIME_ZONES } from "#core/shared/org-timezone";
import { validTimeZone } from "#core/shared/email/recurrence";

const WHO = { userId: "user-1", now: "2026-11-03T15:00:00.000Z" };
const LATER = { userId: "user-2", now: "2026-11-10T15:00:00.000Z" };

describe("prepareReminderSettings", () => {
  it("stores every rule, off, when the form says nothing", () => {
    const s = prepareReminderSettings(null, {}, WHO);
    expect(Object.keys(s.rules!)).toEqual([...REMINDER_RULES]);
    for (const rule of REMINDER_RULES) {
      expect(s.rules![rule]!.enabled).toBe(false);
      expect(s.rules![rule]!.approved_at).toBeUndefined();
      expect(s.rules![rule]!.approved_by).toBeUndefined();
    }
    expect(s.send_hour).toBe(9);
  });

  it("turning a rule on writes enabled, approved_at and approved_by together", () => {
    const s = prepareReminderSettings(null, { rules: { dues: { enabled: true } } }, WHO);
    expect(s.rules!.dues).toMatchObject({ enabled: true, approved_at: WHO.now, approved_by: WHO.userId });
    expect(s.rules!.meeting!.enabled).toBe(false);
    expect(resolveReminderSettings(s).rules.dues.enabled).toBe(true);
  });

  it("keeps the earlier approval when an on rule is saved again unchanged", () => {
    const first = prepareReminderSettings(null, { rules: { dues: { enabled: true } } }, WHO);
    const again = prepareReminderSettings(first, { send_hour: 10, rules: { dues: { enabled: true, days: 5 } } }, LATER);
    expect(again.rules!.dues).toMatchObject({ enabled: true, days: 5, approved_at: WHO.now, approved_by: WHO.userId });
    expect(again.send_hour).toBe(10);
  });

  it("re-approves when the copy changes while the rule is on", () => {
    const first = prepareReminderSettings(null, { rules: { dues: { enabled: true, copy: { subject: "Dues soon" } } } }, WHO);
    const edited = prepareReminderSettings(first, { rules: { dues: { copy: { subject: "Dues are close" } } } }, LATER);
    expect(edited.rules!.dues).toMatchObject({ approved_at: LATER.now, approved_by: LATER.userId });
    const same = prepareReminderSettings(edited, { rules: { dues: { copy: { subject: "  Dues are close " } } } }, WHO);
    expect(same.rules!.dues!.approved_at).toBe(LATER.now);
  });

  it("re-approves a rule that is turned off and on again, and clears it while off", () => {
    const on = prepareReminderSettings(null, { rules: { poll: { enabled: true } } }, WHO);
    const off = prepareReminderSettings(on, { rules: { poll: { enabled: false } } }, LATER);
    expect(off.rules!.poll).toEqual({ enabled: false });
    const back = prepareReminderSettings(off, { rules: { poll: { enabled: true } } }, LATER);
    expect(back.rules!.poll).toMatchObject({ approved_at: LATER.now, approved_by: LATER.userId });
  });

  it("approves an enabled rule that was switched on by hand and has no approval", () => {
    const s = prepareReminderSettings({ rules: { meeting: { enabled: true } } }, { rules: { meeting: { enabled: true } } }, LATER);
    expect(s.rules!.meeting).toMatchObject({ approved_at: LATER.now, approved_by: LATER.userId });
  });

  it("a rule the form doesn't mention keeps what it had", () => {
    const on = prepareReminderSettings(null, { rules: { dues: { enabled: true, tenants: true }, meeting: { enabled: true } } }, WHO);
    const s = prepareReminderSettings(on, { rules: { meeting: { enabled: false } } }, LATER);
    expect(s.rules!.dues).toMatchObject({ enabled: true, tenants: true, approved_at: WHO.now });
    expect(s.rules!.meeting!.enabled).toBe(false);
  });

  it("stores only the stages that are off, and only this rule's stages", () => {
    const s = prepareReminderSettings(null, { rules: { dues: { stages: { overdue: false, before: true, bogus: false } } } }, WHO);
    expect(s.rules!.dues!.stages).toEqual({ overdue: false });
    expect(resolveReminderSettings(s).rules.dues.stages).toEqual({ before: true, due: true, overdue: false });
    const on = prepareReminderSettings(s, { rules: { dues: { stages: { overdue: true } } } }, WHO);
    expect(on.rules!.dues!.stages).toBeUndefined();
  });

  it("clamps days and the send hour, and only the rules with a lead time keep days", () => {
    const s = prepareReminderSettings(null, { send_hour: 3, rules: { dues: { days: 500 }, meeting: { days: 4 }, violation: { days: 0 } } }, WHO);
    expect(s.send_hour).toBe(6);
    expect(s.rules!.dues!.days).toBe(60);
    expect(s.rules!.violation!.days).toBe(1);
    expect(s.rules!.meeting!.days).toBeUndefined();
    expect(prepareReminderSettings(null, { send_hour: 99 }, WHO).send_hour).toBe(20);
    expect(prepareReminderSettings(null, { send_hour: "abc" }, WHO).send_hour).toBe(9);
  });

  it("tenants is a dues setting", () => {
    const s = prepareReminderSettings(null, { rules: { dues: { tenants: true }, poll: { tenants: true } } }, WHO);
    expect(s.rules!.dues!.tenants).toBe(true);
    expect(s.rules!.poll!.tenants).toBeUndefined();
  });

  it("trims copy, drops an empty one, and caps it", () => {
    const s = prepareReminderSettings(null, { rules: { dues: { copy: { subject: "  Hi {{amount}} ", intro: "" } }, poll: { copy: { subject: " ", intro: "" } } } }, WHO);
    expect(s.rules!.dues!.copy).toEqual({ subject: "Hi {{amount}}", intro: null });
    expect(s.rules!.poll!.copy).toBeUndefined();
    const long = prepareReminderSettings(null, { rules: { dues: { copy: { intro: "x".repeat(900) } } } }, WHO);
    expect(long.rules!.dues!.copy!.intro).toHaveLength(300);
    const cleared = prepareReminderSettings(s, { rules: { dues: { copy: null } } }, WHO);
    expect(cleared.rules!.dues!.copy).toBeUndefined();
  });

  it("survives junk: a string, an array, a json string, unknown rules", () => {
    for (const bad of ["x", 7, [], null, undefined, { rules: [] }, { rules: { nonsense: { enabled: true } } }]) {
      const s = prepareReminderSettings(bad, bad, WHO);
      expect(Object.keys(s.rules!)).toEqual([...REMINDER_RULES]);
    }
    const fromString = prepareReminderSettings(JSON.stringify({ rules: { dues: { enabled: true, approved_at: "a", approved_by: "b" } } }), {}, LATER);
    expect(fromString.rules!.dues).toMatchObject({ enabled: true, approved_at: "a", approved_by: "b" });
  });

  it("only an explicit true turns a rule on", () => {
    const s = prepareReminderSettings(null, { rules: { dues: { enabled: "yes" }, meeting: { enabled: 1 } } }, WHO);
    expect(s.rules!.dues!.enabled).toBe(false);
    expect(s.rules!.meeting!.enabled).toBe(false);
  });
});

describe("the guide the card reads", () => {
  it("covers every rule and exactly its stages", () => {
    for (const rule of REMINDER_RULES) {
      expect(Object.keys(RULE_GUIDE[rule].stages).sort()).toEqual([...RULE_STAGES[rule]].sort());
      expect(RULE_GUIDE[rule].tokens.length).toBeGreaterThan(0);
    }
  });

  it("names a days label for exactly the rules that keep days", () => {
    for (const rule of REMINDER_RULES) {
      expect(!!RULE_GUIDE[rule].daysLabel).toBe(RULES_WITH_DAYS.includes(rule));
    }
  });
});

describe("US_TIME_ZONES", () => {
  it("are real zones, New York first", () => {
    expect(US_TIME_ZONES[0].value).toBe("America/New_York");
    for (const z of US_TIME_ZONES) expect(validTimeZone(z.value)).toBe(z.value);
    expect(validTimeZone("Mars/Olympus")).toBeNull();
  });
});

describe("summarizeDryRuns", () => {
  const g = (group: string, subject: string, recipients: number) => ({ group, subject, recipients });

  it("says nothing goes out when nothing does", () => {
    const s = summarizeDryRuns(Array.from({ length: 24 }, () => ({})));
    expect(s).toMatchObject({ total: 0, hours: 24, headline: "Nothing is scheduled to go out in the next 24 hours." });
    expect(s.rules).toEqual([]);
  });

  it("counts a notification once however many hours list it", () => {
    const hour = { wouldSendGroups: [g("dues:before:m1", "Dues due", 1), g("dues:before:m2", "Dues due", 1), g("meeting:x:day", "Tomorrow: Board meeting", 40)] };
    const s = summarizeDryRuns([hour, hour, hour]);
    expect(s.total).toBe(3);
    expect(s.headline).toBe("2 dues reminders, 1 meeting reminder");
    expect(s.rules).toEqual([
      { rule: "dues", label: "Dues", count: 2, recipients: 2 },
      { rule: "meeting", label: "Meetings", count: 1, recipients: 40 },
    ]);
  });

  it("keeps the most recipients any hour saw, and counts different stages apart", () => {
    const s = summarizeDryRuns([
      { wouldSendGroups: [g("poll:p1:closing", "Poll closes soon", 10)] },
      { wouldSendGroups: [g("poll:p1:closing", "Poll closes soon", 14), g("poll:p1:opened", "New poll", 30)] },
    ]);
    expect(s.rules).toEqual([{ rule: "poll", label: "Polls", count: 2, recipients: 44 }]);
    expect(s.headline).toBe("2 poll reminders");
  });

  it("uses the singular, and the noun a board would say", () => {
    expect(summarizeDryRuns([{ wouldSendGroups: [g("coverage:v1:before", "Coverage ends", 3)] }]).headline).toBe("1 vendor coverage reminder");
    expect(summarizeDryRuns([{ wouldSendGroups: [g("dues:due:m1", "Due today", 1)] }]).headline).toBe("1 dues reminder");
  });

  it("orders the headline by rule, not by arrival", () => {
    const s = summarizeDryRuns([{ wouldSendGroups: [g("poll:p:closing", "P", 1), g("dues:before:m", "D", 1), g("meeting:m:hour", "M", 1)] }]);
    expect(s.headline).toBe("1 dues reminder, 1 meeting reminder, 1 poll reminder");
  });

  it("explains unreachable dues in the billing worker's terms", () => {
    const s = summarizeDryRuns([{ unreachable: { "dues.overdue": 5 } }, { unreachable: { "dues.overdue": 5 } }]);
    expect(s.unreachable).toEqual([{ rule: "dues", label: "Dues", count: 5, text: "5 have no app account — the billing worker emails them." }]);
    expect(summarizeDryRuns([{ unreachable: { "dues.due": 1 } }]).unreachable[0]!.text).toBe("1 has no app account — the billing worker emails them.");
  });

  it("takes the largest hourly count per stage, then adds the stages up", () => {
    const s = summarizeDryRuns([
      { unreachable: { "dues.before": 2, "dues.due": 1 } },
      { unreachable: { "dues.before": 3 } },
    ]);
    expect(s.unreachable[0]!.count).toBe(4);
  });

  it("says what rules that are off would send", () => {
    const s = summarizeDryRuns([{ off: { "violation.before": 2, "violation.due": 1, "poll.closing": 1 } }]);
    expect(s.off.map((o) => [o.rule, o.count])).toEqual([["violation", 3], ["poll", 1]]);
    expect(s.off[0]!.text).toBe("3 reminders would go out if violations reminders were on.");
    expect(s.off[1]!.text).toBe("1 reminder would go out if polls reminders were on.");
  });

  it("ignores a group it can't place, and zero counts", () => {
    const s = summarizeDryRuns([{ wouldSendGroups: [g("mystery:1:x", "?", 9)], off: { "dues.before": 0 }, unreachable: { "bogus.x": 3 } }]);
    expect(s.total).toBe(0);
    expect(s.off).toEqual([]);
    expect(s.unreachable).toEqual([]);
  });

  it("caps the list it hands the card, not the count", () => {
    const groups = Array.from({ length: 40 }, (_, i) => g(`dues:before:m${i}`, `Dues ${String(i).padStart(2, "0")}`, 1));
    const s = summarizeDryRuns([{ wouldSendGroups: groups }], { cap: 10 });
    expect(s.total).toBe(40);
    expect(s.notifications).toHaveLength(10);
  });
});
