/**
 * "Resend to these N unknown" (docs/spec-email-send-queue.md §3.4 and open
 * question 4; Peter's yes 2026-11-12, as a draft).
 *
 * An `unknown` row may or may not have gone: the run died while it was
 * claimed, or SendGrid's answer was lost. Any SendGrid event for it promotes it
 * to `sent` (the activity webhook), and that normally arrives within seconds,
 * so a row still `unknown` an hour after its attempt most likely never went
 * out. Even then the queue never resends it: the admin gets a NEW DRAFT of the
 * same email addressed to just those members, reviews it, and sends it the
 * normal way. Some of them may get it twice; the button says so.
 *
 * Pure, so the route and the detail page agree on who is ready.
 */

/** How long an `unknown` row waits for SendGrid's evidence before it can be resent. */
export const RESEND_UNKNOWN_AFTER_MS = 60 * 60 * 1000;

export interface UnknownRowLike {
  status?: string | null;
  /** `member` (one person) or `copy` (the cc/bcc message). */
  kind?: string | null;
  member?: string | { id?: string | null } | null;
  /** When the row was handed to SendGrid (or would have been). */
  claimed_at?: string | null;
}

export interface UnknownResendPlan {
  /** Members whose row has been `unknown` for RESEND_UNKNOWN_AFTER_MS or more. */
  memberIds: string[];
  /** `unknown` member rows still inside the wait. */
  waiting: number;
  /** When the last waiting row becomes ready; null when none waits. */
  readyAt: string | null;
  /** `unknown` rows a resend cannot target: the cc/bcc copy, or no member on the row. */
  notResendable: number;
}

const memberId = (m: UnknownRowLike["member"]): string | null =>
  typeof m === "string" ? m : (m?.id ?? null);

export function planUnknownResend(rows: UnknownRowLike[], nowMs: number): UnknownResendPlan {
  const ready = new Set<string>();
  let waiting = 0;
  let lastReady = 0;
  let notResendable = 0;

  for (const row of rows) {
    if (row.status !== "unknown") continue;
    const id = row.kind === "copy" ? null : memberId(row.member);
    if (!id) {
      notResendable++;
      continue;
    }
    // A row with no claim time came from a run that is long dead: ready.
    const claimed = row.claimed_at ? Date.parse(row.claimed_at) : NaN;
    const readyFrom = Number.isFinite(claimed) ? claimed + RESEND_UNKNOWN_AFTER_MS : 0;
    if (readyFrom <= nowMs) ready.add(id);
    else {
      waiting++;
      lastReady = Math.max(lastReady, readyFrom);
    }
  }

  return {
    memberIds: [...ready],
    waiting,
    readyAt: waiting ? new Date(lastReady).toISOString() : null,
    notResendable,
  };
}
