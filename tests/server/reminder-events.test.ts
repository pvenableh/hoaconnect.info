/**
 * The notification events that are also a reminder stage (Earnest parity round
 * 3, Phase 5b): a request changed status, a poll opened, a poll closed. The
 * event sends now, through the engine's own rule and the engine's own log key,
 * so whichever of the event and the hourly tick gets there first is the only
 * one that sends.
 *
 * Tue, Nov 3 2026, 9:30 am in New York (EST) = 14:30Z.
 */
import { describe, expect, it } from "vitest";
import {
  announceReminderEvent,
  runReminderTick,
  type ReminderLogRow,
  type ReminderOrg,
  type ReminderSender,
  type ReminderStore,
} from "#core/server/utils/reminders";
import { resolveReminderSettings, type ResolvedReminderSettings } from "#core/shared/reminders/settings";
import type { PollInput, ReminderSnapshot, RequestInput } from "#core/shared/reminders/rules";
import type { ComposedReminder } from "#core/shared/reminders/messages";

const NOW = new Date("2026-11-03T14:30:00Z");
const LATE = new Date("2026-11-04T04:00:00Z"); // 11 pm Tue in New York: quiet hours
const ME = "user-me";
const NEIGHBOR = "user-neighbor";

const notUnique = () =>
  Object.assign(new Error("unique"), { errors: [{ message: "unique", extensions: { code: "RECORD_NOT_UNIQUE" } }] });
const yieldNow = () => new Promise<void>((r) => setTimeout(r, 0));

class Store implements ReminderStore {
  rows = new Map<string, ReminderLogRow & { id: string; result: string; detail?: string }>();
  loads: Array<{ only?: unknown }> = [];
  private seq = 0;
  constructor(public org: ReminderOrg, public polls: PollInput[] = [], public requests: RequestInput[] = []) {}
  async listOrgs() {
    return [this.org];
  }
  async loadSnapshot(org: ReminderOrg, settings: ResolvedReminderSettings, opts: { only?: { collection: string; id: string } }) {
    await yieldNow();
    this.loads.push({ only: opts.only });
    // What the real store does with `only`: just that poll or request.
    const keep = <T extends { id: string }>(rows: T[], collection: string) =>
      opts.only?.collection === collection ? rows.filter((r) => r.id === opts.only!.id) : rows;
    return {
      org: { id: org.id, slug: org.slug, name: org.name, timeZone: org.timeZone, graceDays: org.graceDays },
      settings,
      charges: [],
      meetings: [],
      requests: keep(this.requests, "hoa_requests"),
      polls: keep(this.polls, "hoa_polls"),
      vendors: [],
      adminUserIds: [],
    } satisfies ReminderSnapshot;
  }
  async existingKeys(keys: string[]) {
    await yieldNow();
    return new Set(keys.filter((k) => this.rows.has(k)));
  }
  private put(r: ReminderLogRow) {
    const id = `log-${++this.seq}`;
    this.rows.set(r.reminder_key, { ...r, id, result: r.result });
    return id;
  }
  async insertLogs(rows: ReminderLogRow[]) {
    await yieldNow();
    if (rows.some((r) => this.rows.has(r.reminder_key))) throw notUnique();
    return rows.map((r) => this.put(r));
  }
  async insertLog(row: ReminderLogRow) {
    await yieldNow();
    if (this.rows.has(row.reminder_key)) throw notUnique();
    return this.put(row);
  }
  async settleLogs(ids: string[], patch: { result: "sent" | "failed"; detail: string }) {
    for (const r of this.rows.values()) if (ids.includes(r.id)) Object.assign(r, patch);
  }
  async stampCharges() {}
}

const org = (reminders: unknown = null): ReminderOrg => ({
  id: "org-1",
  slug: "demo",
  name: "Demo HOA",
  timeZone: "America/New_York",
  graceDays: 5,
  reminders,
});
const on = (...rules: string[]) => ({ rules: Object.fromEntries(rules.map((r) => [r, { enabled: true }])) });

const recorder = () => {
  const sent: ComposedReminder[] = [];
  const send: ReminderSender = async (_org, c) => {
    sent.push(c);
    return { bell: c.recipients.length, push: c.recipients.length, email: c.channels.includes("email") ? c.recipients.length : 0 };
  };
  return { sent, send };
};

const closedPoll = (over: Partial<PollInput> = {}): PollInput => ({
  id: "p1",
  question: "Repaint the fence?",
  status: "closed",
  createdAt: "2026-10-20T14:00:00Z",
  closesAt: "2026-11-03T14:29:30Z",
  audienceUserIds: [ME, NEIGHBOR],
  voterUserIds: [ME],
  resultSentence: "Yes — 12 of 20 votes",
  ...over,
});
const openPoll = (over: Partial<PollInput> = {}): PollInput => ({
  id: "p1",
  question: "Repaint the fence?",
  status: "open",
  createdAt: "2026-11-03T14:29:50Z",
  closesAt: null,
  audienceUserIds: [ME, NEIGHBOR],
  voterUserIds: [],
  ...over,
});
const resolved = (over: Partial<RequestInput> = {}): RequestInput => ({
  id: "r1",
  type: "maintenance",
  title: "Broken gate",
  status: "resolved",
  statusChangedAt: "2026-11-03T14:29:55Z",
  submittedBy: ME,
  ...over,
});

const POLL = { collection: "hoa_polls", id: "p1" } as const;
const REQ = { collection: "hoa_requests", id: "r1" } as const;
const event = (store: Store, send: ReminderSender, stage: "status" | "opened" | "closed", entity: typeof POLL | typeof REQ, extra = {}) =>
  announceReminderEvent({ store, send, provisioned: true, org: store.org, entity, stage, asOf: NOW, ...extra });

describe("a poll closing", () => {
  it("tells the whole audience the result, once, and claims the engine's key", async () => {
    const store = new Store(org(on("poll")), [closedPoll()]);
    const { sent, send } = recorder();
    const r = await event(store, send, "closed", POLL);
    expect(r).toMatchObject({ recipients: 2, sent: 2, skipped: 0, lost: 0, failed: 0 });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ rule: "poll", stage: "closed", recipients: [ME, NEIGHBOR] });
    expect(sent[0]!.vars.result).toBe("Yes — 12 of 20 votes");
    expect([...store.rows.keys()]).toEqual([
      "poll:p1:closed@20261103T1429Z:user-me",
      "poll:p1:closed@20261103T1429Z:user-neighbor",
    ]);
    expect([...store.rows.values()].every((row) => row.result === "sent" && row.detail?.startsWith("event"))).toBe(true);
  });

  it("is the only path that sends: the tick after it finds the keys taken", async () => {
    const store = new Store(org(on("poll")), [closedPoll()]);
    const { sent, send } = recorder();
    await event(store, send, "closed", POLL);
    const tick = await runReminderTick({ store, send, asOf: new Date("2026-11-03T15:05:00Z") });
    expect(tick.totals.sent).toBe(0);
    expect(tick.orgs[0]).toMatchObject({ due: 0, logged: 2 });
    expect(sent).toHaveLength(1);
  });

  it("and the tick first means the event finds the keys taken", async () => {
    const store = new Store(org(on("poll")), [closedPoll()]);
    const { sent, send } = recorder();
    await runReminderTick({ store, send, asOf: NOW });
    expect(sent).toHaveLength(1);
    const r = await event(store, send, "closed", POLL);
    expect(r).toMatchObject({ sent: 0, skipped: 2 });
    expect(sent).toHaveLength(1);
  });

  it("goes out at once, in the quiet hours, where the tick would wait for morning", async () => {
    const poll = closedPoll({ closesAt: "2026-11-04T03:59:30Z" });
    const store = new Store(org(on("poll")), [poll]);
    const { sent, send } = recorder();
    const tick = await runReminderTick({ store, send, asOf: LATE });
    expect(tick.totals.sent).toBe(0);
    const r = await event(store, send, "closed", POLL, { asOf: LATE });
    expect(r.sent).toBe(2);
    expect(sent).toHaveLength(1);
  });

  it("two events at once send once", async () => {
    const store = new Store(org(on("poll")), [closedPoll()]);
    const { sent, send } = recorder();
    const [a, b] = await Promise.all([event(store, send, "closed", POLL), event(store, send, "closed", POLL)]);
    expect(sent).toHaveLength(1);
    expect(a.sent + b.sent).toBe(2);
    expect(a.lost + b.lost + a.skipped + b.skipped).toBeGreaterThan(0);
  });

  it("announces only the poll it was told about", async () => {
    const store = new Store(org(on("poll")), [closedPoll(), closedPoll({ id: "p2", question: "Other?" })]);
    const { sent, send } = recorder();
    await event(store, send, "closed", POLL);
    expect(sent.map((c) => c.entities[0]!.id)).toEqual(["p1"]);
    expect(store.loads).toEqual([{ only: POLL }]);
  });

  it("finds nothing when the poll is still open", async () => {
    const store = new Store(org(on("poll")), [openPoll({ createdAt: "2026-10-01T00:00:00Z" })]);
    const { sent, send } = recorder();
    expect(await event(store, send, "closed", POLL)).toMatchObject({ sent: 0, skipped: 0 });
    expect(sent).toEqual([]);
    expect(store.rows.size).toBe(0);
  });
});

describe("the board's approval still decides the email", () => {
  it("with the rule on, the event carries the approved email and wording", async () => {
    const store = new Store(
      org({ rules: { poll: { enabled: true, copy: { subject: "Result: {{question}}" } } } }),
      [closedPoll()]
    );
    const { sent, send } = recorder();
    await event(store, send, "closed", POLL);
    expect(sent[0]!.channels).toEqual(["bell", "push", "email"]);
    expect(sent[0]!.subject).toBe("Result: Repaint the fence?");
  });

  it("with the rule off, it is a bell and a push, in the standard words — and still claims the key", async () => {
    const store = new Store(org(null), [closedPoll()]);
    const { sent, send } = recorder();
    const r = await event(store, send, "closed", POLL);
    expect(r.sent).toBe(2);
    expect(sent[0]!.channels).toEqual(["bell", "push"]);
    expect(store.rows.size).toBe(2);
    // The board turns the rule on later the same day: nothing goes out a second time.
    const later = new Store(org(on("poll")), [closedPoll()]);
    later.rows = store.rows;
    const tick = await runReminderTick({ store: later, send, asOf: NOW });
    expect(tick.totals.sent).toBe(0);
    expect(sent).toHaveLength(1);
  });

  it("a stage the board turned off sends no email either", async () => {
    const store = new Store(org({ rules: { poll: { enabled: true, stages: { closed: false } } } }), [closedPoll()]);
    const { sent, send } = recorder();
    await event(store, send, "closed", POLL);
    expect(sent[0]!.channels).toEqual(["bell", "push"]);
  });
});

describe("a poll opening", () => {
  it("asks the audience who haven't voted, under the engine's key", async () => {
    const store = new Store(org(on("poll")), [openPoll({ voterUserIds: [ME] })]);
    const { sent, send } = recorder();
    await event(store, send, "opened", POLL);
    expect(sent[0]).toMatchObject({ stage: "opened", recipients: [NEIGHBOR] });
    expect([...store.rows.keys()]).toEqual(["poll:p1:opened@20261103T1429Z:user-neighbor"]);
    const tick = await runReminderTick({ store, send, asOf: new Date("2026-11-03T15:05:00Z") });
    expect(tick.totals.sent).toBe(0);
  });

  it("an old draft put to the community now is still news", async () => {
    const store = new Store(org(on("poll")), [openPoll({ createdAt: "2026-09-01T12:00:00Z" })]);
    const { sent, send } = recorder();
    const r = await event(store, send, "opened", POLL);
    expect(r.sent).toBe(2);
    expect(sent).toHaveLength(1);
    // Its date_created is two months old: the tick would never have announced it.
    const tick = await runReminderTick({ store, send, asOf: new Date("2026-11-03T15:05:00Z") });
    expect(tick.totals.sent).toBe(0);
  });
});

describe("a request changing status", () => {
  it("tells the person who submitted it, once, under the engine's key", async () => {
    const store = new Store(org(on("request")), [], [resolved()]);
    const { sent, send } = recorder();
    const r = await event(store, send, "status", REQ);
    expect(r).toMatchObject({ recipients: 1, sent: 1 });
    expect(sent[0]).toMatchObject({ rule: "request", stage: "status", recipients: [ME], category: "request" });
    expect([...store.rows.keys()]).toEqual(["request:r1:status@resolved.20261103T1429Z:user-me"]);
    expect(await event(store, send, "status", REQ)).toMatchObject({ sent: 0, skipped: 1 });
    const tick = await runReminderTick({ store, send, asOf: new Date("2026-11-03T15:05:00Z") });
    expect(tick.totals.sent).toBe(0);
    expect(sent).toHaveLength(1);
  });

  it("survives a browser clock a few seconds ahead of the server", async () => {
    const store = new Store(org(on("request")), [], [resolved({ statusChangedAt: "2026-11-03T14:30:07Z" })]);
    const { sent, send } = recorder();
    expect(await event(store, send, "status", REQ)).toMatchObject({ sent: 1 });
    expect(sent).toHaveLength(1);
  });

  it("says nothing for a change the rule doesn't tell residents about", async () => {
    const { sent, send } = recorder();
    for (const req of [resolved({ type: "violation" }), resolved({ status: "open" }), resolved({ submittedBy: null }), resolved({ statusChangedAt: null })]) {
      const store = new Store(org(on("request")), [], [req]);
      expect(await event(store, send, "status", REQ)).toMatchObject({ sent: 0 });
    }
    expect(sent).toEqual([]);
  });
});

describe("failure and the log", () => {
  it("a failed send leaves the claim: a miss, never a double", async () => {
    const store = new Store(org(on("poll")), [closedPoll()]);
    const failing: ReminderSender = async () => {
      throw new Error("push provider down");
    };
    const r = await event(store, failing, "closed", POLL);
    expect(r).toMatchObject({ sent: 0, failed: 2 });
    expect([...store.rows.values()].map((row) => row.result)).toEqual(["failed", "failed"]);
    const { sent, send } = recorder();
    expect(await event(store, send, "closed", POLL)).toMatchObject({ sent: 0, skipped: 2 });
    expect(sent).toEqual([]);
  });

  it("before the log exists it still tells people, and claims nothing", async () => {
    const store = new Store(org(on("poll")), [closedPoll()]);
    const { sent, send } = recorder();
    const r = await announceReminderEvent({ store, send, provisioned: false, org: store.org, entity: POLL, stage: "closed", asOf: NOW });
    expect(r.sent).toBe(2);
    expect(sent).toHaveLength(1);
    expect(store.rows.size).toBe(0);
  });
});

describe("the settings the card saves are the settings the event reads", () => {
  it("a rule saved on through prepareReminderSettings is a rule the event treats as on", async () => {
    const { prepareReminderSettings } = await import("#core/shared/reminders/admin");
    const saved = prepareReminderSettings(null, { rules: { poll: { enabled: true } } }, { userId: "admin-1", now: NOW.toISOString() });
    expect(resolveReminderSettings(saved).rules.poll.enabled).toBe(true);
    const store = new Store(org(saved), [closedPoll()]);
    const { sent, send } = recorder();
    await event(store, send, "closed", POLL);
    expect(sent[0]!.channels).toContain("email");
  });
});
