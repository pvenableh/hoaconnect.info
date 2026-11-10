// GET /api/governing/search?q=&document=&kind=&hasFlags=&relationship=&severity=
// Ranked search over the provisions the caller may see (core/shared/governing/search.ts).
// Exact citation matches come first. Filters alone are a valid search.
import { requireGoverningAccess } from "#core/server/utils/governing-access";
import { searchGoverning } from "#core/server/utils/governing-data";
import { requireOrgId } from "#core/server/utils/org-context";
import { RELATIONSHIP_ORDER, SEVERITY_ORDER } from "#core/shared/governing/flags";
import { normalizeQuery, type SearchFilters } from "#core/shared/governing/search";

export default defineEventHandler(async (event) => {
  const orgId = await requireOrgId(event);
  const { canManage } = await requireGoverningAccess(event, orgId);
  const query = getQuery(event);
  const one = (v: unknown) => (typeof v === "string" && v ? v : undefined);
  const filters: SearchFilters = {
    document: one(query.document),
    kind: one(query.kind),
    hasFlags: query.hasFlags === "true" || query.hasFlags === "1",
    relationship: RELATIONSHIP_ORDER.find((r) => r === query.relationship),
    severity: SEVERITY_ORDER.find((s) => s === query.severity),
  };
  const q = normalizeQuery(query.q);
  const results = await searchGoverning(orgId, q, filters, canManage);
  return { query: q, total: results.length, results: results.slice(0, 50) };
});
