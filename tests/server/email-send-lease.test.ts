/**
 * The per-email lease (docs/spec-email-send-queue.md §3.1, §4.2; §10 group C).
 * Directus has no atomic conditional update; a unique index on insert is the
 * one atomic primitive, so the mutex is a row.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { acquireLease, releaseLease, runBatch } from "#core/server/utils/email-send-queue";
import { STALE_MS, TICK_BUDGET_MS } from "#core/server/utils/email-send-constants";
import { writeSnapshot } from "#core/server/utils/email-send-enqueue";
import { MemoryStore, fakeClock, fakeSendGrid, seedSending, simpleDeps } from "./support/email-queue-memory";

let store: MemoryStore;
let clock: ReturnType<typeof fakeClock>;

beforeEach(() => {
  store = new MemoryStore();
  clock = fakeClock();
});

describe("the lease (C)", () => {
  it("25. acquire inserts a lease row and returns a token", async () => {
    const lease = await acquireLease(store, "e1", "send", "cron", clock);
    expect(lease).toMatchObject({ email: "e1", purpose: "send", worker: "cron", started_at: new Date(clock.t).toISOString() });
    expect(lease!.token).toMatch(/^[0-9a-f-]{36}$/);
    expect(store.leases.size).toBe(1);
  });

  it("26. a second acquire gets RECORD_NOT_UNIQUE and reports busy: no rows claimed, no delivery", async () => {
    await seedSending(store, 3, { emailId: "e1" });
    await acquireLease(store, "e1", "send", "inline", clock);
    const sg = fakeSendGrid();
    const r = await runBatch({ store, emailId: "e1", worker: "cron", budgetMs: TICK_BUDGET_MS, clock, ...simpleDeps(sg) });
    expect(r.stopped).toBe("busy");
    expect(store.calls).not.toContain("claim");
    expect(sg.calls).toHaveLength(0);
  });

  it("27. a stale lease is deleted by id and replaced", async () => {
    const old = await acquireLease(store, "e1", "send", "cron", clock);
    clock.advance(STALE_MS + 1);
    const fresh = await acquireLease(store, "e1", "send", "cron", clock);
    expect(fresh).not.toBeNull();
    expect(fresh!.id).not.toBe(old!.id);
    expect([...store.leases.values()].map((l) => l.id)).toEqual([fresh!.id]);
  });

  it("a lease younger than STALE_MS is never broken", async () => {
    await acquireLease(store, "e1", "send", "cron", clock);
    clock.advance(STALE_MS - 1);
    expect(await acquireLease(store, "e1", "send", "cron", clock)).toBeNull();
  });

  it("28. two breakers of one stale lease: exactly one wins; both deletes target the stale id only", async () => {
    const stale = await acquireLease(store, "e1", "send", "cron", clock);
    clock.advance(STALE_MS + 1);
    const deletes: string[] = [];
    const del = store.deleteLease.bind(store);
    store.deleteLease = async (l) => {
      deletes.push(l.id);
      return del(l);
    };
    // Interleave: both read the stale lease before either deletes it.
    const read = store.readLease.bind(store);
    let gate!: () => void;
    const bothRead = new Promise<void>((r) => (gate = r));
    let reads = 0;
    store.readLease = async (id) => {
      const l = await read(id);
      if (++reads === 2) gate();
      await bothRead;
      return l;
    };
    const [a, b] = await Promise.all([
      acquireLease(store, "e1", "send", "cron", clock),
      acquireLease(store, "e1", "send", "cron", clock),
    ]);
    expect([a, b].filter(Boolean)).toHaveLength(1);
    expect(deletes).toEqual([stale!.id, stale!.id]);
    expect(store.leases.size).toBe(1);
  });

  it("29. release deletes only its own lease by id", async () => {
    const mine = await acquireLease(store, "e1", "send", "cron", clock);
    clock.advance(STALE_MS + 1);
    const breaker = await acquireLease(store, "e1", "send", "cron", clock);
    await releaseLease(store, mine!);
    expect([...store.leases.values()].map((l) => l.token)).toEqual([breaker!.token]);
  });

  it("30. prepare and send leases are the same mutex: a tick can't send during a prepare; a second enqueue is 409", async () => {
    store.addEmail({ id: "e1", status: "draft" });
    let release!: () => void;
    const paused = new Promise<void>((r) => (release = r));
    const first = writeSnapshot(store, {
      emailId: "e1",
      runKey: "m:a",
      rows: [],
      total: 0,
      suppressedCount: 0,
      worker: "inline",
      clock,
      expect: (s) => s !== "sending",
      restoreStatus: "draft",
      hooks: { step: async (name) => (name === "lease-acquired" ? paused : undefined) },
    });
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));

    const sg = fakeSendGrid();
    const tick = await runBatch({ store, emailId: "e1", worker: "cron", budgetMs: TICK_BUDGET_MS, clock, ...simpleDeps(sg) });
    expect(tick.stopped).toBe("busy");

    await expect(
      writeSnapshot(store, {
        emailId: "e1", runKey: "m:b", rows: [], total: 0, suppressedCount: 0, worker: "inline", clock,
        expect: (s) => s !== "sending", restoreStatus: "draft",
      })
    ).rejects.toMatchObject({ statusCode: 409, code: "send_in_progress" });

    release();
    await first;
    expect(store.email("e1")).toMatchObject({ status: "sending", send_run_key: "m:a", total_recipients: 0 });
  });
});
