/**
 * The reminder tick (Earnest parity round 3, Phase 5a): the claim is the
 * insert, made before the send; a re-run inserts and sends nothing; two
 * overlapping runs send once (the loser's insert gets RECORD_NOT_UNIQUE); a
 * crash after the claim is a miss, never a double; the budget carries on next
 * tick; the dry run writes nothing; dues stamp their charges. Then the route:
 * the cron gate, `provisioned: false`, and `asOf` only on a dry run.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  runReminderTick,
  pollResultSentence,
  type ReminderLogRow,
  type ReminderOrg,
  type ReminderSender,
  type ReminderStore,
} from "#core/server/utils/reminders";
import { REMINDER_RULES, resolveReminderSettings, type ResolvedReminderSettings } from "#core/shared/reminders/settings";
import type { ReminderSnapshot } from "#core/shared/reminders/rules";
import type { ComposedReminder } from "#core/shared/reminders/messages";

const notUnique = () =>
  Object.assign(new Error('Value for field "reminder_key" in collection "hoa_reminder_log" has to be unique.'), {
    errors: [{ message: "unique", extensions: { code: "RECORD_NOT_UNIQUE" } }],
  });

const yieldNow = () => new Promise<void>((r) => setTimeout(r, 0));

/** hoa_reminder_log with its UNIQUE index, and everything the tick reads. */
class MemoryReminderStore implements ReminderStore {
  rows = new Map<string, ReminderLogRow & { id: string; result: string; detail?: string; sent_at?: string }>();
  writes = 0;
  thrown: unknown[] = [];
  stamps: Array<{ ids: string[]; stage: string }> = [];
  private seq = 0;
  constructor(
    public orgs: ReminderOrg[],
    public snapshotFor: (org: ReminderOrg, settings: ResolvedReminderSettings) => ReminderSnapshot
  ) {}
  async listOrgs(org?: string | null) {
    await yieldNow();
    return org ? this.orgs.filter((o) => o.slug === org || o.id === org) : this.orgs;
  }
  async loadSnapshot(org: ReminderOrg, settings: ResolvedReminderSettings) {
    await yieldNow();
    return this.snapshotFor(org, settings);
  }
  async existingKeys(keys: string[]) {
    await yieldNow();
    return new Set(keys.filter((k) => this.rows.has(k)));
  }
  async insertLogs(rows: ReminderLogRow[]) {
    await yieldNow();
    // One transaction: a taken key fails the whole batch.
    if (rows.some((r) => this.rows.has(r.reminder_key))) {
      const e = notUnique();
      this.thrown.push(e);
      throw e;
    }
    this.writes++;
    return rows.map((r) => this.put(r));
  }
  async insertLog(row: ReminderLogRow) {
    await yieldNow();
    if (this.rows.has(row.reminder_key)) {
      const e = notUnique();
      this.thrown.push(e);
      throw e;
    }
    this.writes++;
    return this.put(row);
  }
  async settleLogs(ids: string[], patch: { result: "sent" | "failed"; detail: string; sent_at: string }) {
    this.writes++;
    for (const r of this.rows.values()) if (ids.includes(r.id)) Object.assign(r, patch);
  }
  async stampCharges(ids: string[], stage: string) {
    this.writes++;
    this.stamps.push({ ids, stage });
  }
  private put(row: ReminderLogRow) {
    const id = `log-${++this.seq}`;
    this.rows.set(row.reminder_key, { ...row, id });
    return id;
  }
  results() {
    return [...this.rows.values()].map((r) => r.result);
  }
}

const allOn = { rules: Object.fromEntries(REMINDER_RULES.map((r) => [r, { enabled: true }])) };
const ORG: ReminderOrg = { id: "org-a", slug: "oak", name: "Oak Court", timeZone: "America/New_York", graceDays: 5, reminders: allOn };
const ORG_B: ReminderOrg = { ...ORG, id: "org-b", slug: "elm", name: "Elm Row" };
// Tue, Nov 10 2026, 9:30 am in New York.
const AS_OF = new Date("2026-11-10T14:30:00Z");

const snapshot = (org: ReminderOrg, settings: ResolvedReminderSettings): ReminderSnapshot => ({
  org: { id: org.id, slug: org.slug, name: org.name, timeZone: org.timeZone, graceDays: org.graceDays },
  settings,
  charges: [
    { id: `${org.slug}-c1`, label: "November dues", status: "active", amountRemaining: 450, dueDate: "2026-11-10", billedUserId: "u1", residents: [{ userId: "u2", residency: "owner" }], sentStages: [] },
    { id: `${org.slug}-c2`, label: "Assessment", status: "active", amountRemaining: 75, dueDate: "2026-11-10", billedUserId: "u1", residents: [], sentStages: [] },
  ],
  meetings: [
    { id: `${org.slug}-m1`, title: "Board meeting", startsAt: "2026-11-10T23:30:00Z", status: "scheduled", published: true, audienceUserIds: ["u1", "u2", "u3"] },
  ],
  requests: [],
  polls: [],
  vendors: [],
  adminUserIds: [],
});

let sends: ComposedReminder[];
let store: MemoryReminderStore;
const send: ReminderSender = async (_org, c) => {
  sends.push(c);
  return { bell: c.recipients.length, push: 0, email: c.recipients.length };
};

beforeEach(() => {
  sends = [];
  store = new MemoryReminderStore([ORG], snapshot);
});

describe("the tick", () => {
  it("claims, sends one notification per group, then records the result", async () => {
    const r = await runReminderTick({ store, send, asOf: AS_OF });
    // dues: u1 has two charges (one group), u2 one; the meeting: three invitees, one group.
    expect(sends.map((s) => `${s.group}:${s.recipients.join(",")}`)).toEqual([
      "dues:due:u1:u1",
      "dues:due:u2:u2",
      "meeting:oak-m1:day:u1,u2,u3",
    ]);
    expect(store.rows.size).toBe(6);
    expect(store.results().every((x) => x === "sent")).toBe(true);
    expect([...store.rows.values()][0]).toMatchObject({ organization: "org-a", rule: "dues", stage: "due", channels: "bell,push,email", detail: expect.stringContaining("bell") });
    expect(r.totals).toMatchObject({ due: 6, sent: 6, failed: 0, lost: 0, groups: 3 });
    expect(r.orgs[0]).toMatchObject({ slug: "oak", localTime: "2026-11-10 09:30", claimed: 6 });
  });

  it("inserts the log row BEFORE it sends", async () => {
    const seen: string[][] = [];
    await runReminderTick({
      store,
      asOf: AS_OF,
      send: async (o, c) => {
        seen.push(c.keys.map((k) => store.rows.get(k)?.result ?? "missing"));
        return send(o, c);
      },
    });
    expect(seen.flat().every((x) => x === "claimed")).toBe(true);
  });

  it("a re-run inserts and sends nothing", async () => {
    await runReminderTick({ store, send, asOf: AS_OF });
    const writes = store.writes;
    sends = [];
    const again = await runReminderTick({ store, send, asOf: new Date(AS_OF.getTime() + 3_600_000) });
    expect(sends).toEqual([]);
    expect(store.writes).toBe(writes);
    expect(again.orgs[0]).toMatchObject({ due: 0, logged: 6, claimed: 0 });
  });

  it("two overlapping runs send once: the losing insert gets RECORD_NOT_UNIQUE", async () => {
    const [a, b] = await Promise.all([
      runReminderTick({ store, send, asOf: AS_OF }),
      runReminderTick({ store, send, asOf: AS_OF }),
    ]);
    expect(sends).toHaveLength(3);
    expect(new Set(sends.flatMap((s) => s.keys)).size).toBe(6);
    expect(a.totals.sent + b.totals.sent).toBe(6);
    expect(a.totals.lost + b.totals.lost).toBe(6);
    expect(store.thrown.length).toBeGreaterThan(0);
    expect(store.thrown.every((e: any) => e.errors[0].extensions.code === "RECORD_NOT_UNIQUE")).toBe(true);
  });

  it("a key taken mid-group: the free ones are claimed one by one, the taken one is lost", async () => {
    const first = (await runReminderTick({ store, send, asOf: AS_OF, dry: true })).orgs[0]!.wouldSend!;
    // Another run got there first for one of u1's charges.
    const taken = first.find((i) => i.key.startsWith("dues:oak-c2:"))!;
    await store.insertLog({ organization: "org-a", rule: "dues", stage: "due", reminder_key: taken.key, recipient: "u1", entity_collection: "payment_requests", entity_id: "oak-c2", channels: "bell,push,email", result: "claimed" });
    // …but this run read the log before that insert landed.
    const realExisting = store.existingKeys.bind(store);
    store.existingKeys = async (keys) => {
      const s = await realExisting(keys);
      s.delete(taken.key);
      return s;
    };
    const r = await runReminderTick({ store, send, asOf: AS_OF });
    expect(r.totals.lost).toBe(1);
    const u1 = sends.find((s) => s.group === "dues:due:u1")!;
    expect(u1.keys).toEqual([first.find((i) => i.key.startsWith("dues:oak-c1:") && i.member === "u1")!.key]);
    expect(u1.lines!.map((l) => l.label)).toEqual(["November dues"]);
  });

  it("a send that fails is recorded failed and is not retried (at most once)", async () => {
    await runReminderTick({
      store,
      asOf: AS_OF,
      send: async () => {
        throw new Error("SendGrid down");
      },
    });
    expect(store.results().every((x) => x === "failed")).toBe(true);
    expect([...store.rows.values()][0]!.detail).toBe("SendGrid down");
    await runReminderTick({ store, send, asOf: AS_OF });
    expect(sends).toEqual([]);
  });

  it("a run that dies after the claim leaves `claimed` rows: missed, never doubled", async () => {
    // The kill lands between the claim and the result: nothing after the
    // insert reaches Directus.
    store.settleLogs = async () => {
      throw new Error("killed");
    };
    await runReminderTick({
      store,
      asOf: AS_OF,
      send: async () => {
        throw new Error("killed");
      },
    });
    expect(store.rows.size).toBe(6);
    expect(store.results().every((x) => x === "claimed")).toBe(true);
    await runReminderTick({ store, send, asOf: new Date(AS_OF.getTime() + 3_600_000) });
    expect(sends).toEqual([]);
  });

  it("dues stamp their charges in the billing worker's words; others don't", async () => {
    await runReminderTick({ store, send, asOf: AS_OF });
    expect(store.stamps).toEqual([
      { ids: ["oak-c1", "oak-c2"], stage: "due" },
      { ids: ["oak-c1"], stage: "due" },
    ]);
  });

  it("an org with every rule off is skipped (nothing loaded); a stage that is off isn't sent", async () => {
    const loads: string[] = [];
    store = new MemoryReminderStore([{ ...ORG, reminders: null }, { ...ORG_B, reminders: { rules: { meeting: { enabled: true, stages: { day: false } }, dues: { enabled: true } } } }], (o, s) => {
      loads.push(o.slug);
      return snapshot(o, s);
    });
    await runReminderTick({ store, send, asOf: AS_OF });
    expect(loads).toEqual(["elm"]);
    expect(sends.map((s) => s.rule)).toEqual(["dues", "dues"]);
  });

  it("the 40 s budget: stops before the next org and says so; the next tick carries on", async () => {
    store = new MemoryReminderStore([ORG, ORG_B], snapshot);
    let t = 0;
    const now = () => t;
    const slow: ReminderSender = async (o, c) => {
      t += 15_000;
      return send(o, c);
    };
    const first = await runReminderTick({ store, send: slow, asOf: AS_OF, now });
    expect(first.continued).toBe(true);
    expect(first.orgs.map((o) => o.slug)).toEqual(["oak"]);
    expect(first.totals.groups).toBe(3);
    t = 0;
    const next = await runReminderTick({ store, send: slow, asOf: new Date(AS_OF.getTime() + 3_600_000), now });
    expect(next.orgs.find((o) => o.slug === "elm")!.sent).toBe(6);
    expect(next.orgs.find((o) => o.slug === "oak")!.claimed).toBe(0);
  });

  it("one org's failure doesn't end the tick for the others", async () => {
    store = new MemoryReminderStore([ORG, ORG_B], (o, s) => {
      if (o.slug === "oak") throw new Error("Directus 503");
      return snapshot(o, s);
    });
    const r = await runReminderTick({ store, send, asOf: AS_OF });
    expect(r.orgs.find((o) => o.slug === "oak")!.error).toBe("Directus 503");
    expect(r.orgs.find((o) => o.slug === "elm")!.sent).toBe(6);
  });
});

describe("the dry run", () => {
  it("lists what would go out, and what rules that are off would send — and writes nothing", async () => {
    store = new MemoryReminderStore([{ ...ORG, reminders: { rules: { dues: { enabled: true } } } }], snapshot);
    const r = await runReminderTick({ store, send, asOf: AS_OF, dry: true });
    expect(store.writes).toBe(0);
    expect(store.rows.size).toBe(0);
    expect(sends).toEqual([]);
    const o = r.orgs[0]!;
    expect(o.wouldSend!.map((i) => `${i.rule}.${i.stage}:${i.member}`)).toEqual([
      "dues.due:u1",
      "dues.due:u2",
      "dues.due:u1",
    ]);
    expect(o.wouldSendGroups).toEqual([
      { group: "dues:due:u1", subject: "Due today: $525.00", recipients: 1 },
      { group: "dues:due:u2", subject: "Due today: $450.00", recipients: 1 },
    ]);
    expect(o.off).toEqual({ "meeting.day": 3 });
    expect(o.unreachable).toEqual({});
    // A dry run is the same answer however often it is asked.
    const again = await runReminderTick({ store, send, asOf: AS_OF, dry: true });
    expect(again.orgs[0]!.wouldSend).toEqual(o.wouldSend);
  });

  it("evaluates even an org with every rule off, and leaves out what is already logged", async () => {
    store = new MemoryReminderStore([{ ...ORG, reminders: null }], snapshot);
    const r = await runReminderTick({ store, send, asOf: AS_OF, dry: true });
    expect(r.orgs[0]!.wouldSend).toEqual([]);
    expect(r.orgs[0]!.off).toEqual({ "dues.due": 3, "meeting.day": 3 });

    store = new MemoryReminderStore([ORG], snapshot);
    await runReminderTick({ store, send, asOf: AS_OF });
    const after = await runReminderTick({ store, send, asOf: AS_OF, dry: true });
    expect(after.orgs[0]).toMatchObject({ due: 0, logged: 6, wouldSend: [] });
  });
});

describe("poll results", () => {
  it("names the leader, a tie, or no votes", () => {
    const options = [{ id: "a", label: "Yes" }, { id: "b", label: "No" }];
    expect(pollResultSentence(options, [{ option_id: "a" }, { option_id: "a" }, { option_id: "b" }])).toBe("Yes — 2 of 3 votes");
    expect(pollResultSentence(options, [{ option_id: "a" }, { option_id: "b" }])).toBe("A tie between Yes and No — 1 of 2 votes each");
    expect(pollResultSentence(options, [])).toBe("No votes were cast");
  });
});

// ── The route ───────────────────────────────────────────────────────────────

const h = vi.hoisted(() => ({
  schema: true,
  store: null as any,
  storeOpts: null as unknown,
  calls: [] as any[],
}));

vi.mock("#core/server/utils/reminders", async (orig) => {
  const mod = await orig<typeof import("#core/server/utils/reminders")>();
  return {
    ...mod,
    reminderSchema: async () => h.schema,
    directusReminderStore: (_d: unknown, opts: unknown) => {
      h.storeOpts = opts;
      return h.store;
    },
    sendReminder: async () => ({ bell: 1, push: 0, email: 1 }),
    runReminderTick: async (opts: any) => {
      h.calls.push(opts);
      return mod.runReminderTick(opts);
    },
  };
});

const APP_ADMIN = "role-app-admin";
let headers: Record<string, string>;
let session: any;
let query: Record<string, string>;

beforeAll(async () => {
  vi.stubGlobal("defineEventHandler", (fn: any) => fn);
  vi.stubGlobal("getHeader", (_e: unknown, name: string) => headers[name.toLowerCase()]);
  vi.stubGlobal("getUserSession", async () => session);
  vi.stubGlobal("getQuery", () => query);
  vi.stubGlobal("getTypedDirectus", () => ({ request: async () => [] }));
  vi.stubGlobal("useRuntimeConfig", () => ({ public: { appUrl: "https://app.test", directusRoleAppAdmin: APP_ADMIN } }));
  await import("#core/server/api/reminders/run");
}, 120_000);

const route = async () => (await import("#core/server/api/reminders/run")).default as (e: unknown) => Promise<any>;

describe("GET/POST /api/reminders/run", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = "s3cret";
    headers = {};
    session = null;
    query = {};
    h.schema = true;
    h.calls = [];
    h.store = new MemoryReminderStore([ORG], snapshot);
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  it("the cron gate: no secret and no session 401; a wrong secret 401; a member 403", async () => {
    await expect((await route())({})).rejects.toMatchObject({ statusCode: 401 });
    headers = { "x-cron-secret": "nope" };
    await expect((await route())({})).rejects.toMatchObject({ statusCode: 401 });
    headers = {};
    session = { user: { id: "u1", role: "role-member" } };
    await expect((await route())({})).rejects.toMatchObject({ statusCode: 403 });
    expect(h.calls).toEqual([]);
  });

  it("CRON_SECRET by header or Bearer, or an app admin's session, runs it", async () => {
    headers = { "x-cron-secret": "s3cret" };
    expect(await (await route())({})).toMatchObject({ success: true, provisioned: true, via: "cron" });
    headers = { authorization: "Bearer s3cret" };
    expect(await (await route())({})).toMatchObject({ via: "cron" });
    headers = {};
    session = { user: { id: "u9", role: APP_ADMIN } };
    expect(await (await route())({})).toMatchObject({ via: "app-admin" });
  });

  it("an unset CRON_SECRET matches nothing", async () => {
    delete process.env.CRON_SECRET;
    headers = { "x-cron-secret": "" , authorization: "Bearer " };
    await expect((await route())({})).rejects.toMatchObject({ statusCode: 401 });
  });

  it("before the script runs: provisioned false and nothing evaluated — a dry run still evaluates, unprovisioned", async () => {
    h.schema = false;
    headers = { "x-cron-secret": "s3cret" };
    expect(await (await route())({})).toEqual({ success: true, provisioned: false });
    expect(h.calls).toEqual([]);
    query = { dry: "1" };
    const r = await (await route())({});
    expect(r).toMatchObject({ provisioned: false, dry: true });
    expect(h.storeOpts).toEqual({ provisioned: false });
    expect(h.store.writes).toBe(0);
  });

  it("?dry=1&org=&asOf= reaches the tick and writes nothing; asOf without dry is refused", async () => {
    headers = { "x-cron-secret": "s3cret" };
    query = { dry: "1", org: "oak", asOf: "2026-11-10T14:30:00Z" };
    const r = await (await route())({});
    expect(h.calls[0]).toMatchObject({ dry: true, org: "oak" });
    expect(r.asOf).toBe("2026-11-10T14:30:00.000Z");
    expect(r.orgs[0].wouldSend).toHaveLength(6);
    expect(h.store.writes).toBe(0);

    query = { asOf: "2026-11-10T14:30:00Z" };
    await expect((await route())({})).rejects.toMatchObject({ statusCode: 400 });
    query = { dry: "1", asOf: "yesterday-ish" };
    await expect((await route())({})).rejects.toMatchObject({ statusCode: 400 });
  });
});
