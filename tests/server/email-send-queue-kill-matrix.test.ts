/**
 * Kill at every step (docs/spec-email-send-queue.md §10, group I).
 *
 * A Vercel function is not "thrown out of" — it is frozen: no `finally`, no
 * catch, no cleanup. So a kill here is a hang: at the chosen step the run
 * awaits a promise that never settles and is abandoned, exactly as a killed
 * function's state is. The harness then advances the clock past STALE_MS (and
 * PREPARE_STALE_MS) and runs ticks with a fresh SendGrid until the send is
 * done, and asserts the one property:
 *
 *   · every address in the fake SendGrid's acceptance log appears at most once;
 *   · no row is left queued or claimed;
 *   · rows accepted before the kill are sent or unknown, never failed;
 *   · the email's totals equal the aggregate of its rows.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { queueRowPatch, runSendTick, refreshTotals, type Hooks, type QueueRow } from "#core/server/utils/email-send-queue";
import { PREPARE_STALE_MS, TICK_BUDGET_MS } from "#core/server/utils/email-send-constants";
import { planRows, writeSnapshot } from "#core/server/utils/email-send-enqueue";
import { MemoryStore, fakeClock, simpleDeps } from "./support/email-queue-memory";

const N = 130; // two chunks
const EMAIL = "email-k";
const RUN_KEY = "m:2026-11-03T12:00:00.000Z";
const ENQUEUE_STEPS = new Set(["snapshot-batch-written", "total-set"]);
const STEPS = [
  "lease-acquired",
  "snapshot-batch-written",
  "total-set",
  "expire-done",
  "queued-read",
  "rendered",
  "claim-written",
  "claim-read-back",
  "recheck-done",
  "first-deliver-accepted",
  "mid-chunk (37 of 100)",
  "settle-written",
  "counts-written",
  "lease-released",
  "completion-written",
] as const;

const never = () => new Promise<never>(() => {});

/** A SendGrid shared across runs (one acceptance log), with a per-run kill. */
function sendGrid() {
  const accepted: string[] = [];
  const run = (killAfter: number | null, onKill: () => void) => {
    let dead = false;
    let mine = 0;
    return {
      acceptedHere: [] as string[],
      async deliver(this: { acceptedHere: string[] }, msg: { to: string }) {
        if (dead) return never();
        accepted.push(msg.to);
        this.acceptedHere.push(msg.to);
        mine++;
        if (killAfter !== null && mine >= killAfter) {
          dead = true; // the 202 came back; the function froze before it was settled
          onKill();
          return never();
        }
        return { messageId: `sg-${accepted.length}` };
      },
    };
  };
  return { accepted, run };
}

function seed(store: MemoryStore) {
  store.addEmail({ id: EMAIL, status: "draft" });
  const recipients = Array.from({ length: N }, (_, i) => {
    const id = `m-${i + 1}`;
    store.addMember({ id, email: `r${i + 1}@example.com`, unsubscribe_token: `t${i + 1}` });
    return { id, first_name: `R${i + 1}`, email: `r${i + 1}@example.com` };
  });
  return planRows({
    emailId: EMAIL,
    runKey: RUN_KEY,
    recipients,
    suppressed: [],
    ccEmails: [],
    bccEmails: [],
    threshold: 5,
    merge: (m) => ({ first_name: String(m.first_name) }),
  });
}

async function scenario(step: (typeof STEPS)[number]) {
  const store = new MemoryStore();
  const clock = fakeClock();
  const sg = sendGrid();
  const plan = seed(store);

  let killed = false;
  let signal!: () => void;
  const killedNow = new Promise<"killed">((r) => (signal = () => r("killed")));
  const kill = () => {
    killed = true;
    signal();
  };
  const hookAt = (target: string): Hooks => ({
    step: (name) => {
      if (!killed && name === target) {
        kill();
        return never();
      }
    },
  });

  // ── enqueue (killed here for the two snapshot steps) ──
  const enqueue = writeSnapshot(store, {
    emailId: EMAIL,
    runKey: RUN_KEY,
    rows: plan.rows,
    total: plan.total,
    suppressedCount: plan.suppressedCount,
    worker: "inline",
    clock,
    expect: (s) => s !== "sending",
    restoreStatus: "draft",
    batchSize: 50,
    hooks: ENQUEUE_STEPS.has(step) ? hookAt(step) : undefined,
  });
  await Promise.race([enqueue, killedNow]);

  // ── the first tick (killed at a run step) ──
  let firstRun: ReturnType<ReturnType<typeof sendGrid>["run"]> | null = null;
  if (!killed) {
    const killAfter = step === "first-deliver-accepted" ? 1 : step.startsWith("mid-chunk") ? 37 : null;
    firstRun = sg.run(killAfter, kill);
    const deps = simpleDeps({ deliver: firstRun.deliver.bind(firstRun) } as any);
    const tick = runSendTick({
      store,
      worker: "cron",
      budgetMs: TICK_BUDGET_MS,
      clock,
      hooks: ENQUEUE_STEPS.has(step) || killAfter !== null ? undefined : hookAt(step),
      depsFor: () => ({ load: deps.load, deliver: deps.deliver }),
    });
    await Promise.race([tick, killedNow]);
  }
  const acceptedBeforeKill = [...(firstRun?.acceptedHere ?? [])];

  // ── recovery: later ticks, clock past every stale window ──
  for (let i = 0; i < 6 && store.email(EMAIL).status === "sending"; i++) {
    clock.advance(PREPARE_STALE_MS + 1);
    const r = sg.run(null, () => {});
    const deps = simpleDeps({ deliver: r.deliver.bind(r) } as any);
    await runSendTick({ store, worker: "cron", budgetMs: TICK_BUDGET_MS, clock, depsFor: () => ({ load: deps.load, deliver: deps.deliver }) });
  }

  return { store, sg, killed, acceptedBeforeKill };
}

function assertTheProperty(r: Awaited<ReturnType<typeof scenario>>) {
  const { store, sg, acceptedBeforeKill } = r;
  // 1. at most once
  const seen = new Map<string, number>();
  for (const a of sg.accepted) seen.set(a, (seen.get(a) ?? 0) + 1);
  expect([...seen.entries()].filter(([, n]) => n > 1)).toEqual([]);
  // 2. nothing left queued or claimed
  const rows = store.rowsOf(EMAIL);
  expect(rows.filter((x) => x.status === "queued" || x.status === "claimed")).toEqual([]);
  // 3. accepted before the kill → sent or unknown, never failed
  const byAddress = new Map(rows.map((x) => [x.recipient_email, x] as const));
  for (const a of acceptedBeforeKill) expect(["sent", "unknown"]).toContain(byAddress.get(a)?.status);
  // 4. the totals are the aggregate
  const email = store.email(EMAIL);
  const agg = { sent: 0, failed: 0, unknown: 0, suppressed: 0 };
  for (const x of rows) if (x.status in agg) agg[x.status as keyof typeof agg]++;
  expect(["sent", "failed"]).toContain(email.status);
  expect({
    sent: email.total_sent ?? 0,
    failed: email.total_failed ?? 0,
    unknown: email.total_unknown ?? 0,
    suppressed: email.total_suppressed ?? 0,
  }).toEqual(agg);
  // Every accepted address is a sent/unknown row (nothing accepted is unaccounted for).
  for (const a of sg.accepted) expect(["sent", "unknown"]).toContain(byAddress.get(a)?.status);
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("the kill matrix (I)", () => {
  it.each(STEPS)("60. kill at %s: no address is accepted twice and every row ends terminal", async (step) => {
    const r = await scenario(step);
    expect(r.killed).toBe(true);
    assertTheProperty(r);
  });

  it("60 (control): no kill — everyone is accepted exactly once and the send is sent", async () => {
    const store = new MemoryStore();
    const clock = fakeClock();
    const sg = sendGrid();
    const plan = seed(store);
    await writeSnapshot(store, {
      emailId: EMAIL, runKey: RUN_KEY, rows: plan.rows, total: plan.total, suppressedCount: 0,
      worker: "inline", clock, expect: () => true, restoreStatus: "draft",
    });
    const r = sg.run(null, () => {});
    const deps = simpleDeps({ deliver: r.deliver.bind(r) } as any);
    await runSendTick({ store, worker: "cron", budgetMs: TICK_BUDGET_MS, clock, depsFor: () => ({ load: deps.load, deliver: deps.deliver }) });
    expect(sg.accepted).toHaveLength(N);
    expect(store.email(EMAIL)).toMatchObject({ status: "sent", total_sent: N, total_unknown: 0, delivered_count: N, recipient_count: N });
  });

  it("61. kill mid-chunk, then webhook events: unknown rows become sent and the totals follow", async () => {
    const r = await scenario("mid-chunk (37 of 100)");
    const { store } = r;
    const before = { ...store.email(EMAIL) };
    expect(before.total_unknown).toBeGreaterThanOrEqual(37);

    // SendGrid's `processed` event for each message it accepted before the kill.
    const rows = store.rowsOf(EMAIL);
    for (const address of r.acceptedBeforeKill) {
      const row = rows.find((x) => x.recipient_email === address) as QueueRow;
      const patch = queueRowPatch(row, { event: "processed", timestamp: 1_793_000_000 }, `sg-${address}`);
      if (patch) Object.assign(store.rows.get(row.id)!, patch);
    }
    await refreshTotals(store, EMAIL);

    const after = store.email(EMAIL);
    const promoted = r.acceptedBeforeKill.map((a) => store.rowsOf(EMAIL).find((x) => x.recipient_email === a)!);
    expect(promoted.every((x) => x.status === "sent")).toBe(true);
    // Claimed-but-never-handed-over rows of the dead chunk stay unknown: no event will come.
    expect(after.total_unknown).toBe(before.total_unknown! - 37);
    expect(after.total_sent).toBe(before.total_sent! + 37);
    expect(after.total_sent).toBe(r.sg.accepted.length);
    expect(after).toMatchObject({ status: "sent", delivered_count: after.total_sent });
  });
});
