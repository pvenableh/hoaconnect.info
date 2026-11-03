/**
 * The send queue's numbers (docs/spec-email-send-queue.md §4.1, §7.2, §7.3).
 * Their own module so `sendgrid.ts` can read the client timeout without
 * importing the queue. `email-send-queue.ts` re-exports them.
 */

/** Rows claimed and delivered per chunk. */
export const CHUNK = 100;
/** Messages in flight at once inside a chunk. */
export const CONCURRENCY = 10;
/** Stop claiming once this much of a tick has gone. A claimed chunk always finishes. */
export const TICK_BUDGET_MS = 45_000;
/** Do not claim a new chunk with less than this left. */
export const CHUNK_RESERVE_MS = 15_000;
/** A claimed row, or a lease, older than this belongs to a dead run. */
export const STALE_MS = 180_000;
/** A send still getting ready after this long is closed (nobody was sent it). */
export const PREPARE_STALE_MS = 600_000;
/** Sends this small run one tick inside the request. */
export const INLINE_MAX = 50;
export const INLINE_BUDGET_MS = 20_000;
/** On the SendGrid client, for every sender. */
export const SENDGRID_TIMEOUT_MS = 8_000;
/**
 * The tick route's hard stop on Vercel, in seconds. nuxt.config.ts gives
 * `/api/email/cron/continue-sends` its own function with this `maxDuration`;
 * a test pins STALE_MS >= 3 × this.
 */
export const TICK_MAX_DURATION_S = 60;
/** Rows per createItems at enqueue (one Directus transaction each). */
export const SNAPSHOT_BATCH = 500;
/** Failures kept on `hoa_emails.send_errors`. */
export const SEND_ERRORS_MAX = 20;
