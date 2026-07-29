// POST /api/ai/autonomy — set the org's AI trust-dial tier (0–3). Admin-only
// (changing autonomy is a governance decision, not a per-user preference). The
// hard cap on outbound actions holds at every tier regardless. (Phase 4.)

import { setOrgAutonomyTier } from "#core/server/utils/ai-autonomy";

export default defineEventHandler(async (event) => {
  await requireUserSession(event);
  const body = await readBody(event);
  const orgId = String(body?.orgId || "").trim();
  if (!orgId) throw createError({ statusCode: 400, message: "orgId is required" });

  // Setting autonomy is admin-only; requireOrgComposeAccess admits board/PM too,
  // so assert admin explicitly.
  const actors = await requireOrgComposeAccess(event, orgId);
  if (!actors.includes("admin")) {
    throw createError({ statusCode: 403, message: "Only an administrator can change the AI trust level." });
  }

  const tier = await setOrgAutonomyTier(orgId, Number(body?.tier));
  return { tier };
});
