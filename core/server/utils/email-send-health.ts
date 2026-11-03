/**
 * Auto-pause and Resume for a queued send (Earnest parity round 3, Phase 4).
 * The lines and the sentence are core/shared/email/send-health.ts; this is the
 * part that touches the queue.
 *
 * After each run of an unfinished send, the tick calls `checkSendHealth`. It
 * runs OUTSIDE runBatch's at-most-once loop, under the send's own lease, so it
 * never overlaps a run of the same email, a completion or a Resume. Under the
 * lease it reads the email, counts the occurrence's events and, over a line,
 * moves the row `sending` → `paused` with a filter-update on the status. Only
 * the call whose write moved the row notifies, so the admins hear once however
 * many ticks overlap. A paused email's rows stay `queued`: `sendingEmails()`
 * and runBatch only run `sending` emails, so nothing claims them.
 *
 * Resume (`resumeSend`, POST /api/email/:id/resume) takes the same lease,
 * moves `paused` → `sending`, and stores the counts at that moment as the
 * baseline: from then on only new events are judged, with the same minimum
 * sample. Otherwise the rates that paused it would pause it again a minute
 * after Resume.
 *
 * Until `pnpm add:email-send-queue` has added `hoa_email_activity.bounce_type`
 * (Phase 4's part of the script), `emailPhase4Schema()` says no and the tick
 * skips the check: without it a blocked bounce can't be told from a hard one.
 */

import * as sdk from "@directus/sdk";
import {
  eventsSince,
  pauseSentence,
  pauseVerdict,
  readHealthRecord,
  type HealthRecord,
  type PauseReason,
  type PauseVerdict,
  type SendEventCounts,
  type SendHealthRules,
} from "#core/shared/email/send-health";
import { acquireLease, releaseLease, type Clock, type Hooks, type RecipientStore, type Worker } from "./email-send-queue";

type DirectusLike = { request: (op: any) => Promise<any> };
const op = (name: string) => (...args: unknown[]) => (sdk as any)[name](...args);

export interface HealthStore {
  /** The occurrence's delivered, hard-bounce and spam-report events so far. */
  eventCounts(emailId: string, runKey: string): Promise<SendEventCounts>;
  /** Filter-update on (id, status = from). True when this call moved the row. */
  moveEmail(emailId: string, from: string, data: Record<string, unknown>): Promise<boolean>;
}

export type PauseNotifier = (args: { emailId: string; reason: PauseReason; sentence: string }) => Promise<void>;

export interface HealthCheck {
  /** False when the lease was busy or the email was not a running send. */
  checked: boolean;
  paused: boolean;
  verdict: PauseVerdict | null;
}

/** Hold a running send to the lines; pause it if it is over one. */
export async function checkSendHealth(
  store: RecipientStore,
  health: HealthStore,
  emailId: string,
  opts: { worker: Worker; clock: Clock; notify?: PauseNotifier; rules?: SendHealthRules; hooks?: Hooks }
): Promise<HealthCheck> {
  const none: HealthCheck = { checked: false, paused: false, verdict: null };
  const lease = await acquireLease(store, emailId, "send", opts.worker, opts.clock, opts.hooks);
  if (!lease) return none;
  try {
    const email = await store.readEmail(emailId);
    const runKey = email?.send_run_key;
    if (!email || email.status !== "sending" || email.total_recipients == null || !runKey) return none;

    const counts = await health.eventCounts(emailId, runKey);
    const record = readHealthRecord(email.send_errors, runKey);
    const baseline = record?.state === "resumed" ? record.baseline : null;
    const verdict = pauseVerdict(eventsSince(counts, baseline), opts.rules);
    if (!verdict.pause || !verdict.reason) return { checked: true, paused: false, verdict };

    const sentence = pauseSentence(verdict, opts.rules);
    const rec: HealthRecord = {
      state: "paused",
      reason: verdict.reason,
      at: new Date(opts.clock.now()).toISOString(),
      runKey,
      counts,
      baseline: baseline ?? null,
      sentence,
    };
    const moved = await health.moveEmail(emailId, "sending", { status: "paused", send_errors: { health: rec } });
    await opts.hooks?.step?.("pause-written");
    if (moved && opts.notify) {
      await opts.notify({ emailId, reason: verdict.reason, sentence }).catch((e) =>
        // A cron has no caller to answer; the log is where this shows.
        console.warn(`[email-send-health] ${emailId} paused, but the admins could not be told:`, (e as Error)?.message)
      );
    }
    return { checked: true, paused: moved, verdict };
  } finally {
    await releaseLease(store, lease, opts.hooks).catch(() => {});
  }
}

export type ResumeOutcome = "resumed" | "not_paused" | "busy";

/** Resume: `paused` → `sending`, today's counts as the baseline. The queue carries on where it was. */
export async function resumeSend(
  store: RecipientStore,
  health: HealthStore,
  emailId: string,
  clock: Clock,
  hooks?: Hooks
): Promise<ResumeOutcome> {
  const lease = await acquireLease(store, emailId, "send", "manual", clock, hooks);
  if (!lease) return "busy";
  try {
    const email = await store.readEmail(emailId);
    const runKey = email?.send_run_key;
    if (!email || email.status !== "paused" || email.total_recipients == null || !runKey) return "not_paused";
    const before = readHealthRecord(email.send_errors, runKey);
    const baseline = await health.eventCounts(emailId, runKey);
    const rec: HealthRecord = {
      state: "resumed",
      reason: before?.reason ?? null,
      at: new Date(clock.now()).toISOString(),
      runKey,
      counts: before?.counts ?? baseline,
      baseline,
      sentence: before?.sentence ?? null,
    };
    const moved = await health.moveEmail(emailId, "paused", { status: "sending", send_errors: { health: rec } });
    return moved ? "resumed" : "not_paused";
  } finally {
    await releaseLease(store, lease, hooks).catch(() => {});
  }
}

// ── Directus ────────────────────────────────────────────────────────────────

const countOf = (rows: unknown): number => {
  const c = Array.isArray(rows) ? (rows[0] as any)?.count : null;
  return Number(typeof c === "object" && c ? (c.id ?? c["*"] ?? 0) : (c ?? 0));
};

/**
 * `bounceTypes`: whether `hoa_email_activity.bounce_type` exists yet. Directus
 * refuses a filter on a field it doesn't have, so until the script has run a
 * Resume's baseline counts every bounce (the tick doesn't judge until then).
 */
export function directusHealthStore(directus: DirectusLike, opts: { bounceTypes?: boolean } = {}): HealthStore {
  const bounceTypes = opts.bounceTypes ?? true;
  const req = (o: unknown) => directus.request(o);
  const count = async (emailId: string, runKey: string, filter: Record<string, unknown>) =>
    countOf(
      await req(
        op("aggregate")("hoa_email_activity", {
          aggregate: { count: "id" },
          query: {
            filter: { _and: [{ email_recipient: { email: { _eq: emailId }, run_key: { _eq: runKey } } }, filter] },
          },
        })
      )
    );
  return {
    async eventCounts(emailId, runKey) {
      const [delivered, hardBounces, spamReports] = await Promise.all([
        count(emailId, runKey, { event: { _eq: "delivered" } }),
        count(emailId, runKey, {
          _or: [
            bounceTypes
              ? { _and: [{ event: { _eq: "bounce" } }, { _or: [{ bounce_type: { _null: true } }, { bounce_type: { _neq: "blocked" } }] }] }
              : { event: { _eq: "bounce" } },
            { _and: [{ event: { _eq: "dropped" } }, { reason: { _icontains: "bounced address" } }] },
          ],
        }),
        count(emailId, runKey, { event: { _in: ["spamreport", "spam_report"] } }),
      ]);
      return { delivered, hardBounces, spamReports };
    },
    async moveEmail(emailId, from, data) {
      const moved = await req(
        op("updateItems")(
          "hoa_emails",
          { filter: { id: { _eq: emailId }, status: { _eq: from } }, limit: 1 },
          data,
          { fields: ["id"] }
        )
      );
      return Array.isArray(moved) && moved.length > 0;
    },
  };
}

/** Bell + branded email to the org's admins and whoever pressed Send, with a "Review and resume" link. */
export function sendPausedNotifier(directus: DirectusLike): PauseNotifier {
  return async ({ emailId, sentence }) => {
    const email = (await directus.request(
      op("readItem")("hoa_emails", emailId, { fields: ["id", "subject", "organization", "user_created"] })
    )) as { subject?: string | null; organization?: unknown; user_created?: unknown } | null;
    const idOf = (v: unknown) => (v && typeof v === "object" ? ((v as { id?: string }).id ?? null) : (v as string | null) ?? null);
    const orgId = idOf(email?.organization);
    if (!email || !orgId) return;
    const { adminUserIds } = await import("./notification-events");
    const { notifyUsers } = await import("./notify");
    const admins = await adminUserIds(orgId).catch(() => [] as string[]);
    const starter = idOf(email.user_created);
    const subject = `“${email.subject || "Your email"}” paused itself`;
    const path = `/admin/communications/${emailId}`;
    await notifyUsers({
      organizationId: orgId,
      recipientUserIds: [...new Set([...admins, ...(starter ? [starter] : [])])],
      category: "task",
      subject,
      message: sentence,
      collection: "hoa_emails",
      item: emailId,
      path,
      email: {
        heading: subject,
        bodyHtml: `<p>${escapeHtml(sentence)}</p>`,
        cta: { label: "Review and resume", path },
        emailType: "alert",
      },
    });
  };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** The fields Phase 4 adds (`pnpm add:email-send-queue`). */
export const PHASE4_SCHEMA_FIELDS = {
  hoa_email_activity: ["bounce_type"],
  hoa_emails: ["recurrence_timezone"],
} as const;
const NEGATIVE_TTL_MS = 60_000;
let cachedPhase4: { value: boolean; at: number } | null = null;

/**
 * Has the script added Phase 4's fields? A yes is kept for the process, a no
 * for a minute. Until then the tick doesn't pause (a blocked bounce can't be
 * told from a hard one) and the composer's time zone isn't stored.
 */
export async function emailPhase4Schema(directus: DirectusLike): Promise<boolean> {
  const now = Date.now();
  if (cachedPhase4 && (cachedPhase4.value || now - cachedPhase4.at < NEGATIVE_TTL_MS)) return cachedPhase4.value;
  const names = async (collection: string) => {
    const rows = await directus.request(op("readFieldsByCollection")(collection)).catch(() => []);
    return new Set(Array.isArray(rows) ? rows.map((r: any) => r?.field).filter(Boolean) : []);
  };
  const [activity, emails] = await Promise.all([names("hoa_email_activity"), names("hoa_emails")]);
  const value =
    PHASE4_SCHEMA_FIELDS.hoa_email_activity.every((f) => activity.has(f)) &&
    PHASE4_SCHEMA_FIELDS.hoa_emails.every((f) => emails.has(f));
  cachedPhase4 = { value, at: now };
  return value;
}

/** Tests only. */
export function _resetEmailPhase4SchemaCache(): void {
  cachedPhase4 = null;
}
