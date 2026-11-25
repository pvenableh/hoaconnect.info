// GET /api/ai/autonomy — the org's current AI trust-dial tier (0–3). Comms-gated.
// (Phase 4.)

import { getOrgAutonomyTier } from "#core/server/utils/ai-autonomy";
import { autonomyTierSpec } from "#core/server/utils/ai-action-reads";
import { clampAutonomyTier, DEFAULT_AUTONOMY_TIER } from "#core/shared/ai/actions";

export default defineEventHandler(async (event) => {
  await requireUserSession(event);
  const orgId = String(getQuery(event).orgId || "").trim();
  if (!orgId) throw createError({ statusCode: 400, message: "orgId is required" });
  // The tier and the caller's standing as ONE request (ai-action-reads.ts);
  // the gate then answers from the cached standing and refuses before the
  // tier is used. A failed batch reads it on its own below, as before.
  const batched = await batchWithAccessSnapshot(event, orgId, { at_org: autonomyTierSpec(orgId) }).catch(() => null);
  await requireOrgComposeAccess(event, orgId);
  if (batched) return { tier: clampAutonomyTier(batched.at_org[0]?.ai_autonomy_tier ?? DEFAULT_AUTONOMY_TIER) };
  return { tier: await getOrgAutonomyTier(orgId) };
});
