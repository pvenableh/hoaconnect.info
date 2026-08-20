/**
 * The transition grace window, described in words.
 *
 * `grace_ends_at` is a timestamp; what a board needs is a sentence. Four
 * surfaces have to say the same thing about the same window — the blocked
 * `/subscription-expired` screen, the subscription settings card, the agency
 * dashboard's detach confirmation, and the wizard's result screen — and the
 * failure mode of writing that copy four times is not ugliness, it is four
 * slightly different promises about how long a community keeps working.
 *
 * So the copy lives here, next to the planner whose `TRANSITION_GRACE_DAYS`
 * created the window in the first place, and it is unit-tested for the two
 * things that actually matter: the boundary (a window that closes today is not
 * a window) and the day count an admin will plan around.
 *
 * Pure: the caller supplies `now`, and dates are formatted in UTC so the
 * sentence a board reads matches the instant the entitlement check uses.
 */

export interface GraceDescription {
  /** The window is open: the community is working because of it, right now. */
  readonly active: boolean;
  /** Whole days left, rounded up, floored at zero. What an admin plans around. */
  readonly daysRemaining: number;
  readonly endsOnIso: string;
  /** "September 3, 2026" */
  readonly endsOn: string;
  /** "Sep 3" — for a badge with no room for the rest. */
  readonly endsOnShort: string;
  /** Badge text: short enough to sit beside a status chip. */
  readonly badge: string;
  readonly headline: string;
  readonly detail: string;
}

const DAY_MS = 86_400_000;

function fmt(date: Date, opts: Intl.DateTimeFormatOptions): string {
  return date.toLocaleDateString("en-US", { timeZone: "UTC", ...opts });
}

/**
 * Describe a grace window, or `null` when there is no window at all.
 *
 * A closed window still returns a description rather than `null`: a community
 * that just fell off the end of one needs to be told that is what happened,
 * which is a different screen from a subscription that simply lapsed.
 */
export function describeGrace(
  graceEndsAt: string | null | undefined,
  now: Date = new Date()
): GraceDescription | null {
  if (!graceEndsAt) return null;
  const end = new Date(graceEndsAt);
  if (Number.isNaN(end.getTime())) return null;

  const active = end.getTime() > now.getTime();
  const daysRemaining = Math.max(
    0,
    Math.ceil((end.getTime() - now.getTime()) / DAY_MS)
  );

  const endsOn = fmt(end, { month: "long", day: "numeric", year: "numeric" });
  const endsOnShort = fmt(end, { month: "short", day: "numeric" });

  if (!active) {
    return {
      active: false,
      daysRemaining: 0,
      endsOnIso: end.toISOString(),
      endsOn,
      endsOnShort,
      badge: `Grace period ended ${endsOnShort}`,
      headline: "Your transition grace period has ended",
      detail:
        `Your community kept running after it left its management company's billing account, ` +
        `and that window closed on ${endsOn}. Start a subscription to restore access — and either way, ` +
        `your records are still yours to export.`,
    };
  }

  // "1 day left" reads as urgency; "in 1 day" reads as a schedule. Boards act on
  // the first, so the day count leads.
  const days =
    daysRemaining === 1 ? "1 day left" : `${daysRemaining} days left`;

  return {
    active: true,
    daysRemaining,
    endsOnIso: end.toISOString(),
    endsOn,
    endsOnShort,
    badge: `Grace period · ${days}`,
    headline: "Your community is running on a transition grace period",
    detail:
      `Nothing is switched off. Your community left its management company's billing account and ` +
      `keeps working normally until ${endsOn} (${days}), which is time to choose a new manager or ` +
      `take over the subscription yourselves.`,
  };
}
