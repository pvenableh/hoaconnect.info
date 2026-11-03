/**
 * Progress and completion (docs/spec-email-send-queue.md §5; §10 group F):
 * counts are derived from rows, never incremented; the done condition; the
 * completion write; the progress route and its three labels.
 */
import { describe, it, expect, beforeEach, beforeAll, vi } from "vitest";
import { completeSend, deriveProgress, writeCounts, ZERO_COUNTS } from "#core/server/utils/email-send-queue";
import { progressLabel, recipientChip } from "#core/shared/email/send-progress";
import { MemoryStore, fakeClock, fakeDirectus, seedSending } from "./support/email-queue-memory";

vi.mock("@directus/sdk", async () => (await import("./support/email-queue-memory")).sdkDescriptors);
const h = vi.hoisted(() => ({ store: null as any }));
vi.mock("#core/server/utils/email-send-queue", async (orig) => {
  const mod = await orig<typeof import("#core/server/utils/email-send-queue")>();
  return { ...mod, directusRecipientStore: () => h.store, emailQueueSchema: async () => true };
});

let store: MemoryStore;
let clock: ReturnType<typeof fakeClock>;

beforeEach(() => {
  store = new MemoryStore();
  h.store = store;
  clock = fakeClock();
});

describe("progress and completion (F)", () => {
  it("49. counts are derived from rows and never incremented: a settle that lands twice yields the same totals", async () => {
    const { emailId, runKey } = await seedSending(store, 3);
    const [a, b] = store.rowsOf(emailId);
    Object.assign(a!, { status: "claimed" });
    Object.assign(b!, { status: "claimed" });
    const settlement = { sent: [{ id: a!.id, sentAt: "t", messageId: "x" }], failed: [{ id: b!.id, reason: "400: no" }], unknown: [], suppressed: [] };
    await store.settle(settlement);
    const first = await writeCounts(store, emailId, runKey);
    await store.settle(settlement);
    const second = await writeCounts(store, emailId, runKey);
    expect(second).toEqual(first);
    expect(store.email(emailId)).toMatchObject({ total_sent: 1, total_failed: 1, total_unknown: 0, total_suppressed: 0 });
  });

  it("50. done means total_recipients set and no queued or claimed rows", async () => {
    const { emailId, runKey } = await seedSending(store, 2);
    const rows = store.rowsOf(emailId);
    Object.assign(rows[0]!, { status: "sent" });
    Object.assign(rows[1]!, { status: "claimed" });
    expect(await completeSend(store, store.email(emailId), await store.counts(emailId, runKey), clock)).toBe(false);
    expect(store.email(emailId).status).toBe("sending");
    Object.assign(rows[1]!, { status: "sent" });
    expect(await completeSend(store, { ...store.email(emailId), total_recipients: null }, await store.counts(emailId, runKey), clock)).toBe(false);
    expect(await completeSend(store, store.email(emailId), await store.counts(emailId, runKey), clock)).toBe(true);
    expect(store.email(emailId).status).toBe("sent");
  });

  it("51. status is sent with one acceptance and failed with none; legacy counts and send_errors (first 20, by position)", async () => {
    const { emailId, runKey } = await seedSending(store, 25);
    const rows = store.rowsOf(emailId);
    rows.forEach((r, i) => Object.assign(r, i === 0 ? { status: "sent" } : i % 2 ? { status: "failed", error_message: `400: bad ${i}` } : { status: "unknown", error_message: "timeout" }));
    await completeSend(store, store.email(emailId), await store.counts(emailId, runKey), clock);
    const e = store.email(emailId);
    expect(e).toMatchObject({ status: "sent", recipient_count: 25, delivered_count: 1, failed_count: 12, total_unknown: 12, sent_at: new Date(clock.t).toISOString() });
    expect(e.send_errors).toHaveLength(20);
    expect(e.send_errors[0]).toBe("p2@example.com: 400: bad 1");
    expect(e.send_errors[1]).toBe("p3@example.com: timeout");

    store = new MemoryStore();
    const s2 = await seedSending(store, 2);
    for (const r of store.rowsOf(s2.emailId)) Object.assign(r, { status: "failed", error_message: "550" });
    await completeSend(store, store.email(s2.emailId), await store.counts(s2.emailId, s2.runKey), clock);
    expect(store.email(s2.emailId)).toMatchObject({ status: "failed", delivered_count: 0, failed_count: 2 });
  });

  it("52. recurring completion rolls scheduled_at forward and keeps send_run_key", async () => {
    const runKey = "s:2026-11-01T10:00:00.000Z";
    const { emailId } = await seedSending(store, 1, { runKey });
    Object.assign(store.email(emailId), { scheduled_at: "2026-11-01T10:00:00.000Z", recurrence_rule: "monthly" });
    for (const r of store.rowsOf(emailId)) Object.assign(r, { status: "sent" });
    await completeSend(store, store.email(emailId), await store.counts(emailId, runKey), clock);
    expect(store.email(emailId)).toMatchObject({
      status: "scheduled",
      scheduled_at: "2026-12-01T10:00:00.000Z",
      next_run_at: "2026-12-01T10:00:00.000Z",
      send_run_key: runKey,
      last_run_at: new Date(clock.t).toISOString(),
    });
    // …and its progress reads as done for that occurrence.
    expect(deriveProgress(store.email(emailId) as any, await store.counts(emailId, runKey)).phase).toBe("done");
  });
});

describe("the progress route (53)", () => {
  let directus: ReturnType<typeof fakeDirectus>;
  const grant = { org: "org-a" };
  beforeAll(async () => {
    vi.stubGlobal("defineEventHandler", (fn: any) => fn);
    await import("#core/server/api/email/[id]/progress.get");
  }, 120_000);
  beforeEach(() => {
    directus = fakeDirectus(store, { org: {}, members: [] });
    vi.stubGlobal("requireUserSession", async () => ({ user: { id: "u1" } }));
    vi.stubGlobal("getRouterParam", () => "email-1");
    vi.stubGlobal("requireAdminOrManagerGrant", async (_e: unknown, org: string, g: string) => {
      if (org !== grant.org || g !== "communications") throw Object.assign(new Error("403"), { statusCode: 403 });
    });
    vi.stubGlobal("getTypedDirectus", () => directus);
  });
  const route = async () => (await import("#core/server/api/email/[id]/progress.get")).default as any;

  it("53. the progress route is org-gated and derives phase; the three labels' numbers", async () => {
    // 404 for an email that doesn't exist.
    await expect((await route())({})).rejects.toMatchObject({ statusCode: 404 });

    // Preparing: total null, rows so far.
    const { emailId } = await seedSending(store, 4);
    Object.assign(store.email(emailId), { organization: "org-b", total_recipients: null });
    await expect((await route())({})).rejects.toMatchObject({ statusCode: 403 });
    Object.assign(store.email(emailId), { organization: "org-a" });
    let p = await (await route())({});
    expect(p).toMatchObject({ phase: "preparing", rows: 4, total: null });
    expect(progressLabel(p)).toBe("Getting ready · 4 people");

    // Sending: 2 attempted of 4, 1 held back.
    Object.assign(store.email(emailId), { total_recipients: 3 });
    const rows = store.rowsOf(emailId);
    Object.assign(rows[0]!, { status: "sent" });
    Object.assign(rows[1]!, { status: "failed" });
    Object.assign(rows[3]!, { status: "suppressed" });
    p = await (await route())({});
    expect(p).toMatchObject({ phase: "sending", sent: 1, failed: 1, suppressed: 1, queued: 1 });
    expect(progressLabel(p)).toBe("Sending · 2 of 3 · 1 held back");

    // Done.
    Object.assign(rows[2]!, { status: "unknown" });
    Object.assign(store.email(emailId), { status: "sent", send_errors: ["p2@example.com: 400: bad"] });
    p = await (await route())({});
    expect(p).toMatchObject({ phase: "done", errors: [{ address: "p2@example.com", reason: "400: bad" }] });
    expect(progressLabel(p)).toBe("Sent · 1 accepted, 1 failed, 1 unknown");

    Object.assign(store.email(emailId), { status: "failed" });
    expect(progressLabel({ ...(await (await route())({})), sent: 0 })).toBe("Not sent · nobody could be reached");
  });

  it("the detail page's chips name the reason", () => {
    expect(recipientChip({ status: "suppressed", suppressed_reason: "opted_out_mid_send" }).label).toBe("Held back · unsubscribed during send");
    expect(recipientChip({ status: "suppressed", suppressed_reason: "bounced" }).label).toBe("Held back · bounced");
    expect(recipientChip({ status: "unknown" })).toEqual({ label: "Unknown", tone: "warn" });
    expect(recipientChip({ status: "sent", delivery_status: "delivered" }).label).toBe("Delivered");
    expect(recipientChip({ status: "sent" }).label).toBe("Accepted");
    expect(progressLabel({ ...ZERO_COUNTS, phase: "preparing", status: "sending", total: null, rows: 1 })).toBe("Getting ready · 1 person");
  });
});
