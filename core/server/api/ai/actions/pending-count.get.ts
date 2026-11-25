// GET /api/ai/actions/pending-count — how many proposals await approval, for the
// launcher badge. Org-scoped, comms-gated, fails soft to 0. (Phase 4.)

import { aggregate } from "@directus/sdk";
import { pendingCountSpec } from "#core/server/utils/ai-action-reads";

export default defineEventHandler(async (event) => {
  await requireUserSession(event);
  const orgId = String(getQuery(event).orgId || "").trim();
  if (!orgId) throw createError({ statusCode: 400, message: "orgId is required" });
  // The count and the caller's standing as ONE request (ai-action-reads.ts);
  // the gate then answers from the cached standing and refuses before the
  // count is used. A failed batch counts on its own below, as before.
  const batched = await batchWithAccessSnapshot(event, orgId, { pc_count: pendingCountSpec(orgId) }).catch(() => null);
  await requireOrgComposeAccess(event, orgId);

  if (batched) return { count: Number(batched.pc_count[0]?.count ?? 0) };

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
