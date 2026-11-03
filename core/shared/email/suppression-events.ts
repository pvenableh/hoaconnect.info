/**
 * What a SendGrid event asks of the member it is about (Earnest parity round 3,
 * Phase 3a; ported from Earnest's `sendgrid-event-store.ts` `eventAction()`).
 *
 *   bounce, type "bounce", classification Invalid Address / Mailbox Unavailable
 *     / none                                       → the address is dead: email_bounced
 *   dropped, reason "Bounced Address"              → SendGrid already knows it is dead
 *   spamreport / unsubscribe / group_unsubscribe   → community opt-out
 *
 * Everything else does nothing — in particular a `blocked` bounce
 * (`type: "blocked"`) and the Reputation / Content / Technical / Frequency
 * classifications: those say our mail was refused, not that the mailbox is
 * gone, and marking a good address dead over one would silence a resident's
 * dues notices on the strength of somebody else's spam.
 *
 * Pure: the webhook route applies the action; the table is pinned in tests.
 */

import type { OptOutSource } from "./email-class";

export interface SuppressionEventFields {
  event?: string | null;
  /** `bounce` events: "bounce" (permanent) or "blocked" (temporary/refused). */
  type?: string | null;
  bounce_classification?: string | null;
  reason?: string | null;
}

/** Bounce classifications that mean the mailbox is gone, not that our mail was refused. */
const DEAD_ADDRESS: ReadonlySet<string> = new Set(["Invalid Address", "Mailbox Unavailable"]);

/** SendGrid spells the spam event `spamreport`; this app's activity enum stores `spam_report`. */
const SPAM_EVENTS: ReadonlySet<string> = new Set(["spamreport", "spam_report"]);
const UNSUBSCRIBE_EVENTS: ReadonlySet<string> = new Set(["unsubscribe", "group_unsubscribe"]);

export type SuppressionAction =
  | { kind: "bounced"; reason: string }
  | { kind: "opt_out"; source: OptOutSource };

export function eventAction(e: SuppressionEventFields): SuppressionAction | null {
  const event = (e.event || "").trim();

  if (event === "bounce") {
    if (e.type !== "bounce") return null;
    const classification = (e.bounce_classification || "").trim();
    if (classification && !DEAD_ADDRESS.has(classification)) return null;
    return { kind: "bounced", reason: bounceReason(e, classification) };
  }

  if (event === "dropped") {
    return (e.reason ?? "").trim().toLowerCase() === "bounced address"
      ? { kind: "bounced", reason: "Bounced Address (dropped)" }
      : null;
  }

  if (SPAM_EVENTS.has(event)) return { kind: "opt_out", source: "spam" };
  if (UNSUBSCRIBE_EVENTS.has(event)) return { kind: "opt_out", source: "link" };
  return null;
}

/** A short, human reason for the Members chip: the classification, then SendGrid's text. */
function bounceReason(e: SuppressionEventFields, classification: string): string {
  const detail = (e.reason || "").trim().replace(/\s+/g, " ");
  const head = classification || "Bounced";
  const full = detail ? `${head}: ${detail}` : head;
  return full.length > 240 ? `${full.slice(0, 237)}…` : full;
}
