/**
 * GET /api/org/polls?slug=…|orgId=…&statuses=open,closed
 *
 * The community's polls, for whoever is asking.
 *
 * Polls were read straight from Directus by the browser, which serves the
 * people the Directus policies name — members and admins — and silently
 * excludes the one party an admin might want to include: a property manager.
 * Their role policy has no `hoa_polls` at all, and adding it there would be the
 * wrong shape of answer, because a role permission is identical for every
 * community that manager works for and no admin can turn it off.
 *
 * So the decision moves here, next to the per-manager `feedback` grant. A
 * manager sees this community's polls when THIS community's admin has said so,
 * and stops the moment that switch goes off.
 *
 * The route also answers "may I run these?" rather than leaving the page to
 * infer it from roles — the same reason `/api/org/ledger` returns a `viewer`.
 * A page that computes its own permissions is a page that eventually disagrees
 * with the route enforcing them.
 */

import { readItems } from "@directus/sdk";
import { visibleStatusesFor } from "#core/shared/polls/access";

const POLL_FIELDS = [
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

export default defineEventHandler(async (event) => {
  await requireUserSession(event);
  const query = getQuery(event);

  // Takes a slug OR an id. The page lives under `/{slug}/polls` and the
  // client's SELECTED org resets to the user's first membership on a hard
  // navigation — resolving from the URL means a bookmarked page shows the
  // community it names rather than a different one, emptily.
  const orgId = await resolveOrgId({ orgId: query.orgId, slug: query.slug });
  if (!orgId) {
    throw createError({ statusCode: 400, statusMessage: "orgId or slug is required" });
  }

  const access = await requirePollAccess(event, orgId);

  const statuses = String(query.statuses || "open,closed")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const visibleStatuses = visibleStatusesFor(access, statuses);
  if (!visibleStatuses.length) {
    return { polls: [], viewer: viewerOf(access) };
  }

  const polls = (await getTypedDirectus().request(
    readItems("hoa_polls", {
      filter: { organization: { _eq: orgId }, status: { _in: visibleStatuses } },
      fields: POLL_FIELDS as unknown as string[],
      sort: ["-date_created"],
      limit: 100,
    } as any)
  )) as any[];

  return { polls: polls ?? [], viewer: viewerOf(access) };
});

function viewerOf(access: import("#core/shared/polls/access").PollAccess) {
  return {
    canManage: access.canManage,
    canVote: access.canVote,
    /** True only for a manager reading on a grant — the page says so out loud. */
    viaGrant: access.viaGrant,
  };
}
