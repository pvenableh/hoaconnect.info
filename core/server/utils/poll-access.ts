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
