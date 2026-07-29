// GET /api/ai/actions/pending-count — how many proposals await approval, for the
// launcher badge. Org-scoped, comms-gated, fails soft to 0. (Phase 4.)

import { aggregate } from "@directus/sdk";

export default defineEventHandler(async (event) => {
  await requireUserSession(event);
  const orgId = String(getQuery(event).orgId || "").trim();
  if (!orgId) throw createError({ statusCode: 400, message: "orgId is required" });
  await requireOrgComposeAccess(event, orgId);

  try {
    const res = (await getTypedDirectus().request(
      aggregate("ai_actions", {
        aggregate: { count: "*" },
        query: { filter: { organization: { _eq: orgId }, status: { _eq: "pending" } } },
      })
    )) as { count: number }[];
    return { count: Number(res?.[0]?.count ?? 0) };
  } catch {
    return { count: 0 };
  }
});
