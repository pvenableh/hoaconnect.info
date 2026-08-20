/**
 * Who may read, run and vote in a community's polls — decided once.
 *
 * Three routes need this answer (the list, one poll's results, closing one) and
 * a page needs to render from it. Written as a pure function for the same
 * reason `core/shared/ledger/visibility.ts` is: a rule that lives in each
 * caller is a rule that is one forgotten `if` away from being wrong somewhere.
 *
 * The interesting party is the property manager. Their Directus role policy has
 * no `hoa_polls` at all, deliberately — a role permission is identical across
 * every community that manager works for, and no admin can switch it off. The
 * per-manager `feedback` grant is the switch that can, so it is the thing this
 * module reads.
 *
 * **`canVote` is not `canManage`, and the gap is the point.** A manager may be
 * trusted to run a community's polls without being a member of the community,
 * and someone with no seat has no ballot. Being able to close a vote is not
 * being entitled to cast one — the opposite mistake would quietly let a
 * management company put its own thumb on a community's decisions.
 *
 * Pure: no Directus, no H3, no clock.
 */

/** The hats a caller wears in ONE organization. Assembled by the server util. */
export interface PollViewerHats {
  readonly isAdmin: boolean;
  readonly isBoard: boolean;
  /** Has an active seat in this community. */
  readonly isMember: boolean;
  /** An active property manager holding THIS community's `feedback` grant. */
  readonly hasFeedbackGrant: boolean;
}

export interface PollAccess extends PollViewerHats {
  /** May see the community's polls at all. */
  readonly canRead: boolean;
  /** May create, close and reopen them. */
  readonly canManage: boolean;
  /** May cast a vote — membership, not authority. */
  readonly canVote: boolean;
  /** Reading purely on a manager grant, with no seat and no office. */
  readonly viaGrant: boolean;
}

export const NO_POLL_ACCESS: PollAccess = {
  isAdmin: false,
  isBoard: false,
  isMember: false,
  hasFeedbackGrant: false,
  canRead: false,
  canManage: false,
  canVote: false,
  viaGrant: false,
};

export function decidePollAccess(hats: PollViewerHats): PollAccess {
  const { isAdmin, isBoard, isMember, hasFeedbackGrant } = hats;
  return {
    isAdmin,
    isBoard,
    isMember,
    hasFeedbackGrant,
    canRead: isAdmin || isBoard || isMember || hasFeedbackGrant,
    canManage: isAdmin || isBoard || hasFeedbackGrant,
    canVote: isMember,
    viaGrant: !isAdmin && !isBoard && hasFeedbackGrant,
  };
}

/**
 * The statuses a caller may see.
 *
 * A draft is a poll the community has not been asked yet — it belongs to
 * whoever can put it to them, not to everyone who can read results.
 */
export function visibleStatusesFor(
  access: PollAccess,
  requested: readonly string[]
): string[] {
  return access.canManage ? [...requested] : requested.filter((s) => s !== "draft");
}
