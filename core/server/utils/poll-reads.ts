/**
 * The read behind GET /api/org/polls, as batch specs.
 *
 * The route used to ask getPollAccess (the caller's memberships, then their
 * teams, restrictions and area grants: two requests) and then read the polls:
 * three requests after the slug lookup. Directus serves requests one after
 * another (~40ms of CPU each), so the polls now ride in one batch with the
 * caller's access snapshot.
 *
 * Which statuses the caller may see depends on that access (a draft is for
 * whoever can run polls), and the read is limited to 100 rows, so reading
 * every requested status and dropping drafts afterwards could return fewer
 * rows than the old read. The batch carries both reads instead: every
 * requested status, and, when drafts were requested, the same read without
 * them. The access answer picks one; a caller who may not read gets neither.
 */
import type { BatchSpec } from "./directus-graphql";

export const POLL_FIELDS = [
  "id",
  "status",
  "title",
  "description",
  "options",
  "allow_multiple",
  "is_anonymous",
  "closes_at",
  "target_audience",
  "organization",
  "date_created",
] as const;

/**
 * The route's read for these statuses: the same filter, fields, sort and
 * limit. `org` names the community: by id unless given (by slug, when the
 * route reads with batchWithAccessSnapshotBySlug).
 */
export function pollListSpec(orgId: string, statuses: readonly string[], org: Record<string, unknown> = { _eq: orgId }): BatchSpec {
  return {
    collection: "hoa_polls",
    filter: { organization: org, status: { _in: [...statuses] } },
    fields: [...POLL_FIELDS],
    sort: ["-date_created"],
    limit: 100,
  };
}

export type PollListKey = "polls_all" | "polls_public";

/**
 * The reads for `requested`: `polls_all` with every requested status and,
 * only when that includes a draft and something else, `polls_public` without
 * drafts. No status, no read.
 */
export function pollListSpecs(
  orgId: string,
  requested: readonly string[],
  org: Record<string, unknown> = { _eq: orgId }
): Partial<Record<PollListKey, BatchSpec>> {
  const specs: Partial<Record<PollListKey, BatchSpec>> = {};
  if (!requested.length) return specs;
  specs.polls_all = pollListSpec(orgId, requested, org);
  const publicStatuses = requested.filter((s) => s !== "draft");
  if (publicStatuses.length && publicStatuses.length !== requested.length) {
    specs.polls_public = pollListSpec(orgId, publicStatuses, org);
  }
  return specs;
}

/**
 * The rows the old read would have returned for `visible` (visibleStatusesFor's
 * answer): `polls_all` when nothing was dropped, `polls_public` when drafts
 * were, none when nothing is visible.
 */
export function pollListRowsFor(
  rows: Partial<Record<PollListKey, any[]>>,
  requested: readonly string[],
  visible: readonly string[]
): any[] {
  if (!visible.length) return [];
  if (visible.length === requested.length) return rows.polls_all ?? [];
  return rows.polls_public ?? [];
}
