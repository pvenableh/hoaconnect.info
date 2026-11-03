/**
 * Auto-pause and Resume (Earnest parity round 3, Phase 4;
 * core/server/utils/email-send-health.ts, core/shared/email/send-health.ts).
 *
 * The properties: the lines (min sample, hard-bounce rate, spam rate); the
 * pause is a conditional write under the send's lease and only the call that
 * moved the row notifies; a paused send is skipped and its rows stay queued;
 * Resume stores a baseline so only new events count; the progress says
 * "Paused · why".
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { deriveProgress, runSendTick, type EmailQueueState } from "#core/server/utils/email-send-queue";
import { checkSendHealth, directusHealthStore, resumeSend, type HealthStore } from "#core/server/utils/email-send-health";
import { pauseSentence, pauseVerdict, readHealthRecord, SEND_HEALTH, type SendEventCounts } from "#core/shared/email/send-health";
import { progressLabel } from "#core/shared/email/send-progress";
import { MemoryStore, fakeClock, fakeSendGrid, seedSending, simpleDeps } from "./support/email-queue-memory";

/** Events per email, and the conditional move against the memory store's rows. */
class MemoryHealth implements HealthStore {
  events = new Map<string, SendEventCounts>();
  moves: Array<{ emailId: string; from: string; moved: boolean }> = [];
  constructor(private store: MemoryStore) {}
  set(emailId: string, c: Partial<SendEventCounts>) {
    this.events.set(emailId, { delivered: 0, hardBounces: 0, spamReports: 0, ...this.events.get(emailId), ...c });
  }
  async eventCounts(emailId: string) {
    return { delivered: 0, hardBounces: 0, spamReports: 0, ...this.events.get(emailId) };
  }
  async moveEmail(emailId: string, from: string, data: Record<string, unknown>) {
    const e = this.store.email(emailId);
    const moved = e.status === from;
    if (moved) Object.assign(e, data);
    this.moves.push({ emailId, from, moved });
    return moved;
  }
}

let store: MemoryStore;
let health: MemoryHealth;
/** Each chunk "takes" 20 s, so a 45 s tick runs two chunks and stops with rows left. */
const slowChunks = () => ({ step: (name: string) => void (name === "rendered" && clock.advance(20_000)) });
let clock: ReturnType<typeof fakeClock>;

beforeEach(() => {
  store = new MemoryStore();
  health = new MemoryHealth(store);
  clock = fakeClock();
});

describe("the lines", () => {
  it.each([
    ["under the minimum sample: never", { delivered: 40, hardBounces: 9, spamReports: 3 }, false, null],
    ["bounces at 8% of outcomes: pause", { delivered: 46, hardBounces: 4, spamReports: 0 }, true, "bounces"],
    ["bounces just under 8%: carry on", { delivered: 47, hardBounces: 4, spamReports: 0 }, false, null],
    ["spam at 0.5% of delivered: pause", { delivered: 200, hardBounces: 0, spamReports: 1 }, true, "spam"],
    ["spam under 0.5%: carry on", { delivered: 201, hardBounces: 0, spamReports: 1 }, false, null],
    ["both over: bounces first", { delivered: 60, hardBounces: 10, spamReports: 5 }, true, "bounces"],
  ] as const)("%s", (_name, counts, pause, reason) => {
    const v = pauseVerdict(counts);
    expect(v.pause).toBe(pause);
    expect(v.reason).toBe(reason);
  });

  it("the sentence names the numbers and the line", () => {
    expect(pauseSentence(pauseVerdict({ delivered: 46, hardBounces: 4, spamReports: 0 }))).toBe(
      "4 of 50 messages bounced (8%; the limit is 8%). Nobody else gets it until you resume the send."
    );
    expect(pauseSentence(pauseVerdict({ delivered: 200, hardBounces: 0, spamReports: 1 }))).toBe(
      "1 person marked it as spam (0.5% of 200 delivered; the limit is 0.5%). Nobody else gets it until you resume the send."
    );
    expect(SEND_HEALTH).toEqual({ minOutcomes: 50, hardBounceRate: 0.08, spamRate: 0.005 });
  });
});

describe("pause: a conditional write under the lease; one notification", () => {
  it("over a line: sending → paused, the record in send_errors, the rows stay queued, one notification", async () => {
    const { emailId, runKey } = await seedSending(store, 120);
    health.set(emailId, { delivered: 50, hardBounces: 10 });
    const notify = vi.fn(async () => {});
    const r = await checkSendHealth(store, health, emailId, { worker: "cron", clock, notify });
    expect(r).toMatchObject({ checked: true, paused: true });
    const e = store.email(emailId);
    expect(e.status).toBe("paused");
    expect(readHealthRecord(e.send_errors, runKey)).toMatchObject({ state: "paused", reason: "bounces", runKey, counts: { hardBounces: 10 } });
    expect(store.rowsOf(emailId).every((row) => row.status === "queued")).toBe(true);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith({ emailId, reason: "bounces", sentence: expect.stringContaining("10 of 60 messages bounced") });
    expect(await store.readLease(emailId)).toBeNull();
  });

  it("the call whose write didn't move the row (someone else paused it first) does not notify", async () => {
    const { emailId } = await seedSending(store, 120);
    health.set(emailId, { delivered: 50, hardBounces: 10 });
    // Another writer moves the row between this call's read and its write.
    const realMove = health.moveEmail.bind(health);
    health.moveEmail = async (id, from, data) => {
      store.email(id).status = "paused";
      return realMove(id, from, data);
    };
    const notify = vi.fn(async () => {});
    const r = await checkSendHealth(store, health, emailId, { worker: "cron", clock, notify });
    expect(r.paused).toBe(false);
    expect(notify).not.toHaveBeenCalled();
  });

  it("a run holding the lease: the check waits for another tick (no read, no write)", async () => {
    const { emailId } = await seedSending(store, 120);
    health.set(emailId, { delivered: 50, hardBounces: 10 });
    await store.insertLease({ email: emailId, token: "held", purpose: "send", worker: "inline", started_at: new Date(clock.now()).toISOString() });
    const notify = vi.fn(async () => {});
    expect(await checkSendHealth(store, health, emailId, { worker: "cron", clock, notify })).toMatchObject({ checked: false, paused: false });
    expect(store.email(emailId).status).toBe("sending");
    expect(health.moves).toHaveLength(0);
  });

  it("three ticks over the line: one pause, one notification", async () => {
    const { emailId } = await seedSending(store, 300);
    health.set(emailId, { delivered: 50, hardBounces: 10 });
    const sg = fakeSendGrid();
    const notify = vi.fn(async () => {});
    for (let i = 0; i < 3; i++) {
      await runSendTick({
        store,
        worker: "cron",
        budgetMs: 45_000,
        clock,
        hooks: slowChunks(),
        depsFor: () => simpleDeps(sg),
        checkHealth: async (email: EmailQueueState) => (await checkSendHealth(store, health, email.id, { worker: "cron", clock, notify })).paused,
      });
      clock.advance(60_000);
    }
    expect(store.email(emailId).status).toBe("paused");
    expect(notify).toHaveBeenCalledTimes(1);
    expect(health.moves.filter((m) => m.moved)).toHaveLength(1);
  });

  it("a send under the lines is checked and left sending; a finished one is never checked", async () => {
    const { emailId } = await seedSending(store, 300);
    health.set(emailId, { delivered: 80, hardBounces: 2 });
    const sg = fakeSendGrid();
    const checked: string[] = [];
    const out = await runSendTick({
      store,
      worker: "cron",
      budgetMs: 45_000,
      clock,
      hooks: slowChunks(),
      depsFor: () => simpleDeps(sg),
      checkHealth: async (email: EmailQueueState) => {
        checked.push(email.id);
        return (await checkSendHealth(store, health, email.id, { worker: "cron", clock })).paused;
      },
    });
    expect(out.paused).toBe(0);
    expect(store.email(emailId).status).toBe("sending");
    expect(checked).toEqual([emailId]);

    // A small send that finishes in its run is complete, not checked.
    const small = await seedSending(store, 3, { emailId: "email-2", startedAt: "2026-11-03T11:00:00.000Z" });
    checked.length = 0;
    clock.advance(60_000);
    await runSendTick({ store, worker: "cron", budgetMs: 45_000, clock, depsFor: () => simpleDeps(sg), checkHealth: async (e) => (checked.push(e.id), false) });
    expect(store.email(small.emailId).status).toBe("sent");
    expect(checked).not.toContain(small.emailId);
  });
});

describe("skip while paused", () => {
  it("a paused send is not run: its rows stay queued and nothing is delivered", async () => {
    const { emailId } = await seedSending(store, 20);
    store.email(emailId).status = "paused";
    const sg = fakeSendGrid();
    const out = await runSendTick({ store, worker: "cron", budgetMs: 45_000, clock, depsFor: () => simpleDeps(sg) });
    expect(out.runs).toHaveLength(0);
    expect(sg.accepted).toHaveLength(0);
    expect(store.rowsOf(emailId).every((r) => r.status === "queued")).toBe(true);
  });
});

describe("resume: the baseline", () => {
  it("paused → sending; the counts at Resume become the baseline; old events never re-pause it", async () => {
    const { emailId, runKey } = await seedSending(store, 300);
    health.set(emailId, { delivered: 50, hardBounces: 10 });
    await checkSendHealth(store, health, emailId, { worker: "cron", clock });
    expect(store.email(emailId).status).toBe("paused");

    expect(await resumeSend(store, health, emailId, clock)).toBe("resumed");
    const e = store.email(emailId);
    expect(e.status).toBe("sending");
    expect(readHealthRecord(e.send_errors, runKey)).toMatchObject({ state: "resumed", reason: "bounces", baseline: { delivered: 50, hardBounces: 10 } });

    // The same 10 bounces plus a few healthy deliveries: judged from the baseline, under the minimum sample.
    health.set(emailId, { delivered: 80 });
    const again = await checkSendHealth(store, health, emailId, { worker: "cron", clock });
    expect(again.paused).toBe(false);
    expect(again.verdict).toMatchObject({ outcomes: 30, counts: { delivered: 30, hardBounces: 0 } });

    // New bounces past the line after Resume pause it again.
    health.set(emailId, { delivered: 100, hardBounces: 16 });
    expect((await checkSendHealth(store, health, emailId, { worker: "cron", clock })).paused).toBe(true);
  });

  it("not paused → not_paused; a held lease → busy", async () => {
    const { emailId } = await seedSending(store, 10);
    expect(await resumeSend(store, health, emailId, clock)).toBe("not_paused");
    store.email(emailId).status = "paused";
    await store.insertLease({ email: emailId, token: "held", purpose: "send", worker: "cron", started_at: new Date(clock.now()).toISOString() });
    expect(await resumeSend(store, health, emailId, clock)).toBe("busy");
  });

  it("a record from an earlier occurrence is ignored", () => {
    const rec = { health: { state: "resumed", reason: "bounces", at: "t", runKey: "s:old", counts: { delivered: 1, hardBounces: 0, spamReports: 0 } } };
    expect(readHealthRecord(rec, "s:new")).toBeNull();
    expect(readHealthRecord(rec, "s:old")).not.toBeNull();
    expect(readHealthRecord(["a@x: failed"], "s:old")).toBeNull();
  });
});

describe("progress: Paused · why", () => {
  it("the paused phase, its label and its sentence", async () => {
    const { emailId, runKey } = await seedSending(store, 120);
    health.set(emailId, { delivered: 200, spamReports: 2 });
    await checkSendHealth(store, health, emailId, { worker: "cron", clock });
    const p = deriveProgress(store.email(emailId), await store.counts(emailId, runKey));
    expect(p.phase).toBe("paused");
    expect(p.paused).toMatchObject({ reason: "spam", sentence: expect.stringContaining("2 people marked it as spam") });
    expect(p.errors).toEqual([]);
    expect(progressLabel(p)).toBe("Paused · spam complaints");
  });
});

describe("the Directus health store", () => {
  it("counts the occurrence's events through the recipient row, hard bounces only, and moves by (id, status)", async () => {
    const calls: any[] = [];
    const directus = {
      request: async (op: any) => {
        calls.push(op);
        if (op.op === "aggregate") return [{ count: { id: "3" } }];
        if (op.op === "updateItems") return [{ id: "e1" }];
        return null;
      },
    };
    vi.doMock("@directus/sdk", async () => (await import("./support/email-queue-memory")).sdkDescriptors);
    vi.resetModules();
    const mod = await import("#core/server/utils/email-send-health");
    const hs = mod.directusHealthStore(directus);
    expect(await hs.eventCounts("e1", "m:k")).toEqual({ delivered: 3, hardBounces: 3, spamReports: 3 });
    const filters = calls.map((c) => JSON.stringify(c.options.query.filter));
    for (const f of filters) expect(f).toContain('{"email_recipient":{"email":{"_eq":"e1"},"run_key":{"_eq":"m:k"}}}');
    expect(filters[1]).toContain('"bounce_type":{"_neq":"blocked"}');
    expect(filters[1]).toContain('"reason":{"_icontains":"bounced address"}');
    expect(filters[2]).toContain('"_in":["spamreport","spam_report"]');
    // Before the script has added bounce_type: every bounce counts, and no filter names the field.
    calls.length = 0;
    await mod.directusHealthStore(directus, { bounceTypes: false }).eventCounts("e1", "m:k");
    expect(JSON.stringify(calls)).not.toContain("bounce_type");
    expect(await hs.moveEmail("e1", "sending", { status: "paused" })).toBe(true);
    expect(calls.at(-1)).toMatchObject({ op: "updateItems", collection: "hoa_emails", keysOrQuery: { filter: { id: { _eq: "e1" }, status: { _eq: "sending" } } } });
    vi.doUnmock("@directus/sdk");
    void directusHealthStore;
  });
});
