/**
 * The reads behind GET /api/ai/actions/trust, as batch specs.
 *
 * The route checked the caller's standing, then read the community's
 * autonomy tier, then counted the caller's executed and rejected approvals:
 * four requests in three rounds, and Directus serves requests in turn (~40ms
 * of CPU each). These three reads ride with the access snapshot as ONE
 * request (batchWithAccessSnapshot); the route still refuses before it
 * returns any of them.
 */
import type { BatchSpec } from "./directus-graphql";
import { autonomyTierSpec } from "./ai-action-reads";

export type TrustKey = "tr_org" | "tr_approved" | "tr_rejected";

/** One status's count, as the route's aggregate read it. */
const countOf = (orgId: string, userId: string, status: string): BatchSpec => ({
  collection: "ai_actions",
  count: "*",
  filter: {
    _and: [{ organization: { _eq: orgId } }, { approved_by: { _eq: userId } }, { status: { _eq: status } }],
  },
});

/** The community's tier (as getOrgAutonomyTier reads it) and the caller's two counts. */
export function trustSpecs(orgId: string, userId: string): Record<TrustKey, BatchSpec> {
  return {
    tr_org: autonomyTierSpec(orgId),
    tr_approved: countOf(orgId, userId, "executed"),
    tr_rejected: countOf(orgId, userId, "rejected"),
  };
}
