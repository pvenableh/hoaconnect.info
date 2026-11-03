/**
 * The email send queue (Earnest parity round 3, Phase 3b) — Earnest's
 * `newsletter-batch.ts` ported to docs/spec-email-send-queue.md. Read the spec
 * before changing anything here; it decides, this implements.
 *
 * The one property: no resident is ever sent the same organization email twice,
 * whatever kills the function and whenever. "At most once" means precisely: for
 * every row, `deliver()` is called at most once across all runs, ever.
 *
 *   enqueue   (email-send-enqueue.ts) one `queued` row per person, total last
 *   run       lease → expire → load → loop { read queued → render → claim →
 *             recheck → deliver → settle → derive counts } → completion
 *   webhook   (activity.post.ts) promotes claimed/unknown → sent on any event
 *
 * Why a lease: Directus filter-updates are read-then-write (updateByQuery
 * selects keys, then updates by key), so two overlapping runs could both claim
 * the same rows. The one atomic primitive is a unique index on insert, so the
 * mutex is a `hoa_email_send_leases` row with `email` unique (§3.1). Under the
 * lease, Earnest's claim and settle writes are safe as written.
 *
 * Everything takes a `RecipientStore`, so the state machine runs against an
 * in-memory store in the tests (including the kill matrix) and against
 * `directusRecipientStore()` in production.
 */

import { randomUUID } from "node:crypto";
import * as sdk from "@directus/sdk";
import { suppressionReason, type EmailClass } from "#core/shared/email/email-class";
import { readHealthRecord, type PauseReason } from "#core/shared/email/send-health";
import { computeNextRun } from "#core/shared/email/recurrence";
import {
  CHUNK,
  CHUNK_RESERVE_MS,
  CONCURRENCY,
  PREPARE_STALE_MS,
  SEND_ERRORS_MAX,
  STALE_MS,
} from "./email-send-constants";

// ── Types ───────────────────────────────────────────────────────────────────

export type RowStatus = "queued" | "claimed" | "sent" | "failed" | "suppressed" | "unknown";
export type SuppressedReason = "bounced" | "opted_out" | "bounced_mid_send" | "opted_out_mid_send";
export type Worker = "inline" | "cron" | "manual";

export interface Copies {
  cc: string[];
  bcc: string[];
}

export interface QueueRow {
  id: string;
  email: string;
  run_key: string;
  kind: "member" | "copy";
  position: number;
  dedupe_key: string;
  member: string | null;
  recipient_email: string | null;
  recipient_name: string | null;
  status: RowStatus;
  claim: string | null;
  claimed_at: string | null;
  member_fields: Record<string, string> | null;
  copies: Copies | null;
  suppressed_reason?: SuppressedReason | null;
  sent_at?: string | null;
  sg_message_id?: string | null;
  error_message?: string | null;
  delivery_status?: "delivered" | "bounced" | null;
}

export type NewRow = Omit<QueueRow, "id" | "claim" | "claimed_at">;

export interface StatusCounts {
  queued: number;
  claimed: number;
  sent: number;
  failed: number;
  suppressed: number;
  unknown: number;
}

export interface Lease {
  id: string;
  email: string;
  token: string;
  purpose: "prepare" | "send";
  worker: Worker;
  started_at: string;
}

/** The `hoa_emails` fields the queue reads. */
export interface EmailQueueState {
  id: string;
  status: string | null;
  send_run_key: string | null;
  total_recipients: number | null;
  send_started_at: string | null;
  send_finished_at: string | null;
  sent_at?: string | null;
  scheduled_at?: string | null;
  recurrence_rule?: string | null;
  send_last_error?: string | null;
  /** The failure list at completion; `{ health }` while paused or resumed (email-send-health.ts). */
  send_errors?: unknown;
}

/** The recheck read: the member as they are now. */
export interface LiveMember {
  id: string;
  email?: string | null;
  email_bounced?: boolean | null;
  email_community_opt_out?: boolean | null;
  unsubscribe_token?: string | null;
}

export interface Settlement {
  sent: Array<{ id: string; sentAt: string; messageId: string | null }>;
  failed: Array<{ id: string; reason: string }>;
  unknown: Array<{ id: string; reason: string }>;
  suppressed: Array<{ id: string; reason: SuppressedReason }>;
}

export interface RecipientStore {
  /** Throws a RECORD_NOT_UNIQUE error when the email already has a lease. */
  insertLease(lease: Omit<Lease, "id">): Promise<Lease>;
  readLease(emailId: string): Promise<Lease | null>;
  /** By id AND token: a lease the caller no longer holds is never deleted. */
  deleteLease(lease: Pick<Lease, "id" | "token">): Promise<void>;

  /** One batch, one transaction: all rows or none (RECORD_NOT_UNIQUE on a dedupe collision). */
  createRows(rows: NewRow[]): Promise<void>;
  deleteRows(emailId: string, runKey: string): Promise<void>;
  queued(emailId: string, runKey: string, limit: number): Promise<QueueRow[]>;
  /** Filter-update on queued ids, then a read-back by token. */
  claim(emailId: string, runKey: string, ids: string[], token: string, at: string): Promise<QueueRow[]>;
  /** Back to queued — only rows this token claimed; `ids` narrows it to some of them. */
  release(emailId: string, runKey: string, token: string, ids?: string[]): Promise<void>;
  /** Claimed rows older than the cutoff → unknown. Returns how many. */
  expire(emailId: string, runKey: string, cutoff: string, message: string): Promise<number>;
  settle(s: Settlement): Promise<void>;
  counts(emailId: string, runKey: string): Promise<StatusCounts>;
  /** failed + unknown rows by position, for `send_errors`. */
  failures(
    emailId: string,
    runKey: string,
    limit: number
  ): Promise<Array<{ recipient_email: string | null; error_message: string | null; status: string }>>;

  readEmail(emailId: string): Promise<EmailQueueState | null>;
  updateEmail(emailId: string, data: Record<string, unknown>): Promise<void>;
  /** Every `sending` email, oldest send_started_at first. */
  sendingEmails(): Promise<EmailQueueState[]>;
  liveMembers(ids: string[]): Promise<LiveMember[]>;
  /**
   * Phase 4: the zone a recurring email repeats in (`recurrence_timezone`).
   * Null before the field exists, or when it can't be read: the roll-forward
   * is then on UTC, as it was before.
   */
  recurrenceTimeZone?(emailId: string): Promise<string | null>;
}

// ── Errors and small helpers ────────────────────────────────────────────────

export const EXPIRED_MESSAGE = "Its run stopped mid-send; not retried, so nobody gets it twice.";
export const PREPARE_CLOSED_MESSAGE = "Stopped while getting ready — nobody was sent this. Send it again.";
export const MEMBER_GONE_MESSAGE = "Member removed before this was sent";

/** A run that cannot start sending (no postal address, an attachment that won't load). The rows wait. */
export class RunParked extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RunParked";
  }
}

/** Another run holds this email's lease (409 `send_in_progress` at enqueue). */
export class SendInProgress extends Error {
  readonly statusCode = 409;
  readonly code = "send_in_progress";
  constructor(message = "This email is already being sent.") {
    super(message);
    this.name = "SendInProgress";
  }
}

export function isNotUnique(e: unknown): boolean {
  const errs = (e as { errors?: Array<{ extensions?: { code?: string } }> })?.errors;
  if (Array.isArray(errs) && errs.some((x) => x?.extensions?.code === "RECORD_NOT_UNIQUE")) return true;
  return (e as { code?: string })?.code === "RECORD_NOT_UNIQUE";
}

/** Directus busy or unreachable: worth a retry, and never a reason to drop work. */
export function isBusy(e: unknown): boolean {
  const err = e as {
    response?: { status?: number };
    status?: number;
    statusCode?: number;
    errors?: Array<{ extensions?: { code?: string } }>;
    message?: string;
    cause?: { code?: string };
  };
  const status = err?.response?.status ?? err?.status ?? err?.statusCode;
  if (status === 503 || status === 502 || status === 504 || status === 429) return true;
  if (err?.errors?.some((x) => x?.extensions?.code === "SERVICE_UNAVAILABLE")) return true;
  if (/fetch failed|ECONNRESET|ETIMEDOUT|ECONNREFUSED|socket hang up/i.test(String(err?.message || ""))) return true;
  return ["ECONNRESET", "ETIMEDOUT", "ECONNREFUSED"].includes(String(err?.cause?.code || ""));
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Earnest's retryBusy: two more tries at 1 s and 2 s, only for a busy Directus. */
export async function retryBusy<T>(fn: () => Promise<T>, sleep: (ms: number) => Promise<void> = defaultSleep): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (attempt >= 2 || !isBusy(e)) throw e;
      await sleep(1000 * (attempt + 1));
    }
  }
}

export const ZERO_COUNTS: StatusCounts = { queued: 0, claimed: 0, sent: 0, failed: 0, suppressed: 0, unknown: 0 };

/** A run_key: `m:<enqueue time>` for a manual send, `s:<scheduled_at>` for a scheduled occurrence. */
export function manualRunKey(now: number): string {
  return `m:${new Date(now).toISOString()}`;
}
export function scheduledRunKey(scheduledAt: string | null | undefined, now: number): string {
  const t = scheduledAt ? new Date(scheduledAt) : new Date(now);
  return `s:${(Number.isNaN(t.getTime()) ? new Date(now) : t).toISOString()}`;
}

/** Recurrence (Phase 4: core/shared/email/recurrence.ts), re-exported where completion uses it. */
export { computeNextRun };

// ── Lease ───────────────────────────────────────────────────────────────────

export interface Clock {
  now: () => number;
  sleep?: (ms: number) => Promise<void>;
}

/** A named point in a run or an enqueue; the kill-matrix test hangs a run at one. */
export type Hooks = { step?: (name: string) => void | Promise<void> };

/**
 * Insert a lease row for this email. Exactly one of two racing inserts wins
 * (the unique index); the loser gets null. A lease older than STALE_MS belongs
 * to a dead run: it is deleted by id and replaced — two breakers both delete
 * (the second is a no-op) and both insert, and the index lets one through.
 */
export async function acquireLease(
  store: RecipientStore,
  emailId: string,
  purpose: Lease["purpose"],
  worker: Worker,
  clock: Clock,
  hooks?: Hooks
): Promise<Lease | null> {
  const attempt = async (): Promise<Lease | null> => {
    try {
      return await store.insertLease({
        email: emailId,
        token: randomUUID(),
        purpose,
        worker,
        started_at: new Date(clock.now()).toISOString(),
      });
    } catch (e) {
      if (isNotUnique(e)) return null;
      throw e;
    }
  };
  let lease = await attempt();
  if (!lease) {
    const held = await store.readLease(emailId);
    if (!held) {
      // Released between our insert and our read: one more try, then busy.
      lease = await attempt();
    } else if (Date.parse(held.started_at) < clock.now() - STALE_MS) {
      await store.deleteLease(held);
      lease = await attempt();
    }
  }
  if (lease) await hooks?.step?.("lease-acquired");
  return lease;
}

export async function releaseLease(store: RecipientStore, lease: Lease, hooks?: Hooks): Promise<void> {
  await store.deleteLease(lease);
  await hooks?.step?.("lease-released");
}

// ── Delivery ────────────────────────────────────────────────────────────────

export type DeliverOutcome =
  | { kind: "sent"; messageId: string | null; at: number }
  | { kind: "failed"; reason: string }
  | { kind: "unknown"; reason: string }
  | { kind: "rate_limited" };

/** The HTTP status of a SendGrid error, or null for a network error / timeout. */
function httpStatus(e: unknown): number | null {
  const err = e as { code?: unknown; response?: { status?: unknown; statusCode?: unknown } };
  if (typeof err?.code === "number") return err.code;
  const s = err?.response?.status ?? err?.response?.statusCode;
  return typeof s === "number" ? s : null;
}

function errorDetail(e: unknown): string {
  const err = e as { message?: string; response?: { body?: { errors?: Array<{ message?: string }> } } };
  return err?.response?.body?.errors?.[0]?.message || err?.message || "Failed to send";
}

/**
 * One row's delivery. 202 → sent. 429 and 5xx are retried (×3, 1 s and 2 s
 * apart) on SendGrid's contract that they mean "not processed"; other 4xx
 * fail at once. A network error or timeout is never retried — the message may
 * have gone — and settles `unknown`.
 */
export async function deliverOnce<M>(
  msg: M,
  deliver: (msg: M) => Promise<{ messageId: string | null }>,
  clock: Clock
): Promise<DeliverOutcome> {
  const sleep = clock.sleep ?? defaultSleep;
  for (let attempt = 1; ; attempt++) {
    try {
      const r = await deliver(msg);
      return { kind: "sent", messageId: r?.messageId ?? null, at: clock.now() };
    } catch (e) {
      const status = httpStatus(e);
      if (status == null) return { kind: "unknown", reason: errorDetail(e) };
      const retryable = status === 429 || status >= 500;
      if (retryable && attempt < 3) {
        await sleep(1000 * attempt);
        continue;
      }
      if (status === 429) return { kind: "rate_limited" };
      return { kind: "failed", reason: `${status}: ${errorDetail(e)}` };
    }
  }
}

// ── The run ─────────────────────────────────────────────────────────────────

/**
 * Built once per run, before the first claim (§6.2, §8.2–8.3): the org read
 * fresh with `checkSendCompliance`, attachments and CID images loaded. Throw
 * `RunParked` to stop before any claim with `send_last_error` set.
 */
export interface RunContext<D, M> {
  emailClass: EmailClass;
  /** Render rows before claiming. A throw leaves them queued; `fail` settles that row failed. */
  prepare(rows: QueueRow[]): Promise<Map<string, { draft: D } | { fail: string }>>;
  /** The final message for one row: the per-recipient compliance from the live token. */
  finalize(row: QueueRow, draft: D, live: LiveMember | null): M;
}

export interface RunDeps<D, M> {
  load: () => Promise<RunContext<D, M>>;
  deliver: (msg: M) => Promise<{ messageId: string | null }>;
}

export type RunStop = "done" | "busy" | "budget" | "rate_limited" | "stalled" | "parked" | "not_ready";

export interface RunResult {
  emailId: string;
  stopped: RunStop;
  sent: number;
  failed: number;
  unknown: number;
  suppressed: number;
  requeued: number;
  expired: number;
  completed: boolean;
  error?: string;
}

export interface RunOptions<D, M> extends RunDeps<D, M> {
  store: RecipientStore;
  emailId: string;
  worker: Worker;
  /** Time this run may spend before it stops claiming. */
  budgetMs: number;
  clock: Clock;
  hooks?: Hooks;
}

/**
 * One run over one send, holding its lease (§3.2). Claims stop at the budget;
 * a claimed chunk is always delivered and settled.
 */
export async function runBatch<D, M>(opts: RunOptions<D, M>): Promise<RunResult> {
  const { store, emailId, clock, hooks } = opts;
  const step = async (name: string) => {
    await hooks?.step?.(name);
  };
  const t0 = clock.now();
  const result: RunResult = {
    emailId,
    stopped: "done",
    sent: 0,
    failed: 0,
    unknown: 0,
    suppressed: 0,
    requeued: 0,
    expired: 0,
    completed: false,
  };

  const lease = await acquireLease(store, emailId, "send", opts.worker, clock, hooks);
  if (!lease) return { ...result, stopped: "busy" };

  try {
    const email = await store.readEmail(emailId);
    if (!email || email.status !== "sending" || email.total_recipients == null || !email.send_run_key) {
      result.stopped = "not_ready";
      return result;
    }
    const runKey = email.send_run_key;

    // Rows of a dead run: may have gone, never resent (§3.4, §4.2).
    result.expired = await store.expire(
      emailId,
      runKey,
      new Date(clock.now() - STALE_MS).toISOString(),
      EXPIRED_MESSAGE
    );
    await step("expire-done");

    let counts = await store.counts(emailId, runKey);
    if (counts.queued + counts.claimed === 0) {
      result.completed = await completeSend(store, email, counts, clock, hooks);
      return result;
    }

    let ctx: RunContext<D, M>;
    try {
      ctx = await opts.load();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      result.stopped = e instanceof RunParked ? "parked" : isBusy(e) ? "stalled" : "parked";
      result.error = message;
      await store.updateEmail(emailId, { send_last_error: message }).catch(() => {});
      return result;
    }

    for (;;) {
      // Not enough left to finish a chunk inside the hard stop: stop claiming.
      if (opts.budgetMs - (clock.now() - t0) < CHUNK_RESERVE_MS) {
        result.stopped = "budget";
        break;
      }

      const rows = await store.queued(emailId, runKey, CHUNK);
      await step("queued-read");
      if (!rows.length) break;

      // Render before claiming: a run killed here leaves the rows queued.
      const prepared = await ctx.prepare(rows);
      await step("rendered");

      const token = lease.token;
      const claimed = await store.claim(
        emailId,
        runKey,
        rows.map((r) => r.id),
        token,
        new Date(clock.now()).toISOString()
      );
      await step("claim-written");

      const settlement: Settlement = { sent: [], failed: [], unknown: [], suppressed: [] };
      const toDeliver: Array<{ row: QueueRow; msg: M }> = [];
      let delivering = false;
      let rateLimited = false;
      const notHanded: string[] = [];

      try {
        await step("claim-read-back");
        // The recheck: one live read per chunk, after the claim (§6.2).
        const memberIds = claimed.filter((r) => r.kind === "member" && r.member).map((r) => r.member as string);
        const live = memberIds.length ? await store.liveMembers(memberIds) : [];
        const liveById = new Map(live.map((m) => [m.id, m]));
        await step("recheck-done");

        for (const row of claimed) {
          const p = prepared.get(row.id);
          if (!p) {
            // Not in this chunk's render (it was claimed by nobody else — under the
            // lease this can't happen); leave it for the next read.
            notHanded.push(row.id);
            continue;
          }
          if ("fail" in p) {
            settlement.failed.push({ id: row.id, reason: p.fail });
            continue;
          }
          let liveMember: LiveMember | null = null;
          if (row.kind === "member") {
            liveMember = row.member ? liveById.get(row.member) ?? null : null;
            if (!liveMember) {
              settlement.failed.push({ id: row.id, reason: MEMBER_GONE_MESSAGE });
              continue;
            }
            const reason = suppressionReason(liveMember, ctx.emailClass);
            if (reason) {
              settlement.suppressed.push({ id: row.id, reason: `${reason}_mid_send` as SuppressedReason });
              continue;
            }
          }
          toDeliver.push({ row, msg: ctx.finalize(row, p.draft, liveMember) });
        }

        // Deliver: CONCURRENCY workers over the chunk. Once the first deliver has
        // started, nothing in the chunk goes back to queued except rows never
        // handed to deliver after a 429 stop.
        let next = 0;
        const worker = async () => {
          for (;;) {
            if (rateLimited) return;
            const i = next++;
            if (i >= toDeliver.length) return;
            const item = toDeliver[i]!;
            delivering = true;
            const outcome = await deliverOnce(item.msg, opts.deliver, clock);
            if (outcome.kind === "sent") {
              settlement.sent.push({ id: item.row.id, sentAt: new Date(outcome.at).toISOString(), messageId: outcome.messageId });
            } else if (outcome.kind === "failed") {
              settlement.failed.push({ id: item.row.id, reason: outcome.reason });
            } else if (outcome.kind === "unknown") {
              settlement.unknown.push({ id: item.row.id, reason: outcome.reason });
            } else {
              rateLimited = true;
              notHanded.push(item.row.id);
            }
          }
        };
        await Promise.all(Array.from({ length: Math.min(CONCURRENCY, toDeliver.length) }, worker));
        for (let i = next; i < toDeliver.length; i++) notHanded.push(toDeliver[i]!.row.id);
      } catch (e) {
        if (delivering) throw e; // never release once delivery began
        await retryBusy(() => store.release(emailId, runKey, token), clock.sleep).catch(() => {});
        if (isBusy(e)) {
          result.stopped = "stalled";
          result.error = e instanceof Error ? e.message : String(e);
          await store.updateEmail(emailId, { send_last_error: result.error }).catch(() => {});
          return result;
        }
        throw e;
      }

      await retryBusy(() => store.settle(settlement), clock.sleep);
      if (notHanded.length) {
        await retryBusy(() => store.release(emailId, runKey, token, notHanded), clock.sleep);
      }
      await step("settle-written");
      result.sent += settlement.sent.length;
      result.failed += settlement.failed.length;
      result.unknown += settlement.unknown.length;
      result.suppressed += settlement.suppressed.length;
      result.requeued += notHanded.length;

      counts = await writeCounts(store, emailId, runKey);
      await step("counts-written");

      if (rateLimited) {
        result.stopped = "rate_limited";
        break;
      }
    }

    if (result.stopped === "done") {
      counts = await store.counts(emailId, runKey);
      result.completed = await completeSend(store, email, counts, clock, hooks);
    }
    return result;
  } finally {
    await releaseLease(store, lease, hooks).catch(() => {});
  }
}

/** Derive the totals from the rows and write them; clears `send_last_error` (a chunk settled). */
export async function writeCounts(store: RecipientStore, emailId: string, runKey: string): Promise<StatusCounts> {
  const c = await store.counts(emailId, runKey);
  await store.updateEmail(emailId, {
    total_sent: c.sent,
    total_failed: c.failed,
    total_unknown: c.unknown,
    total_suppressed: c.suppressed,
    send_last_error: null,
  });
  return c;
}

/**
 * The completion write (§5.2), when `total_recipients` is set and nothing is
 * queued or claimed. Idempotent: every value is derived. A recurring scheduled
 * occurrence returns to `scheduled`, rolled forward.
 */
export async function completeSend(
  store: RecipientStore,
  email: EmailQueueState,
  counts: StatusCounts,
  clock: Clock,
  hooks?: Hooks
): Promise<boolean> {
  const runKey = email.send_run_key;
  if (email.total_recipients == null || !runKey) return false;
  if (counts.queued + counts.claimed > 0) return false;

  const nowIso = new Date(clock.now()).toISOString();
  const failures = await store.failures(email.id, runKey, SEND_ERRORS_MAX);
  const data: Record<string, unknown> = {
    status: counts.sent >= 1 ? "sent" : "failed",
    send_finished_at: nowIso,
    total_sent: counts.sent,
    total_failed: counts.failed,
    total_unknown: counts.unknown,
    total_suppressed: counts.suppressed,
    send_errors: failures.map(
      (f) => `${f.recipient_email || "(no address)"}: ${f.error_message || (f.status === "unknown" ? "unknown" : "failed")}`
    ),
    send_last_error: null,
    // Legacy, for today's readers (formatStats, the dashboards).
    recipient_count: email.total_recipients,
    delivered_count: counts.sent,
    failed_count: counts.failed,
  };
  if (!email.send_finished_at) data.sent_at = nowIso;

  if (runKey.startsWith("s:")) {
    const repeats = !!email.recurrence_rule && email.recurrence_rule !== "none";
    const tz = repeats && store.recurrenceTimeZone ? await store.recurrenceTimeZone(email.id).catch(() => null) : null;
    const next = computeNextRun(new Date(email.scheduled_at || runKey.slice(2)), email.recurrence_rule, tz);
    if (next) {
      data.status = "scheduled";
      data.scheduled_at = next.toISOString();
      data.next_run_at = next.toISOString();
    } else {
      data.next_run_at = null;
    }
    data.last_run_at = nowIso;
  }
  await store.updateEmail(email.id, data);
  await hooks?.step?.("completion-written");
  return true;
}

/**
 * Re-derive an email's totals after the webhook promoted rows (§4.3): the
 * totals follow the rows. A finished send also re-derives its status (a send
 * whose only acceptances were `unknown` becomes `sent` once the evidence
 * arrives), its legacy counts and its failure list. Nothing else.
 */
export async function refreshTotals(store: RecipientStore, emailId: string): Promise<void> {
  const email = await store.readEmail(emailId);
  if (!email?.send_run_key) return;
  const c = await store.counts(emailId, email.send_run_key);
  const data: Record<string, unknown> = {
    total_sent: c.sent,
    total_failed: c.failed,
    total_unknown: c.unknown,
    total_suppressed: c.suppressed,
  };
  if ((email.status === "sent" || email.status === "failed") && c.queued + c.claimed === 0) {
    const failures = await store.failures(emailId, email.send_run_key, SEND_ERRORS_MAX);
    data.status = c.sent >= 1 ? "sent" : "failed";
    data.delivered_count = c.sent;
    data.failed_count = c.failed;
    data.send_errors = failures.map(
      (f) => `${f.recipient_email || "(no address)"}: ${f.error_message || (f.status === "unknown" ? "unknown" : "failed")}`
    );
  }
  await store.updateEmail(emailId, data);
}

/**
 * What one SendGrid event changes on a queue row (§4.3), for the webhook: an
 * event exists only for a message SendGrid accepted, so a row still `claimed`
 * or `unknown` becomes `sent` (the event's time, its message id); delivered /
 * bounce / dropped set `delivery_status`. Null when there is nothing to write.
 * The webhook never writes `status` for any other reason.
 */
export function queueRowPatch(
  row: { status?: string | null; delivery_status?: string | null },
  sg: { event: string; timestamp?: number | null },
  cleanMessageId: string | null
): Record<string, unknown> | null {
  const patch: Record<string, unknown> = {};
  if (row.status === "claimed" || row.status === "unknown") {
    patch.status = "sent";
    patch.sent_at = new Date((sg.timestamp || Date.now() / 1000) * 1000).toISOString();
    if (cleanMessageId) patch.sg_message_id = cleanMessageId;
    patch.error_message = null;
  }
  const delivery =
    sg.event === "delivered" ? "delivered" : sg.event === "bounce" || sg.event === "dropped" ? "bounced" : null;
  if (delivery && row.delivery_status !== delivery) patch.delivery_status = delivery;
  return Object.keys(patch).length ? patch : null;
}

/**
 * A send still getting ready after PREPARE_STALE_MS (its enqueue died between
 * batches): failed, its rows deleted. Nothing was claimed while
 * `total_recipients` was null, so nobody got it (§2.4).
 */
export async function closeStalePreparing(
  store: RecipientStore,
  email: EmailQueueState,
  clock: Clock,
  hooks?: Hooks
): Promise<boolean> {
  if (email.status !== "sending" || email.total_recipients != null) return false;
  const started = email.send_started_at ? Date.parse(email.send_started_at) : 0;
  if (started > clock.now() - PREPARE_STALE_MS) return false;
  const lease = await acquireLease(store, email.id, "prepare", "cron", clock, hooks);
  if (!lease) return false;
  try {
    if (email.send_run_key) await store.deleteRows(email.id, email.send_run_key);
    await store.updateEmail(email.id, {
      status: "failed",
      send_finished_at: new Date(clock.now()).toISOString(),
      send_errors: [PREPARE_CLOSED_MESSAGE],
      total_sent: 0,
      total_failed: 0,
      total_unknown: 0,
    });
    return true;
  } finally {
    await releaseLease(store, lease, hooks).catch(() => {});
  }
}

// ── The tick ────────────────────────────────────────────────────────────────

export interface TickResult {
  enqueued: number;
  runs: Array<Pick<RunResult, "emailId" | "stopped" | "sent" | "failed" | "unknown" | "requeued" | "expired"> & { error?: string }>;
  closed: number;
  completed: number;
  /** Sends this tick paused (Phase 4, email-send-health.ts). */
  paused: number;
}

/**
 * One tick (§7.1): enqueue due scheduled emails, then run `sending` emails
 * oldest first while the budget lasts, then close stale preparing sends, then
 * complete any done-but-unwritten send the runs did not reach.
 *
 * `checkHealth` (Phase 4) runs after each run that left its send unfinished,
 * outside runBatch and after its lease is released; it takes the lease itself.
 */
export async function runSendTick<D, M>(opts: {
  store: RecipientStore;
  worker: Worker;
  budgetMs: number;
  clock: Clock;
  hooks?: Hooks;
  enqueueDue?: () => Promise<number>;
  depsFor: (email: EmailQueueState) => RunDeps<D, M>;
  /** Auto-pause: true when this call paused the send. */
  checkHealth?: (email: EmailQueueState) => Promise<boolean>;
}): Promise<TickResult> {
  const { store, clock } = opts;
  const t0 = clock.now();
  const out: TickResult = { enqueued: 0, runs: [], closed: 0, completed: 0, paused: 0 };

  if (opts.enqueueDue) out.enqueued = await opts.enqueueDue();

  const sending = await store.sendingEmails();
  const visited = new Set<string>();
  for (const email of sending) {
    if (email.total_recipients == null) continue;
    const left = opts.budgetMs - (clock.now() - t0);
    if (left < CHUNK_RESERVE_MS) break;
    visited.add(email.id);
    try {
      const r = await runBatch({
        store,
        emailId: email.id,
        worker: opts.worker,
        budgetMs: left,
        clock,
        hooks: opts.hooks,
        ...opts.depsFor(email),
      });
      out.runs.push({ emailId: r.emailId, stopped: r.stopped, sent: r.sent, failed: r.failed, unknown: r.unknown, requeued: r.requeued, expired: r.expired, ...(r.error ? { error: r.error } : {}) });
      if (r.completed) out.completed++;
      else if (opts.checkHealth && r.stopped !== "busy" && r.stopped !== "not_ready") {
        try {
          if (await opts.checkHealth(email)) out.paused++;
        } catch (e) {
          console.error(`[email-send-queue] health check for ${email.id} failed:`, e);
        }
      }
    } catch (e) {
      console.error(`[email-send-queue] run for ${email.id} failed:`, e);
      out.runs.push({ emailId: email.id, stopped: "stalled", sent: 0, failed: 0, unknown: 0, requeued: 0, expired: 0, error: (e as Error)?.message || String(e) });
    }
  }

  for (const email of sending) {
    if (email.total_recipients != null) continue;
    try {
      if (await closeStalePreparing(store, email, clock, opts.hooks)) out.closed++;
    } catch (e) {
      console.error(`[email-send-queue] closing ${email.id} failed:`, e);
    }
  }

  for (const email of sending) {
    if (email.total_recipients == null || visited.has(email.id) || !email.send_run_key) continue;
    try {
      const counts = await store.counts(email.id, email.send_run_key);
      if (counts.queued + counts.claimed > 0) continue;
      const lease = await acquireLease(store, email.id, "send", opts.worker, clock, opts.hooks);
      if (!lease) continue;
      try {
        if (await completeSend(store, email, counts, clock, opts.hooks)) out.completed++;
      } finally {
        await releaseLease(store, lease, opts.hooks).catch(() => {});
      }
    } catch (e) {
      console.error(`[email-send-queue] completing ${email.id} failed:`, e);
    }
  }
  return out;
}

// ── Progress ────────────────────────────────────────────────────────────────

export interface SendProgress {
  status: string | null;
  phase: "preparing" | "sending" | "paused" | "done";
  total: number | null;
  sent: number;
  failed: number;
  unknown: number;
  suppressed: number;
  queued: number;
  claimed: number;
  /** Rows written so far (the "Getting ready" count). */
  rows: number;
  stalled: string | null;
  /** Set while the send is paused (Phase 4): why, in one sentence. */
  paused: { reason: PauseReason | null; sentence: string | null; at: string | null } | null;
  updatedAt: string | null;
  errors: Array<{ address: string; reason: string }>;
}

/** §5.4 — the phase and numbers the dialog and the detail page render. */
export function deriveProgress(
  email: EmailQueueState & { date_updated?: string | null; send_errors?: unknown },
  counts: StatusCounts
): SendProgress {
  const status = email.status;
  const doneScheduled = status === "scheduled" && !!email.send_finished_at && !!email.send_run_key;
  const phase: SendProgress["phase"] =
    status === "sent" || status === "failed" || doneScheduled
      ? "done"
      : status === "paused"
        ? "paused"
        : email.total_recipients == null
          ? "preparing"
          : "sending";
  const health = status === "paused" ? readHealthRecord(email.send_errors, email.send_run_key) : null;
  const errors = (Array.isArray(email.send_errors) ? email.send_errors : [])
    .filter((e): e is string => typeof e === "string")
    .map((line) => {
      const i = line.indexOf(": ");
      return i > 0 ? { address: line.slice(0, i), reason: line.slice(i + 2) } : { address: "", reason: line };
    });
  return {
    status,
    phase,
    total: email.total_recipients,
    sent: counts.sent,
    failed: counts.failed,
    unknown: counts.unknown,
    suppressed: counts.suppressed,
    queued: counts.queued,
    claimed: counts.claimed,
    rows: counts.queued + counts.claimed + counts.sent + counts.failed + counts.suppressed + counts.unknown,
    stalled: email.send_last_error || null,
    paused:
      status === "paused"
        ? { reason: health?.reason ?? null, sentence: health?.sentence ?? null, at: health?.at ?? null }
        : null,
    updatedAt: email.date_updated ?? null,
    errors,
  };
}

// ── The Directus store ──────────────────────────────────────────────────────

type DirectusLike = { request: (op: any) => Promise<any> };

// The client is `DirectusLike` (the routes pass getTypedDirectus(), the tests a
// stub), so the builders are used untyped and looked up at call time — a test
// that mocks @directus/sdk without them still imports this module.
const op = (name: string) => (...args: unknown[]) => (sdk as any)[name](...args);
const readItems = op("readItems");
const readItem = op("readItem");
const createItem = op("createItem");
const createItems = op("createItems");
const updateItem = op("updateItem");
const updateItems = op("updateItems");
const updateItemsBatch = op("updateItemsBatch");
const deleteItems = op("deleteItems");
const aggregate = op("aggregate");

const RECIPIENTS = "hoa_email_recipients";
const LEASES = "hoa_email_send_leases";

export const QUEUE_ROW_FIELDS = [
  "id",
  "email",
  "run_key",
  "kind",
  "position",
  "dedupe_key",
  "member",
  "recipient_email",
  "recipient_name",
  "status",
  "claim",
  "claimed_at",
  "member_fields",
  "copies",
] as const;

export const EMAIL_QUEUE_FIELDS = [
  "id",
  "status",
  "send_run_key",
  "total_recipients",
  "send_started_at",
  "send_finished_at",
  "sent_at",
  "scheduled_at",
  "recurrence_rule",
  "send_last_error",
  "send_errors",
] as const;

const idOf = (v: unknown): string | null =>
  v == null ? null : typeof v === "object" ? ((v as { id?: string }).id ?? null) : String(v);

function toRow(r: any): QueueRow {
  return { ...r, email: idOf(r.email) as string, member: idOf(r.member), position: Number(r.position ?? 0) };
}

function groupBy<T extends { reason: string }>(items: T[]): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const it of items) {
    const ids = m.get(it.reason) ?? [];
    ids.push((it as unknown as { id: string }).id);
    m.set(it.reason, ids);
  }
  return m;
}

export function directusRecipientStore(directus: DirectusLike): RecipientStore {
  const req = (o: unknown) => directus.request(o);
  return {
    async insertLease(lease) {
      const row = await req(createItem(LEASES, lease, { fields: ["id", "email", "token", "purpose", "worker", "started_at"] }));
      return { ...lease, ...row, email: idOf(row?.email) ?? lease.email } as Lease;
    },
    async readLease(emailId) {
      const rows = await req(
        readItems(LEASES, {
          filter: { email: { _eq: emailId } },
          fields: ["id", "email", "token", "purpose", "worker", "started_at"],
          limit: 1,
        })
      );
      const r = Array.isArray(rows) ? rows[0] : null;
      return r ? ({ ...r, email: idOf(r.email) } as Lease) : null;
    },
    async deleteLease(lease) {
      await req(deleteItems(LEASES, { filter: { id: { _eq: lease.id }, token: { _eq: lease.token } } }));
    },

    async createRows(rows) {
      if (!rows.length) return;
      await req(createItems(RECIPIENTS, rows, { fields: ["id"] }));
    },
    async deleteRows(emailId, runKey) {
      // limit -1: Directus resolves a delete-by-query to keys with the default
      // read limit (100) otherwise.
      await req(deleteItems(RECIPIENTS, { filter: { email: { _eq: emailId }, run_key: { _eq: runKey } }, limit: -1 }));
    },
    async queued(emailId, runKey, limit) {
      const rows = await req(
        readItems(RECIPIENTS, {
          filter: { email: { _eq: emailId }, run_key: { _eq: runKey }, status: { _eq: "queued" } },
          fields: [...QUEUE_ROW_FIELDS],
          sort: ["position", "id"],
          limit,
        })
      );
      return (rows || []).map(toRow);
    },
    async claim(emailId, runKey, ids, token, at) {
      await req(
        updateItems(
          RECIPIENTS,
          { filter: { id: { _in: ids }, status: { _eq: "queued" } }, limit: -1 },
          { status: "claimed", claim: token, claimed_at: at },
          { fields: ["id"] }
        )
      );
      const rows = await req(
        readItems(RECIPIENTS, {
          filter: { email: { _eq: emailId }, run_key: { _eq: runKey }, claim: { _eq: token }, status: { _eq: "claimed" } },
          fields: [...QUEUE_ROW_FIELDS],
          sort: ["position", "id"],
          limit: -1,
        })
      );
      return (rows || []).map(toRow);
    },
    async release(emailId, runKey, token, ids) {
      await req(
        updateItems(
          RECIPIENTS,
          {
            filter: {
              email: { _eq: emailId },
              run_key: { _eq: runKey },
              claim: { _eq: token },
              status: { _eq: "claimed" },
              ...(ids ? { id: { _in: ids } } : {}),
            },
            limit: -1,
          },
          { status: "queued", claim: null, claimed_at: null },
          { fields: ["id"] }
        )
      );
    },
    async expire(emailId, runKey, cutoff, message) {
      const rows = await req(
        updateItems(
          RECIPIENTS,
          {
            filter: {
              email: { _eq: emailId },
              run_key: { _eq: runKey },
              status: { _eq: "claimed" },
              claimed_at: { _lt: cutoff },
            },
            limit: -1,
          },
          { status: "unknown", error_message: message },
          { fields: ["id"] }
        )
      );
      return Array.isArray(rows) ? rows.length : 0;
    },
    async settle(s) {
      if (s.sent.length) {
        // Distinct sent_at / message id per row: one batch request. By id — a
        // `sent` written over a webhook's `sent`, or over a breaker's `unknown`,
        // is the truth either way.
        await req(
          updateItemsBatch(
            RECIPIENTS,
            s.sent.map((r) => ({ id: r.id, status: "sent", sent_at: r.sentAt, sg_message_id: r.messageId, error_message: null }))
          )
        );
      }
      // Only where still claimed: a webhook that already promoted a row to
      // `sent` is not overwritten by a late failed/unknown (§3.3).
      const conditional = async (status: RowStatus, groups: Map<string, string[]>, field: string) => {
        for (const [reason, ids] of groups) {
          await req(
            updateItems(
              RECIPIENTS,
              { filter: { id: { _in: ids }, status: { _eq: "claimed" } }, limit: -1 },
              { status, [field]: reason },
              { fields: ["id"] }
            )
          );
        }
      };
      await conditional("failed", groupBy(s.failed), "error_message");
      await conditional("unknown", groupBy(s.unknown), "error_message");
      await conditional("suppressed", groupBy(s.suppressed), "suppressed_reason");
    },
    async counts(emailId, runKey) {
      const rows = await req(
        aggregate(RECIPIENTS, {
          aggregate: { count: "id" },
          groupBy: ["status"],
          query: { filter: { email: { _eq: emailId }, run_key: { _eq: runKey } } },
        })
      );
      const c: StatusCounts = { ...ZERO_COUNTS };
      for (const r of Array.isArray(rows) ? rows : []) {
        const key = r?.status as keyof StatusCounts;
        if (key in c) c[key] = Number(r?.count?.id ?? r?.count ?? 0) || 0;
      }
      return c;
    },
    async failures(emailId, runKey, limit) {
      return (
        (await req(
          readItems(RECIPIENTS, {
            filter: { email: { _eq: emailId }, run_key: { _eq: runKey }, status: { _in: ["failed", "unknown"] } },
            fields: ["recipient_email", "error_message", "status"],
            sort: ["position", "id"],
            limit,
          })
        )) || []
      );
    },

    async readEmail(emailId) {
      const r = await req(readItem("hoa_emails", emailId, { fields: [...EMAIL_QUEUE_FIELDS] }));
      return r ? (r as EmailQueueState) : null;
    },
    async updateEmail(emailId, data) {
      await req(updateItem("hoa_emails", emailId, data, { fields: ["id"] }));
    },
    async sendingEmails() {
      return (
        (await req(
          readItems("hoa_emails", {
            filter: { status: { _eq: "sending" } },
            fields: [...EMAIL_QUEUE_FIELDS],
            sort: ["send_started_at"],
            limit: 50,
          })
        )) || []
      );
    },
    async recurrenceTimeZone(emailId) {
      // Its own read, so a deploy ahead of the schema script reads nothing
      // missing on the hot path; a 403 for a field that doesn't exist yet is null.
      const r = await req(readItem("hoa_emails", emailId, { fields: ["recurrence_timezone"] })).catch(() => null);
      return (r as { recurrence_timezone?: string | null } | null)?.recurrence_timezone || null;
    },
    async liveMembers(ids) {
      return (
        (await req(
          readItems("hoa_members", {
            filter: { id: { _in: ids } },
            fields: ["id", "email", "email_community_opt_out", "email_bounced", "unsubscribe_token"],
            limit: -1,
          })
        )) || []
      );
    },
  };
}

// ── Schema probe ────────────────────────────────────────────────────────────

/** The fields `pnpm add:email-send-queue` creates, by collection. */
export const QUEUE_SCHEMA_FIELDS = {
  hoa_email_recipients: ["kind", "run_key", "position", "dedupe_key", "claim", "claimed_at", "member_fields", "copies", "suppressed_reason", "delivery_status"],
  hoa_emails: ["total_recipients", "total_sent", "total_failed", "total_suppressed", "total_unknown", "send_run_key", "send_started_at", "send_finished_at", "send_errors", "send_last_error"],
  hoa_email_send_leases: ["email", "token", "purpose", "worker", "started_at"],
} as const;

const NEGATIVE_TTL_MS = 60_000;
let cachedQueue: { value: boolean; at: number } | null = null;

/**
 * Does the queue's schema exist? Same shape as `emailComplianceSchema()`: a yes
 * is kept for the life of the process, a no for a minute. Until it says yes,
 * `send.post.ts` and `sendEmailJob` keep today's synchronous send, so a deploy
 * ahead of the script changes nothing. A failed read of the two existing
 * collections throws (an outage is not a missing field); a missing lease
 * collection reads as "not yet".
 */
export async function emailQueueSchema(directus: DirectusLike): Promise<boolean> {
  const now = Date.now();
  if (cachedQueue && (cachedQueue.value || now - cachedQueue.at < NEGATIVE_TTL_MS)) return cachedQueue.value;
  const fieldsOf = (collection: string) => directus.request(op("readFieldsByCollection")(collection));
  const names = (rows: unknown) =>
    new Set(Array.isArray(rows) ? rows.map((r: any) => r?.field).filter(Boolean) : []);
  const [recipients, emails] = await Promise.all([fieldsOf("hoa_email_recipients"), fieldsOf("hoa_emails")]);
  const leases = await fieldsOf("hoa_email_send_leases").catch(() => []);
  const r = names(recipients);
  const e = names(emails);
  const l = names(leases);
  const value =
    QUEUE_SCHEMA_FIELDS.hoa_email_recipients.every((f) => r.has(f)) &&
    QUEUE_SCHEMA_FIELDS.hoa_emails.every((f) => e.has(f)) &&
    QUEUE_SCHEMA_FIELDS.hoa_email_send_leases.every((f) => l.has(f));
  cachedQueue = { value, at: now };
  return value;
}

/** Tests only. */
export function _resetEmailQueueSchemaCache(): void {
  cachedQueue = null;
}
