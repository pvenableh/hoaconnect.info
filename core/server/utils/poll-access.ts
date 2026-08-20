/**
 * The lookups behind `decidePollAccess` — every hat a caller wears in one org.
 *
 * The DECISION lives in `#core/shared/polls/access`, pure and unit-tested
 * across the whole matrix. This file only fetches, so the rule cannot be
 * accidentally rewritten while someone is editing a query.
 */

import type { H3Event } from "h3";
import { decidePollAccess, type PollAccess } from "#core/shared/polls/access";

export async function getPollAccess(event: H3Event, orgId: string): Promise<PollAccess> {
  const [admin, membership, boardTitle, grants] = await Promise.all([
    checkAdminAccess(event, orgId),
    checkMembership(event, orgId),
    getBoardPosition(event, orgId),
    getManagerGrants(event, orgId),
  ]);

  return decidePollAccess({
    isAdmin: admin.isAdmin === true,
    isBoard: boardTitle !== null,
    isMember: membership.isMember === true,
    // `getManagerGrants` returns null for anyone who is not an ACTIVE manager
    // of this org, so an offboarded manager's stale grants cannot reach here.
    hasFeedbackGrant: grants?.feedback === true,
  });
}

/** The read guard, as a throw. */
export async function requirePollAccess(event: H3Event, orgId: string): Promise<PollAccess> {
  const access = await getPollAccess(event, orgId);
  if (!access.canRead) {
    throw createError({
      statusCode: 403,
      statusMessage: "This community's polls are for its members.",
    });
  }
  return access;
}

/**
 * The write guard, as a throw — create, close, reopen.
 *
 * `canManage` is `isAdmin || isBoard || hasFeedbackGrant`, and the page renders
 * its "New poll", "Close" and "Reopen" controls from exactly that. Routes that
 * ask a DIFFERENT question end up refusing an action the UI just offered, which
 * is the bug class `25fa1a8` fixed for voting: `close.post.ts` used
 * `requireAdminOrManagerGrant`, which has no notion of a board officer, so a
 * board member who is not an org admin was shown "Close" and got a 403.
 *
 * One guard for all three, derived from the same function the page renders
 * from, is what keeps that from happening again.
 */
export async function requirePollManage(event: H3Event, orgId: string): Promise<PollAccess> {
  const access = await getPollAccess(event, orgId);
  if (!access.canManage) {
    throw createError({
      statusCode: 403,
      statusMessage: "Only this community's board, its administrators, or a manager it has granted feedback access may run its polls.",
    });
  }
  return access;
}
