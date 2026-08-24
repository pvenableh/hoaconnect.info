/**
 * Earned trust — the arithmetic behind "you have approved a lot of these; would
 * you like the assistant to handle them itself?"
 *
 * Two things about this module matter more than the numbers in it.
 *
 * **It suggests; it never sets.** Every function here returns a recommendation.
 * Raising the dial stays a deliberate act performed through the existing
 * `POST /api/ai/autonomy` route, by an administrator, on purpose. Nothing in
 * Phase 5 writes `ai_autonomy_tier`. A system that quietly widens its own
 * permissions because you were agreeable is not trusted, it is unsupervised.
 *
 * **The streak is per PERSON; the dial is per ORG.** Autonomy in an HOA is a
 * property of the association — an action the assistant takes is an act of the
 * association, its audit trail is org-level, and two admins cannot sensibly run
 * different tiers against one community. But *earning* is personal: it is Nina
 * who has approved nine proposals without rejecting one, and it is Nina the
 * nudge should be shown to. So the streak is counted against `approved_by`, and
 * what it produces is a sentence for that person suggesting the association's
 * dial could move.
 *
 * The outbound cap is untouched and tier-independent — `shouldAutoApprove()` in
 * `actions.ts` refuses outbound work at every tier including 3, and no amount of
 * earned trust reaches it. Nothing here can change that; this file only ever
 * proposes a number between 0 and 3 for a human to consider.
 */

import { clampAutonomyTier, AUTONOMY_TIERS, type AutonomyTier } from "./actions";

/**
 * Clean approvals needed to earn each tier. Deliberately steep at the top: tier
 * 1 is "you clearly want the small stuff handled" after a few decisions, but
 * tier 3 — every internal action, unattended — asks for a substantial history
 * first.
 */
export const TRUST_MILESTONES: { count: number; tier: AutonomyTier }[] = [
  { count: 3, tier: 1 },
  { count: 10, tier: 2 },
  { count: 25, tier: 3 },
];

/**
 * A streak only counts as clean while approvals outweigh rejections at least
 * two to one. Someone who approves thirty proposals and rejects twenty is not
 * demonstrating trust in the assistant's judgement — they are correcting it,
 * frequently, and that is the opposite signal.
 */
export const CLEAN_RATIO = 2;

export interface TrustStats {
  /** Proposals this person approved that then executed cleanly. */
  approved: number;
  /** Proposals this person rejected. */
  rejected: number;
}

export interface TrustNudge {
  /** Whether to show a suggestion at all. */
  suggest: boolean;
  /** The tier this person's history has earned (never below the current one). */
  earnedTier: AutonomyTier;
  /** The milestone crossed, for the copy ("after 10 clean approvals"). */
  milestone: number | null;
  /** One sentence, ready to render. Empty when `suggest` is false. */
  reason: string;
}

/** Whether the ratio gate is open. Zero rejections is clean by definition. */
export function isCleanRecord(stats: TrustStats): boolean {
  const approved = Math.max(0, Math.trunc(stats.approved || 0));
  const rejected = Math.max(0, Math.trunc(stats.rejected || 0));
  if (rejected === 0) return approved > 0;
  return approved >= CLEAN_RATIO * rejected;
}

/** The highest tier this record has earned, ignoring where the dial sits now. */
export function earnedTier(stats: TrustStats): AutonomyTier {
  if (!isCleanRecord(stats)) return 0;
  const approved = Math.max(0, Math.trunc(stats.approved || 0));
  let tier: AutonomyTier = 0;
  for (const m of TRUST_MILESTONES) {
    if (approved >= m.count) tier = m.tier;
  }
  return tier;
}

/** The milestone `approved` most recently crossed, or null below the first. */
export function milestoneReached(approved: number): number | null {
  const n = Math.max(0, Math.trunc(approved || 0));
  let hit: number | null = null;
  for (const m of TRUST_MILESTONES) {
    if (n >= m.count) hit = m.count;
  }
  return hit;
}

/**
 * Should this person be invited to raise the association's dial, and to what?
 *
 * Returns `suggest: false` whenever the record is not clean, the earned tier is
 * no higher than the org already runs, or the dial is already at 3. The caller
 * decides whether the viewer is even allowed to change it — a board member sees
 * their own streak, but only an administrator can act on the suggestion.
 */
export function trustNudge(stats: TrustStats, currentTier: unknown): TrustNudge {
  const current = clampAutonomyTier(currentTier);
  const earned = earnedTier(stats);
  const none: TrustNudge = { suggest: false, earnedTier: earned, milestone: null, reason: "" };

  if (earned <= current) return none;

  const milestone = milestoneReached(stats.approved);
  if (milestone == null) return none;

  const label = AUTONOMY_TIERS.find((t) => t.tier === earned)?.label ?? `level ${earned}`;
  return {
    suggest: true,
    earnedTier: earned,
    milestone,
    reason:
      `You have approved ${milestone} of the assistant's proposals without a change of mind. ` +
      `The association's dial could move to “${label}” — resident- and board-facing actions ` +
      `would still wait for a person, at every level.`,
  };
}
