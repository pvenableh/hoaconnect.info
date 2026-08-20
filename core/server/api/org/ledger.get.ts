/**
 * GET /api/org/ledger?slug=…|orgId=…&category=&eventType=&from=&to=&limit=&offset=
 *
 * The Community Ledger, read back.
 *
 * Phase 4 gave `org_audit_log` a writer and nobody who could see it. This is the
 * other half: the community's own record of itself, newest first, in the tiers
 * the caller is entitled to.
 *
 * **The visibility decision is not made here.** It is made by
 * `core/shared/ledger/visibility.ts`, which returns the tiers this viewer may
 * read, and the tiers go into the Directus filter — so a member's page 2 is
 * their own page 2 rather than the board's page 2 with holes punched in it.
 * Post-filtering a page would make every count and every offset lie. If that
 * module ever says "no tiers", this route closes the door with a 403 rather
 * than returning an empty feed: a stranger should not be told that a community
 * has no history, only that it is not theirs to read.
 *
 * Hard-scoped to one organization in every branch, like every other org route.
 */

import { aggregate, readItems } from "@directus/sdk";
import { descriptorFor, eventTypesInCategory } from "#core/shared/ledger/events";
import type { LedgerCategory } from "#core/shared/ledger/events";
import { visibilityFilter, visibleTiersFor } from "#core/shared/ledger/visibility";
import type { LedgerViewer } from "#core/shared/ledger/visibility";

/** Slug → id, or "" when there is no such community. */
async function orgIdForSlug(slug: string): Promise<string> {
  if (!slug) return "";
  const rows = (await getTypedDirectus().request(
    readItems("hoa_organizations", {
      filter: { slug: { _eq: slug } },
      fields: ["id"] as any,
      limit: 1,
    })
  )) as any[];
  return String(rows?.[0]?.id ?? "");
}

const FIELDS = [
  "id",
  "event_type",
  "occurred_at",
  "actor_user",
  "actor_name",
  "actor_email",
  "visibility",
  "summary",
  "payload",
  "schema_version",
] as const;

export default defineEventHandler(async (event) => {
  await requireUserSession(event);
  const query = getQuery(event);

  // Takes a slug OR an id. Both ledger surfaces live under `/{slug}/`, and the
  // selected org resets to the user's first membership on a hard navigation —
  // resolving from the URL means the page a member bookmarked shows the
  // community they were looking at rather than a different one they belong to.
  const orgId = query.orgId
    ? String(query.orgId).trim()
    : await orgIdForSlug(String(query.slug || "").trim());
  if (!orgId) {
    throw createError({ statusCode: 400, statusMessage: "orgId or slug is required" });
  }

  // Every hat the caller wears in THIS org. Resolved here, judged there.
  const [admin, membership, boardTitle, grants] = await Promise.all([
    checkAdminAccess(event, orgId),
    checkMembership(event, orgId),
    getBoardPosition(event, orgId),
    getManagerGrants(event, orgId),
  ]);

  const viewer: LedgerViewer = {
    isAdmin: admin.isAdmin === true,
    isMember: membership.isMember === true,
    isBoard: boardTitle !== null,
    isManager: grants !== null,
  };

  const tierFilter = visibilityFilter(viewer);
  if (!tierFilter) {
    throw createError({
      statusCode: 403,
      statusMessage: "This community's ledger is for its members.",
    });
  }

  const filter: Record<string, any> = {
    organization: { _eq: orgId },
    ...tierFilter,
  };

  // A category filter becomes a list of event types, so the client sends the
  // lens a person picked ("Money") and the server never has to know how the
  // chips were rendered.
  if (query.category) {
    const types = eventTypesInCategory(String(query.category) as LedgerCategory);
    // An unknown category must match nothing rather than everything — a typo in
    // a query string should not quietly widen a read.
    filter.event_type = { _in: types.length ? types : ["__none__"] };
  }
  if (query.eventType) filter.event_type = { _eq: String(query.eventType) };

  if (query.from || query.to) {
    filter.occurred_at = {};
    if (query.from) filter.occurred_at._gte = String(query.from);
    if (query.to) filter.occurred_at._lte = String(query.to);
  }

  const limit = Math.min(Math.max(Number(query.limit) || 50, 1), 200);
  const offset = Math.max(Number(query.offset) || 0, 0);

  const directus = getTypedDirectus();

  const [rows, totals, byType] = await Promise.all([
    directus.request(
      readItems("org_audit_log", {
        filter,
        sort: ["-occurred_at"],
        fields: FIELDS as unknown as string[],
        limit,
        offset,
      } as any)
    ) as Promise<any[]>,
    directus.request(
      aggregate("org_audit_log", {
        aggregate: { count: "*" },
        query: { filter },
      } as any)
    ) as Promise<any[]>,
    // The filter vocabulary, counted against everything this viewer may see —
    // NOT against the current page and NOT against the current category, so the
    // chips stay put while someone clicks between them. Deliberately ignores the
    // category/type filter and keeps the tier and date scope.
    directus.request(
      aggregate("org_audit_log", {
        aggregate: { count: "*" },
        groupBy: ["event_type"],
        query: {
          filter: {
            organization: { _eq: orgId },
            ...tierFilter,
            ...(filter.occurred_at ? { occurred_at: filter.occurred_at } : {}),
          },
        },
      } as any)
    ) as Promise<any[]>,
  ]);

  const types = (byType ?? [])
    .map((r) => {
      const key = String(r?.event_type ?? "");
      const d = descriptorFor(key);
      return { key, label: d.label, category: d.category, icon: d.icon, count: Number(r?.count ?? 0) || 0 };
    })
    .filter((t) => t.key)
    .sort((a, b) => b.count - a.count);

  return {
    entries: rows ?? [],
    total: Number(totals?.[0]?.count ?? 0) || 0,
    limit,
    offset,
    types,
    viewer: {
      tiers: visibleTiersFor(viewer),
      // What the UI needs to explain itself: a member who can only see
      // owner-visible entries should be TOLD that, not left wondering whether
      // their community has been quiet.
      seesBoardOnly: viewer.isAdmin || viewer.isBoard || viewer.isManager,
    },
  };
});
