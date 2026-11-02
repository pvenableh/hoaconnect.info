import { readItems } from "@directus/sdk";
import {
  PER_GROUP,
  buildSearchFilter,
  normalizeQuery,
  searchGroupsFor,
  type SearchGroupResult,
} from "#core/shared/search";

/**
 * GET /api/search?orgId=…&q=… — Spotlight's record search.
 *
 * Org-scoped and capability-filtered: the caller's actor hats for `orgId` pick
 * the groups (`searchGroupsFor` — staff only, then per-group capability), and
 * every query carries the org filter (`buildSearchFilter`). The table and the
 * reasoning live in core/shared/search; this route only runs it.
 *
 * Queries run on the admin token because a board member's Directus role does
 * not read every collection; the org filter is what scopes them, which is why
 * it is built in one place and tested there.
 *
 * One group failing (a collection missing in an older deploy, a field renamed)
 * drops that group, not the response — a search box that 500s on every keystroke
 * because one collection moved is worse than one that finds a little less.
 */
export default defineEventHandler(async (event): Promise<{ groups: SearchGroupResult[] }> => {
  await requireUserSession(event);
  const query = getQuery(event);
  const orgId = String(query.orgId || "");
  if (!orgId) throw createError({ statusCode: 400, message: "orgId is required" });

  const actors = await resolveActors(event, orgId);
  if (!actors.length) throw createError({ statusCode: 403, message: "Not a member of this organization" });

  const q = normalizeQuery(query.q);
  const defs = searchGroupsFor(actors);
  if (!q || !defs.length) return { groups: [] };

  const directus = getTypedDirectus();
  const settled = await Promise.allSettled(
    defs.map(async (def) => {
      const rows = (await directus.request(
        readItems(def.collection as any, {
          filter: buildSearchFilter(def, orgId, q) as any,
          fields: def.fields as any,
          limit: PER_GROUP,
        }),
      )) as Record<string, any>[];
      return {
        key: def.key,
        label: def.label,
        icon: def.icon,
        module: def.module,
        items: (rows || []).map(def.toHit),
      } satisfies SearchGroupResult;
    }),
  );

  const groups: SearchGroupResult[] = [];
  settled.forEach((r, i) => {
    if (r.status === "fulfilled") {
      if (r.value.items.length) groups.push(r.value);
    } else {
      console.error(`[search] ${defs[i]?.key} failed:`, r.reason);
    }
  });
  return { groups };
});
