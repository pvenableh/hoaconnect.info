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
 *
 * **One Directus request** (readItemsBatch), since Directus serves requests in
 * turn. The caller's hats come from the community's memberships, read in the
 * same request as the entries (orgHatsFrom), so the tiers are not known while
 * reading. There are only two tier sets (visibility.ts: members see owners;
 * admins, the board and managers see owners and board), so the page is read
 * for each and only the caller's is returned — never the other. The total and
 * the type chips come from one count grouped by event type and tier, summed
 * over the caller's tiers. The memberships read also resolves a slug.
 */

import { descriptorFor, eventTypesInCategory } from "#core/shared/ledger/events";
import type { LedgerCategory } from "#core/shared/ledger/events";
import { NO_ACCESS, visibilityFilter, visibleTiersFor } from "#core/shared/ledger/visibility";
import type { LedgerViewer } from "#core/shared/ledger/visibility";
import type { BatchSpec } from "#core/server/utils/directus-graphql";

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

/** Every tier set visibility.ts can hand out, keyed for lookup. The page is read for each. */
const TIER_SETS = [
  visibilityFilter({ ...NO_ACCESS, isMember: true }),
  visibilityFilter({ ...NO_ACCESS, isAdmin: true }),
].filter((f): f is NonNullable<typeof f> => !!f);
const tiersKey = (tiers: readonly string[]) => [...tiers].sort().join(",");

export default defineEventHandler(async (event) => {
  await requireUserSession(event);
  const query = getQuery(event);

  // Takes a slug OR an id. Both ledger surfaces live under `/{slug}/`, and the
  // selected org resets to the user's first membership on a hard navigation —
  // resolving from the URL means the page a member bookmarked shows the
  // community they were looking at rather than a different one they belong to.
  const idArg = query.orgId ? String(query.orgId).trim() : "";
  const slug = idArg ? "" : String(query.slug || "").trim();
  if (!idArg && !slug) {
    throw createError({ statusCode: 400, statusMessage: "orgId or slug is required" });
  }
  // Every read names the community by id, or through its slug.
  const org = idArg ? { _eq: idArg } : { slug: { _eq: slug } };

  // The entries' own filter, before tiers: dates, and a category or one type.
  const base: Record<string, any> = { organization: org };
  if (query.from || query.to) {
    base.occurred_at = {};
    if (query.from) base.occurred_at._gte = String(query.from);
    if (query.to) base.occurred_at._lte = String(query.to);
  }
  // A category filter becomes a list of event types, so the client sends the
  // lens a person picked ("Money") and the server never has to know how the
  // chips were rendered. An unknown category must match nothing rather than
  // everything — a typo in a query string should not quietly widen a read.
  let typeFilter: { _in: readonly string[] } | { _eq: string } | null = null;
  if (query.category) {
    const types = eventTypesInCategory(String(query.category) as LedgerCategory);
    typeFilter = { _in: types.length ? types : ["__none__"] };
  }
  if (query.eventType) typeFilter = { _eq: String(query.eventType) };
  const entryFilter = typeFilter ? { ...base, event_type: typeFilter } : base;

  const limit = Math.min(Math.max(Number(query.limit) || 50, 1), 200);
  const offset = Math.max(Number(query.offset) || 0, 0);
  const page = (tiers: Record<string, unknown>) => ({
    collection: "org_audit_log",
    filter: { ...entryFilter, ...tiers },
    sort: ["-occurred_at"],
    fields: FIELDS,
    limit,
    offset,
  });

  const read = await readItemsBatch({
    members: { ...orgMembersSpec(""), filter: { organization: org }, fields: [...orgMembersSpec("").fields, "organization"] },
    ...(slug ? { org: { collection: "hoa_organizations", filter: { slug: { _eq: slug } }, fields: ["id"], limit: 1 } } : {}),
    ...Object.fromEntries(TIER_SETS.map((t, i) => [`page${i}`, page(t)])),
    // The filter vocabulary is counted against everything this viewer may
    // see — NOT the current page and NOT the current category, so the chips
    // stay put while someone clicks between them — and the total against the
    // category too: one count by type and tier gives both, for either tier set.
    counts: { collection: "org_audit_log", count: "*", groupBy: ["event_type", "visibility"], filter: base, limit: -1 },
  } as Record<string, BatchSpec>);

  const orgId = idArg || String(read.org?.[0]?.id ?? "");
  if (!orgId) {
    throw createError({ statusCode: 400, statusMessage: "orgId or slug is required" });
  }

  // Every hat the caller wears in THIS org. Resolved here, judged there.
  const members = read.members ?? [];
  const hats = await orgHatsFrom(event, members, seatsOfMembers(members, orgId));
  const viewer: LedgerViewer = {
    isAdmin: hats.isAdmin,
    isMember: hats.isMember,
    isBoard: hats.isBoard,
    isManager: hats.managerGrants !== null,
  };

  const tierFilter = visibilityFilter(viewer);
  if (!tierFilter) {
    throw createError({
      statusCode: 403,
      statusMessage: "This community's ledger is for its members.",
    });
  }
  const tiers = visibleTiersFor(viewer);
  const at = TIER_SETS.findIndex((t) => tiersKey(t.visibility._in) === tiersKey(tiers));
  // A tier set this route did not foresee is read on its own, never borrowed from another.
  const entries =
    at >= 0 ? read[`page${at}`] ?? [] : (await readItemsBatch({ p: page(tierFilter) })).p;

  const counts = (read.counts ?? []).filter((r) => tiers.includes(r?.visibility));
  const matchesType = (t: string) => (!typeFilter ? true : "_eq" in typeFilter ? t === typeFilter._eq : typeFilter._in.includes(t));
  const total = counts.reduce((n, r) => n + (matchesType(String(r?.event_type ?? "")) ? Number(r?.count ?? 0) || 0 : 0), 0);
  const byType = new Map<string, number>();
  for (const r of counts) {
    const key = String(r?.event_type ?? "");
    byType.set(key, (byType.get(key) ?? 0) + (Number(r?.count ?? 0) || 0));
  }

  const types = [...byType]
    .map(([key, count]) => {
      const d = descriptorFor(key);
      return { key, label: d.label, category: d.category, icon: d.icon, count };
    })
    .filter((t) => t.key)
    .sort((a, b) => b.count - a.count);

  return {
    entries,
    total,
    limit,
    offset,
    types,
    viewer: {
      tiers,
      // What the UI needs to explain itself: a member who can only see
      // owner-visible entries should be TOLD that, not left wondering whether
      // their community has been quiet.
      seesBoardOnly: viewer.isAdmin || viewer.isBoard || viewer.isManager,
    },
  };
});
