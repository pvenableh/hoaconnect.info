/**
 * A send that failed, for the admin looking at it (2026-11-12): why it failed,
 * who can be tried again, and whether the email may be removed.
 *
 * Until now a failed send showed "Failed" and nothing else. The reason was
 * stored (each row's `error_message`), but only as a tooltip on the chip; there
 * was no way to try again, and no way to take the email off the list.
 *
 * - The reason: the rows' messages, grouped, most common first.
 * - Trying again: like "Resend to the unknown" (resend-unknown.ts), it is a NEW
 *   DRAFT for just the members whose row failed. Nothing is sent until the
 *   admin reviews it, so every send rule applies again. A failed row was
 *   refused by SendGrid, so unlike an unknown one nobody gets the email twice.
 * - Removing: only an email that reached nobody. A send with one accepted
 *   message is a record of what a member was told, and stays.
 *
 * Pure, so the routes and the pages agree.
 */

export interface FailedRowLike {
  status?: string | null;
  /** `member` (one person) or `copy` (the cc/bcc message). */
  kind?: string | null;
  member?: string | { id?: string | null } | null;
  error_message?: string | null;
}

export interface FailureReason {
  reason: string;
  count: number;
  /** What the reason means for the person reading it, when we can tell. */
  hint: string | null;
}

const NO_REASON = "No reason was recorded.";

/** What a provider's message means in plain words; null when it isn't one we know. */
export function failureHint(reason: string): string | null {
  const r = reason.toLowerCase();
  if (r.includes("template_id")) return "The server's SendGrid template ID isn't valid. This is a setup problem, not a problem with these addresses.";
  if (/^(401|403)\b/.test(r) || r.includes("api key") || r.includes("authorization")) {
    return "SendGrid refused the server's API key. This is a setup problem, not a problem with these addresses.";
  }
  if (r.includes("verified sender") || r.includes("sender identity") || r.includes("from address")) {
    return "SendGrid doesn't accept the address this community sends from. Check the sender in Settings.";
  }
  if (/^429\b/.test(r) || r.includes("rate limit")) return "SendGrid was asked to send too much at once. Trying again later usually works.";
  if (/^5\d\d\b/.test(r)) return "SendGrid had a problem of its own. Trying again later usually works.";
  if (r.includes("does not contain a valid address") || r.includes("invalid email")) return "The address isn't a valid email address. Fix it on the Members page.";
  return null;
}

/** The failed rows' reasons, grouped, most common first. */
export function summarizeFailures(rows: FailedRowLike[]): FailureReason[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (row.status !== "failed") continue;
    const reason = (row.error_message || "").trim() || NO_REASON;
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([reason, count]) => ({ reason, count, hint: reason === NO_REASON ? null : failureHint(reason) }))
    .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason));
}

export interface FailedRetryPlan {
  /** Members whose row failed. */
  memberIds: string[];
  /** Failed rows a retry cannot target: the cc/bcc copy, or no member on the row. */
  notRetryable: number;
}

const memberId = (m: FailedRowLike["member"]): string | null => (typeof m === "string" ? m : (m?.id ?? null));

export function planFailedRetry(rows: FailedRowLike[]): FailedRetryPlan {
  const ids = new Set<string>();
  let notRetryable = 0;
  for (const row of rows) {
    if (row.status !== "failed") continue;
    const id = row.kind === "copy" ? null : memberId(row.member);
    if (id) ids.add(id);
    else notRetryable++;
  }
  return { memberIds: [...ids], notRetryable };
}

/** Rows that mean SendGrid took (or may have taken) the message for someone. */
const REACHED = new Set(["sent", "delivered", "bounced", "unknown", "claimed"]);

/**
 * May this email be removed? A draft always. A failed send only when no row of
 * any of its occurrences was accepted, or might have been.
 */
export function canRemoveEmail(status: string | null | undefined, rows: Array<{ status?: string | null }>): boolean {
  if (status === "draft") return true;
  if (status !== "failed") return false;
  return !rows.some((r) => REACHED.has(String(r.status)));
}
