/**
 * The attention curve — how loudly a piece of work should ask to be looked at.
 *
 * Ported from Earnest's `useAIProductivityEngine.calculateScore`, unchanged in
 * shape and constants, because the reason it exists transfers exactly.
 *
 * The naive scoring everyone writes first is linear in days-overdue, capped.
 * It has one failure mode and it is fatal: **the oldest thing wins forever.**
 * In Earnest an $165 invoice 547 days late sat at the top of the feed for a
 * year and a half. HOA has the same shape of debt — a member with a small
 * balance from two years ago is not today's work, and a feed that insists it is
 * gets ignored, at which point the genuinely urgent thing beneath it is
 * invisible too.
 *
 * So overdueness rides an ACTIONABLE-WINDOW curve rather than a ramp:
 *
 *   0d ────── 14d ────────── 45d ──────────── 120d ─────────▶
 *   │ ramp up  │  hot, still  │  fade as it     │ stale floor
 *   │ 0.35→1.0 │  recoverable │  goes cold      │ 0.22
 *
 * Past 120 days an item is a write-off decision, not a live action — it stays
 * *visible* (0.22, never zero) but can no longer outrank something a fortnight
 * old that someone could still fix today.
 *
 * Money is log-scaled for the same reason: $200 → ~14, $1k → ~18, $10k → the
 * cap of 22. Real money rises above small money without a cliff at any round
 * number, and no amount alone can carry an item into `urgent`.
 *
 * Pure and framework-free on purpose — the buckets decide which notices the
 * cron is allowed to interrupt someone with, so they are unit-testable in
 * isolation and shared by the server generators, the notices endpoint, and
 * (from Phase 5) the Director layer.
 */

export type AttentionPriority = "urgent" | "high" | "medium" | "low";

/** Every dial, named, so the tests assert against these and not magic numbers. */
export const ATTENTION = {
  /** Where everything starts before any signal is applied. */
  BASE: 40,
  /** Most an overdue item can add, scaled by the window weight below. */
  OVERDUE_WEIGHT: 36,
  /** End of the ramp: overdueness climbs to full weight across two weeks. */
  RAMP_DAYS: 14,
  /** Weight on day one of being overdue. */
  RAMP_FLOOR: 0.35,
  /** End of the hot window: still recoverable, full weight. */
  HOT_DAYS: 45,
  /** End of the decay: past here an item is a write-off decision. */
  COLD_DAYS: 120,
  /** How much of the weight the decay removes between HOT and COLD. */
  DECAY_DEPTH: 0.72,
  /** Visible, never top. */
  STALE_FLOOR: 0.22,
  /** Due today / tomorrow bumps. */
  TODAY: 22,
  TOMORROW: 11,
  /** Something a person can act on, as opposed to a heads-up. */
  ACTION: 8,
  /** Log-scaled money: multiplier and its hard cap. */
  MONEY_MULTIPLIER: 6,
  MONEY_CAP: 22,
  /** Bucket thresholds. */
  URGENT_AT: 82,
  HIGH_AT: 64,
  MEDIUM_AT: 46,
} as const;

export interface AttentionInput {
  /** "action" — something to do — scores above a passive reminder. */
  type?: "action" | "reminder" | string;
  /** Days past due. Zero, negative and undefined all mean "not overdue". */
  daysOverdue?: number;
  /** Dollars at stake, if any. Log-scaled and capped. */
  amount?: number;
  isToday?: boolean;
  isTomorrow?: boolean;
}

/**
 * The window weight for a given overdueness — the whole curve, isolated so the
 * shape can be asserted directly rather than inferred from scores.
 */
export function overdueWeight(daysOverdue: number): number {
  const d = daysOverdue > 0 ? daysOverdue : 0;
  if (d <= 0) return 0;
  if (d <= ATTENTION.RAMP_DAYS) {
    return ATTENTION.RAMP_FLOOR + (d / ATTENTION.RAMP_DAYS) * (1 - ATTENTION.RAMP_FLOOR);
  }
  if (d <= ATTENTION.HOT_DAYS) return 1;
  if (d <= ATTENTION.COLD_DAYS) {
    const span = ATTENTION.COLD_DAYS - ATTENTION.HOT_DAYS;
    return 1 - ((d - ATTENTION.HOT_DAYS) / span) * ATTENTION.DECAY_DEPTH;
  }
  return ATTENTION.STALE_FLOOR;
}

/** 0–100. Impact × how actionable it is right now. */
export function attentionScore(input: AttentionInput): number {
  let score: number = ATTENTION.BASE;

  const d = input.daysOverdue && input.daysOverdue > 0 ? input.daysOverdue : 0;
  if (d > 0) score += Math.round(ATTENTION.OVERDUE_WEIGHT * overdueWeight(d));

  if (input.isToday) score += ATTENTION.TODAY;
  if (input.isTomorrow) score += ATTENTION.TOMORROW;
  if (input.type === "action") score += ATTENTION.ACTION;

  if (input.amount && input.amount > 0) {
    score += Math.min(
      ATTENTION.MONEY_CAP,
      Math.round(Math.log10(input.amount + 1) * ATTENTION.MONEY_MULTIPLIER)
    );
  }

  return Math.max(0, Math.min(100, score));
}

/**
 * Priority follows the score, so a stale, tiny, long-overdue item is no longer
 * "urgent" merely for being late. This is the function the notices cron leans
 * on when it decides what is allowed to reach someone's phone.
 */
export function priorityFromScore(score: number): AttentionPriority {
  if (score >= ATTENTION.URGENT_AT) return "urgent";
  if (score >= ATTENTION.HIGH_AT) return "high";
  if (score >= ATTENTION.MEDIUM_AT) return "medium";
  return "low";
}

/** Score and bucket in one step — what the generators actually call. */
export function attentionPriority(input: AttentionInput): AttentionPriority {
  return priorityFromScore(attentionScore(input));
}

/** Sort order for the four buckets. */
export const PRIORITY_ORDER: Record<AttentionPriority, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
};

/** Whole days between two instants, floored, never negative. */
export function daysBetween(from: Date | string | number, to: Date | string | number): number {
  const a = new Date(from).getTime();
  const b = new Date(to).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(0, Math.floor((b - a) / 86_400_000));
}
