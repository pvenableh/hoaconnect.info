/**
 * Auto-pause for a send (Earnest parity round 3, Phase 4; Earnest's
 * `send-health.ts`, scaled to an HOA). After each run of an unfinished send the
 * tick counts the occurrence's SendGrid events and holds them to these lines.
 * Over one, the email moves `sending` → `paused`: the tick only runs `sending`
 * emails, so nobody else gets it until an admin resumes it.
 *
 * Shared because the progress route, the send dialog and the detail page say
 * the same sentence the notification does.
 *
 * Counted per occurrence (`run_key`):
 *   delivered     `delivered` events
 *   hardBounces   `bounce` events that are not `blocked` (SendGrid's temporary
 *                 refusal), plus `dropped` for "Bounced Address"
 *   spamReports   `spamreport` events
 *
 * A hard bounce is judged against everything that had an outcome (delivered or
 * hard-bounced); a spam report against what was delivered. Nothing is judged
 * before `minOutcomes` outcomes: three bounces in the first twenty is noise.
 */

export const SEND_HEALTH = {
  /** Earnest uses 1,000; an HOA's whole list is often a few hundred. */
  minOutcomes: 50,
  hardBounceRate: 0.08,
  spamRate: 0.005,
} as const;

export type SendHealthRules = { minOutcomes: number; hardBounceRate: number; spamRate: number };

export interface SendEventCounts {
  delivered: number;
  hardBounces: number;
  spamReports: number;
}

export type PauseReason = "bounces" | "spam";

export interface PauseVerdict {
  pause: boolean;
  reason: PauseReason | null;
  /** delivered + hard bounces */
  outcomes: number;
  bounceRate: number;
  spamRate: number;
  counts: SendEventCounts;
}

/**
 * The record a pause (and a resume) leaves in `hoa_emails.send_errors`, as
 * `{ health: HealthRecord }`. Completion replaces it with the failure list, so
 * it lives exactly as long as the occurrence; `runKey` makes sure a record of
 * an earlier occurrence of a recurring email is never read as this one's.
 */
export interface HealthRecord {
  state: "paused" | "resumed";
  reason: PauseReason | null;
  /** ISO: when it paused, or resumed. */
  at: string;
  runKey: string;
  /** The counts when it paused. */
  counts: SendEventCounts;
  /** Set by Resume: the counts at that moment. Only events after it count. */
  baseline?: SendEventCounts | null;
  sentence?: string | null;
}

export const ZERO_EVENTS: SendEventCounts = { delivered: 0, hardBounces: 0, spamReports: 0 };

/** The counts after a baseline (Resume): only new events are judged. */
export function eventsSince(c: SendEventCounts, base?: SendEventCounts | null): SendEventCounts {
  if (!base) return c;
  return {
    delivered: Math.max(0, c.delivered - base.delivered),
    hardBounces: Math.max(0, c.hardBounces - base.hardBounces),
    spamReports: Math.max(0, c.spamReports - base.spamReports),
  };
}

export function pauseVerdict(c: SendEventCounts, rules: SendHealthRules = SEND_HEALTH): PauseVerdict {
  const outcomes = c.delivered + c.hardBounces;
  const bounceRate = outcomes ? c.hardBounces / outcomes : 0;
  const spamRate = c.delivered ? c.spamReports / c.delivered : 0;
  const base = { outcomes, bounceRate, spamRate, counts: c };
  if (outcomes < rules.minOutcomes) return { pause: false, reason: null, ...base };
  if (bounceRate >= rules.hardBounceRate) return { pause: true, reason: "bounces", ...base };
  if (spamRate >= rules.spamRate) return { pause: true, reason: "spam", ...base };
  return { pause: false, reason: null, ...base };
}

const pct = (r: number) => {
  const p = r * 100;
  return `${p >= 10 || Number.isInteger(p) ? Math.round(p) : p.toFixed(1)}%`;
};

/** The short reason after "Paused · ". */
export function pauseReasonLabel(reason: PauseReason | null | undefined): string {
  if (reason === "bounces") return "too many bounces";
  if (reason === "spam") return "spam complaints";
  return "on hold";
}

/** One sentence for the notification, the dialog and the detail page. */
export function pauseSentence(v: Pick<PauseVerdict, "reason" | "outcomes" | "bounceRate" | "spamRate" | "counts">, rules: SendHealthRules = SEND_HEALTH): string {
  const rest = "Nobody else gets it until you resume the send.";
  if (v.reason === "spam") {
    const n = v.counts.spamReports;
    return `${n} ${n === 1 ? "person" : "people"} marked it as spam (${pct(v.spamRate)} of ${v.counts.delivered} delivered; the limit is ${pct(rules.spamRate)}). ${rest}`;
  }
  return `${v.counts.hardBounces} of ${v.outcomes} messages bounced (${pct(v.bounceRate)}; the limit is ${pct(rules.hardBounceRate)}). ${rest}`;
}

/** The health record in `send_errors`, if it belongs to this occurrence. */
export function readHealthRecord(sendErrors: unknown, runKey?: string | null): HealthRecord | null {
  let v: any = sendErrors;
  if (typeof v === "string") {
    try {
      v = JSON.parse(v);
    } catch {
      return null;
    }
  }
  const h = v && typeof v === "object" && !Array.isArray(v) ? v.health : null;
  if (!h || typeof h !== "object") return null;
  if (runKey && h.runKey !== runKey) return null;
  return h as HealthRecord;
}
