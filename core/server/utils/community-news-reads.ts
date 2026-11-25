/**
 * The reads behind GET /api/hoa/community-news, as one batch and one read.
 *
 * The route read the community by its slug, then the caller's membership in
 * it, then the emails that reached that membership, then the community's
 * sent emails (public, or one of those): four requests one after another.
 * Directus serves requests in turn (~40ms of CPU each), so the first three
 * now name the community by its slug and the membership by the caller,
 * through relational filters, and go as one batch:
 *
 *   cn_org         the community (two rows read, to notice a slug two share)
 *   cn_members     the caller's active memberships in it
 *   cn_recipients  the emails that reached any of them
 *
 * The feed itself stays the route's own read, by the community's id and
 * those emails' ids: many sent emails have no `sent_at`, and the order
 * Postgres gives those ties (and so which of them a limit keeps) follows the
 * query's plan, which a relational filter would change.
 *
 * The route's rule is per membership (the first the caller has there), so
 * when the caller holds more than one there, or the slug names more than
 * one community, communityNewsAudience answers null and the route reads one
 * by one as before.
 */
import type { BatchSpec } from "./directus-graphql";

export type CommunityNewsKey = "cn_org" | "cn_members" | "cn_recipients";

/** The community statuses the feed reads. */
export const COMMUNITY_NEWS_ORG_STATUSES = ["active", "published"] as const;

const idOf = (v: any): string | null => (v == null ? null : typeof v === "object" ? (v.id ?? null) : String(v));

/** The three reads for `userId` in the community `slug`. */
export function communityNewsSpecs(userId: string, slug: string): Record<CommunityNewsKey, BatchSpec> {
  const org = { slug: { _eq: slug }, status: { _in: [...COMMUNITY_NEWS_ORG_STATUSES] } };
  const member = { user: { _eq: userId }, organization: org, status: { _eq: "active" } };
  return {
    cn_org: { collection: "hoa_organizations", filter: org, fields: ["id"], limit: 2 },
    cn_members: { collection: "hoa_members", filter: member, fields: ["id"], limit: -1 },
    cn_recipients: { collection: "hoa_email_recipients", filter: { member }, fields: ["email"], limit: -1 },
  };
}

/** Whose feed: the community, and the emails that reached the caller there. */
export interface CommunityNewsAudience {
  orgId: string;
  personalIds: string[];
}

/**
 * The audience from the batch's rows; "none" for no community or no
 * membership (the route answers []), null when the rows cannot stand in for
 * the route's reads (a slug two communities share, more than one membership
 * there).
 */
export function communityNewsAudience(rows: Record<CommunityNewsKey, any[]>): CommunityNewsAudience | "none" | null {
  const orgs = rows.cn_org ?? [];
  if (orgs.length > 1) return null;
  const orgId = idOf(orgs[0]);
  if (!orgId) return "none";
  const members = rows.cn_members ?? [];
  if (members.length > 1) return null;
  if (!members.length) return "none";
  const personalIds = Array.from(new Set((rows.cn_recipients ?? []).map((r) => idOf(r?.email)).filter(Boolean))) as string[];
  return { orgId, personalIds };
}
