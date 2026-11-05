/**
 * The reminder tick END TO END through its real Directus adapter
 * (`directusReminderStore`) on a stateful in-memory Directus with
 * `hoa_reminder_log.reminder_key` UNIQUE — the piece reminder-tick.test.ts
 * replaces with a hand-written store (Phase 9 §9.4).
 *
 * Asserts on what lands in the database: one log row per reminder, the claim
 * written before the send, the charge stamped in the billing worker's
 * vocabulary, a re-run and an overlapping run sending nothing twice, and a dry
 * run writing nothing.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryDirectus } from "./support/memory-directus";
import type { ComposedReminder } from "#core/shared/reminders/messages";

vi.mock("@directus/sdk", async () => (await import("./support/email-queue-memory")).sdkDescriptors);

const { runReminderTick, directusReminderStore } = await import("#core/server/utils/reminders");

const ORG = "org-oak";
// Tue, Nov 10 2026, 9:30 am in New York — the charges below are due today.
const AS_OF = new Date("2026-11-10T14:30:00Z");

let db: MemoryDirectus;
let sends: ComposedReminder[];
let logAtSend: string[][];

const send = async (_org: unknown, c: ComposedReminder) => {
  // What the log says at the moment of sending: the claim must already be there.
  logAtSend.push(c.keys.map((k) => db.all("hoa_reminder_log", { reminder_key: { _eq: k } })[0]?.result ?? "missing"));
  sends.push(c);
  return { bell: c.recipients.length, push: 0, email: c.recipients.length };
};
const tick = (over: Record<string, unknown> = {}) =>
  runReminderTick({ store: directusReminderStore(db as any), send, asOf: AS_OF, ...over });

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => {});
  sends = [];
  logAtSend = [];
  db = new MemoryDirectus({ hoa_reminder_log: ["reminder_key"] });
  db.seed("hoa_organizations", [
    {
      id: ORG,
      slug: "oak",
      name: "Oak Court",
      timezone: "America/New_York",
      payment_grace_period_days: 5,
      settings: { reminders: { rules: { dues: { enabled: true } } } },
    },
  ]);
  db.seed("payment_requests", [
    // u1 is billed for two charges on unit-1 (one grouped notice); u2 lives there.
    { id: "c1", organization: ORG, title: "November dues", request_type: "monthly_dues", status: "active", amount_remaining: 450, due_date: "2026-11-10", metadata: {}, unit: "unit-1", member: { id: "m1", user: "u1" } },
    { id: "c2", organization: ORG, title: "Assessment", request_type: "assessment", status: "partially_paid", amount_remaining: 75, due_date: "2026-11-10", metadata: {}, unit: "unit-1", member: { id: "m1", user: "u1" } },
    // Not reminded: paid, another org, far in the future.
    { id: "c3", organization: ORG, title: "October dues", status: "paid", amount_remaining: 0, due_date: "2026-11-10", metadata: {}, unit: "unit-1", member: { id: "m1", user: "u1" } },
    { id: "c4", organization: "org-elm", title: "Elm dues", status: "active", amount_remaining: 100, due_date: "2026-11-10", metadata: {}, unit: "unit-9", member: { id: "m9", user: "u9" } },
    { id: "c5", organization: ORG, title: "Spring assessment", status: "active", amount_remaining: 300, due_date: "2027-04-01", metadata: {}, unit: "unit-1", member: { id: "m1", user: "u1" } },
  ]);
  db.seed("hoa_member_units", [
    { unit_id: "unit-1", member_type: "owner", is_primary_unit: true, status: "active", end_date: null, member_id: { user: "u1", member_type: "owner", status: "active" } },
    { unit_id: "unit-1", member_type: "owner", is_primary_unit: true, status: "active", end_date: null, member_id: { user: "u2", member_type: "owner", status: "active" } },
    // An ended link and an archived one reach no one.
    { unit_id: "unit-1", member_type: "tenant", is_primary_unit: true, status: "active", end_date: "2026-01-01", member_id: { user: "u3", member_type: "tenant", status: "active" } },
    { unit_id: "unit-1", member_type: "owner", is_primary_unit: true, status: "archived", end_date: null, member_id: { user: "u4", member_type: "owner", status: "active" } },
  ]);
});

describe("runReminderTick on directusReminderStore", () => {
  it("claims a log row per reminder before sending, sends one notice per person, stamps the charges", async () => {
    const r = await tick();

    expect(sends.map((s) => s.recipients.join(",")).sort()).toEqual(["u1", "u2"]);
    const log = db.all("hoa_reminder_log");
    expect(log.length).toBe(r.totals.due);
    expect(r.totals).toMatchObject({ sent: log.length, failed: 0, lost: 0 });
    expect(new Set(log.map((l) => l.entity_id))).toEqual(new Set(["c1", "c2"]));
    expect(log.every((l) => l.organization === ORG && l.rule === "dues" && l.result === "sent")).toBe(true);
    expect(logAtSend.flat().every((x) => x === "claimed")).toBe(true);

    for (const id of ["c1", "c2"]) {
      const c = db.one("payment_requests", id)!;
      expect(c).toMatchObject({ reminder_sent: true, reminder_sent_at: expect.any(String) });
      expect(Object.keys(c.metadata.reminders)).toHaveLength(1);
    }
    expect(db.one("payment_requests", "c5")!.reminder_sent).toBeUndefined();
  });

  it("a re-run an hour later inserts nothing and sends nothing", async () => {
    await tick();
    const rows = db.all("hoa_reminder_log").length;
    sends = [];
    await tick({ asOf: new Date(AS_OF.getTime() + 3_600_000) });
    expect(sends).toEqual([]);
    expect(db.all("hoa_reminder_log")).toHaveLength(rows);
  });

  it("two overlapping ticks send each reminder once — the UNIQUE index decides", async () => {
    const [a, b] = await Promise.all([tick(), tick()]);
    const keys = sends.flatMap((s) => s.keys);
    expect(new Set(keys).size).toBe(keys.length);
    expect(a.totals.sent + b.totals.sent).toBe(db.all("hoa_reminder_log").length);
  });

  it("a dry run reads the same reminders and writes nothing", async () => {
    const r = await tick({ dry: true });
    expect(sends).toEqual([]);
    expect(db.ops.filter((o) => o.op !== "readItems")).toEqual([]);
    expect(r.orgs[0]!.wouldSend?.length ?? 0).toBeGreaterThan(0);
  });

  it("with the dues rule off, nothing is read for dues and nothing is sent", async () => {
    db.one("hoa_organizations", ORG)!.settings = { reminders: { rules: { dues: { enabled: false } } } };
    await tick();
    expect(sends).toEqual([]);
    expect(db.ops.some((o) => o.collection === "payment_requests")).toBe(false);
  });
});
