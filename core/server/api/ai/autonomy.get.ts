// GET /api/ai/autonomy — the org's current AI trust-dial tier (0–3). Comms-gated.
// (Phase 4.)

import { getOrgAutonomyTier } from "#core/server/utils/ai-autonomy";

export default defineEventHandler(async (event) => {
  await requireUserSession(event);
  const orgId = String(getQuery(event).orgId || "").trim();
  if (!orgId) throw createError({ statusCode: 400, message: "orgId is required" });
  await requireOrgComposeAccess(event, orgId);
  return { tier: await getOrgAutonomyTier(orgId) };
});
