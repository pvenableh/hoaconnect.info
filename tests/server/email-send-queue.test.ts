/**
 * The send queue's state machine (docs/spec-email-send-queue.md §10, group A,
 * and group J's render-point rules 63–66). An in-memory RecipientStore and a
 * fake SendGrid; every test runs in milliseconds.
 *
 * The property: for every row, deliver() is called at most once, ever.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  runBatch,
  EXPIRED_MESSAGE,
  type QueueRow,
} from "#core/server/utils/email-send-queue";
import { CHUNK, CHUNK_RESERVE_MS, STALE_MS, TICK_BUDGET_MS, TICK_MAX_DURATION_S } from "#core/server/utils/email-send-constants";
import { VERCEL_FUNCTION_RULES } from "#core/modules/vercel-function-rules";
import { MemoryStore, busyError, fakeClock, fakeSendGrid, seedSending, simpleDeps } from "./support/email-queue-memory";

vi.mock("nuxt/kit", () => ({ defineNuxtModule: (m: unknown) => m }));

let store: MemoryStore;
let clock: ReturnType<typeof fakeClock>;
let sg: ReturnType<typeof fakeSendGrid>;

beforeEach(() => {
  store = new MemoryStore();
  clock = fakeClock();
  sg = fakeSendGrid();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

const run = (deps = simpleDeps(sg), over: Partial<Parameters<typeof runBatch>[0]> = {}) =>
  runBatch({ store, emailId: "email-1", worker: "cron", budgetMs: TICK_BUDGET_MS, clock, ...deps, ...over } as any);

const statuses = () => store.rowsOf("email-1").map((r) => r.status);

describe("the state machine (A)", () => {
  it("1. claims in position order, CHUNK at a time", async () => {
    await seedSending(store, 250);
    const claims: string[][] = [];
    const orig = store.claim.bind(store);
    store.claim = async (...a) => {
      const rows = await orig(...a);
      claims.push(rows.map((r) => r.recipient_email!));
      return rows;
    };
    const r = await run();
    expect(claims.map((c) => c.length)).toEqual([CHUNK, CHUNK, 50]);
    expect(claims.flat()).toEqual(Array.from({ length: 250 }, (_, i) => `p${i + 1}@example.com`));
    expect(r.stopped).toBe("done");
    expect(sg.accepted).toHaveLength(250);
  });

  it("2. renders before claiming: a prepare that throws leaves every row queued, no token", async () => {
    await seedSending(store, 5);
    await expect(run(simpleDeps(sg, { prepareThrows: true }))).rejects.toThrow("render exploded");
    expect(statuses().every((s) => s === "queued")).toBe(true);
    expect(store.rowsOf("email-1").every((r) => r.claim === null)).toBe(true);
    expect(store.calls).not.toContain("claim");
    expect(store.leases.size).toBe(0);
  });

  it("3. claim writes token and claimed_at only on queued rows", async () => {
    await seedSending(store, 4);
    const [a, b, c] = store.rowsOf("email-1");
    Object.assign(a!, { status: "claimed", claim: "other-token", claimed_at: new Date(clock.t).toISOString() });
    Object.assign(b!, { status: "sent" });
    const rows = await store.claim("email-1", a!.run_key, [a!.id, b!.id, c!.id], "mine", "2026-11-03T12:00:01.000Z");
    expect(rows.map((r) => r.id)).toEqual([c!.id]);
    expect(store.rows.get(a!.id)).toMatchObject({ status: "claimed", claim: "other-token" });
    expect(store.rows.get(b!.id)).toMatchObject({ status: "sent", claim: null });
  });

  it("4. delivers only rows read back under its own token", async () => {
    await seedSending(store, 3);
    const victim = store.rowsOf("email-1")[1]!;
    const orig = store.claim.bind(store);
    store.claim = async (emailId, runKey, ids, token, at) => {
      const rows = await orig(emailId, runKey, ids, token, at);
      // Another writer overwrote one row's claim between the update and the read-back.
      Object.assign(store.rows.get(victim.id)!, { claim: "someone-else" });
      return rows.filter((r) => store.rows.get(r.id)!.claim === token);
    };
    await run();
    expect(sg.calls).not.toContain(victim.recipient_email);
    expect(sg.calls).toHaveLength(2);
  });

  it("5. settles 202 as sent with sg_message_id and sent_at from the response", async () => {
    await seedSending(store, 1);
    await run();
    const row = store.rowsOf("email-1")[0]!;
    expect(row).toMatchObject({ status: "sent", sg_message_id: "sg-1", sent_at: new Date(clock.t).toISOString() });
  });

  it("6. settles 4xx as failed without retry", async () => {
    await seedSending(store, 1);
    sg.script.set("p1@example.com", [400]);
    await run();
    expect(sg.calls).toHaveLength(1);
    expect(store.rowsOf("email-1")[0]).toMatchObject({ status: "failed", error_message: "400: status 400" });
  });

  it("7. retries 5xx three times then fails, sleeping 1 s and 2 s", async () => {
    await seedSending(store, 1);
    sg.script.set("p1@example.com", [500, 502, 503]);
    await run();
    expect(sg.calls).toHaveLength(3);
    expect(clock.sleeps).toEqual([1000, 2000]);
    expect(store.rowsOf("email-1")[0]).toMatchObject({ status: "failed", error_message: "503: status 503" });
  });

  it("8. retries 429 then requeues and stops rate_limited; later rows are requeued undelivered", async () => {
    await seedSending(store, 30);
    sg.script.set("p1@example.com", [429, 429, 429]);
    const deps = simpleDeps(sg);
    const deliver = deps.deliver;
    // Every other message takes a few real milliseconds, so the 429 verdict
    // (whose retry sleeps are instant here) lands while the first ten are in flight.
    deps.deliver = async (msg) => {
      if (msg.to !== "p1@example.com") await new Promise((r) => setTimeout(r, 5));
      return deliver(msg);
    };
    const r = await run(deps);
    expect(r.stopped).toBe("rate_limited");
    expect(clock.sleeps).toEqual([1000, 2000]);
    const rows = store.rowsOf("email-1");
    expect(rows[0]).toMatchObject({ status: "queued", claim: null, claimed_at: null });
    // The nine in flight finish; nothing past them was handed to deliver.
    expect(rows.slice(1, 10).every((x) => x.status === "sent")).toBe(true);
    expect(rows.slice(10).every((x) => x.status === "queued" && x.claim === null)).toBe(true);
    expect(new Set(sg.calls)).toEqual(new Set(rows.slice(0, 10).map((x) => x.recipient_email)));
    expect(r.requeued).toBe(21);
  });

  it("9. settles a network error as unknown, never retried", async () => {
    await seedSending(store, 1);
    sg.script.set("p1@example.com", ["network"]);
    await run();
    expect(sg.calls).toHaveLength(1);
    expect(store.rowsOf("email-1")[0]).toMatchObject({ status: "unknown", error_message: "socket hang up" });
  });

  it("10. releases the chunk when something throws before the first deliver (stalled on busy, rethrow otherwise)", async () => {
    await seedSending(store, 4);
    store.faults.push({ method: "liveMembers", error: busyError() });
    const r = await run();
    expect(r.stopped).toBe("stalled");
    expect(statuses()).toEqual(["queued", "queued", "queued", "queued"]);
    expect(store.rowsOf("email-1").every((x) => x.claim === null)).toBe(true);
    expect(store.email("email-1").send_last_error).toBe("Service Unavailable");
    expect(sg.calls).toHaveLength(0);

    store.faults.push({ method: "liveMembers", error: new Error("boom") });
    await expect(run()).rejects.toThrow("boom");
    expect(statuses()).toEqual(["queued", "queued", "queued", "queued"]);
  });

  it("11. never releases once delivery began", async () => {
    await seedSending(store, 3);
    store.faults.push({ method: "settle", error: new Error("settle blew up") });
    await expect(run()).rejects.toThrow("settle blew up");
    expect(sg.accepted).toHaveLength(3);
    expect(statuses()).toEqual(["claimed", "claimed", "claimed"]);
    expect(store.calls).not.toContain("release");
  });

  it("12. stops at the budget but finishes the claimed chunk", async () => {
    await seedSending(store, 150);
    const deps = simpleDeps(sg);
    const deliver = deps.deliver;
    deps.deliver = async (msg) => {
      clock.advance(400); // 100 rows × 400 ms ≫ the budget
      return deliver(msg);
    };
    const r = await run(deps);
    expect(r.stopped).toBe("budget");
    const rows = store.rowsOf("email-1");
    expect(rows.slice(0, CHUNK).every((x) => x.status === "sent")).toBe(true);
    expect(rows.slice(CHUNK).every((x) => x.status === "queued" && x.claim === null)).toBe(true);
  });

  it("13. does not claim with less than CHUNK_RESERVE_MS left", async () => {
    await seedSending(store, 5);
    const r = await run(undefined, { budgetMs: CHUNK_RESERVE_MS - 1 });
    expect(r.stopped).toBe("budget");
    expect(store.calls).not.toContain("claim");
    expect(statuses().every((s) => s === "queued")).toBe(true);
  });

  it("14. stops done when the queue drains, and completes the send", async () => {
    await seedSending(store, 3);
    const r = await run();
    expect(r).toMatchObject({ stopped: "done", sent: 3, completed: true });
    expect(store.email("email-1")).toMatchObject({ status: "sent", total_sent: 3, delivered_count: 3 });
    expect(store.leases.size).toBe(0);
  });

  it("15. expires claimed rows older than STALE_MS to unknown at run start; younger ones untouched", async () => {
    await seedSending(store, 3);
    const [old, young] = store.rowsOf("email-1");
    Object.assign(old!, { status: "claimed", claim: "dead", claimed_at: new Date(clock.t - STALE_MS - 1).toISOString() });
    Object.assign(young!, { status: "claimed", claim: "dead", claimed_at: new Date(clock.t - 1000).toISOString() });
    const r = await run();
    expect(r.expired).toBe(1);
    expect(store.rows.get(old!.id)).toMatchObject({ status: "unknown", error_message: EXPIRED_MESSAGE });
    expect(store.rows.get(young!.id)).toMatchObject({ status: "claimed" });
    expect(sg.calls).not.toContain(old!.recipient_email);
    expect(sg.calls).not.toContain(young!.recipient_email);
  });

  it("16. STALE_MS is at least three times the route's maxDuration", () => {
    const route = VERCEL_FUNCTION_RULES["/api/email/cron/continue-sends"]!;
    expect(route.maxDuration).toBe(TICK_MAX_DURATION_S);
    expect(STALE_MS).toBeGreaterThanOrEqual(3 * route.maxDuration * 1000);
    // And a run stops claiming well inside the hard stop.
    expect(TICK_BUDGET_MS).toBeLessThan(route.maxDuration * 1000);
  });

  it("17. settle through a busy Directus lands on the second try", async () => {
    await seedSending(store, 2);
    store.faults.push({ method: "settle", error: busyError() });
    const r = await run();
    expect(r.sent).toBe(2);
    expect(statuses()).toEqual(["sent", "sent"]);
    expect(store.calls.filter((c) => c === "settle")).toHaveLength(2);
  });

  it("18. settle writes unknown and failed only where still claimed", async () => {
    await seedSending(store, 2);
    const [a, b] = store.rowsOf("email-1");
    Object.assign(a!, { status: "claimed", claim: "t" });
    Object.assign(b!, { status: "sent", claim: "t" }); // the webhook got there first
    await store.settle({ sent: [], failed: [{ id: b!.id, reason: "late 400" }], unknown: [{ id: a!.id, reason: "timeout" }], suppressed: [] });
    expect(store.rows.get(b!.id)!.status).toBe("sent");
    expect(store.rows.get(a!.id)!.status).toBe("unknown");
  });
});

describe("3a rules at render (J)", () => {
  it("63. recipientCompliance gets the live token per recipient; a copy row gets none", async () => {
    await seedSending(store, 2);
    store.addMember({ id: "m-1", email: "p1@example.com", unsubscribe_token: "fresh-token" });
    await store.createRows([
      {
        email: "email-1", run_key: "m:2026-11-03T12:00:00.000Z", kind: "copy", position: 3,
        dedupe_key: "email-1:m:2026-11-03T12:00:00.000Z:a:board@x.com", member: null,
        recipient_email: "board@x.com", recipient_name: null, status: "queued", member_fields: null, copies: null,
      },
    ]);
    const deps = simpleDeps(sg);
    await run(deps);
    expect(deps.finalized.map((f) => [f.kind, f.token])).toEqual([
      ["member", "fresh-token"],
      ["member", "tok-2"],
      ["copy", null],
    ]);
    // One recheck read per chunk, members only.
    expect(store.calls.filter((c) => c === "liveMembers")).toHaveLength(1);
  });

  it("64. a member who opted out between enqueue and claim is suppressed on community, sent on essential", async () => {
    await seedSending(store, 2);
    store.addMember({ id: "m-2", email: "p2@example.com", email_community_opt_out: true });
    await run(simpleDeps(sg, { emailClass: "community" }));
    expect(store.rowsOf("email-1")[1]).toMatchObject({ status: "suppressed", suppressed_reason: "opted_out_mid_send" });
    expect(sg.calls).toEqual(["p1@example.com"]);

    store = new MemoryStore();
    sg = fakeSendGrid();
    await seedSending(store, 2);
    store.addMember({ id: "m-2", email: "p2@example.com", email_community_opt_out: true });
    await run(simpleDeps(sg, { emailClass: "essential" }));
    expect(sg.calls).toEqual(["p1@example.com", "p2@example.com"]);
  });

  it("65. a member who bounced between enqueue and claim is suppressed on both classes", async () => {
    for (const emailClass of ["community", "essential"] as const) {
      store = new MemoryStore();
      sg = fakeSendGrid();
      await seedSending(store, 2);
      store.addMember({ id: "m-1", email: "p1@example.com", email_bounced: true });
      await run(simpleDeps(sg, { emailClass }));
      expect(store.rowsOf("email-1")[0]).toMatchObject({ status: "suppressed", suppressed_reason: "bounced_mid_send" });
      expect(sg.calls).toEqual(["p2@example.com"]);
      expect(store.email("email-1").total_suppressed).toBe(1);
    }
  });

  it("66. a failed recheck read releases the chunk and sends nothing", async () => {
    await seedSending(store, 3);
    store.faults.push({ method: "liveMembers", error: busyError() });
    await run();
    expect(sg.calls).toHaveLength(0);
    expect(statuses()).toEqual(["queued", "queued", "queued"]);
  });

  it("a member deleted mid-send is failed, never sent", async () => {
    await seedSending(store, 2);
    store.members.delete("m-1");
    await run();
    expect(store.rowsOf("email-1")[0]).toMatchObject({ status: "failed" });
    expect(sg.calls).toEqual(["p2@example.com"]);
  });

  it("a row that fails to render is failed, the rest go", async () => {
    await seedSending(store, 2);
    await run(simpleDeps(sg, { failRows: ["p1@example.com"] }));
    expect(store.rowsOf("email-1")[0]).toMatchObject({ status: "failed", error_message: "Could not render: bad merge" });
    expect(sg.calls).toEqual(["p2@example.com"]);
  });

  it("a second run while the first holds the lease is busy and touches nothing", async () => {
    await seedSending(store, 2);
    await store.insertLease({ email: "email-1", token: "held", purpose: "send", worker: "cron", started_at: new Date(clock.t).toISOString() });
    store.calls = [];
    const r = await run();
    expect(r.stopped).toBe("busy");
    expect(store.calls).not.toContain("claim");
    expect(sg.calls).toHaveLength(0);
  });
});

export type { QueueRow };
