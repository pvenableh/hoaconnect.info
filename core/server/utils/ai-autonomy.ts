// Per-org AI trust dial (Phase 4). Reads/writes hoa_organizations.ai_autonomy_tier
// through the admin client. Fail-safe: any read error resolves to tier 0 (ask for
// everything), so a hiccup can never widen autonomy. getTypedDirectus is
// auto-imported from server/utils/directus.ts.

import { readItems, updateItem } from "@directus/sdk";
import { clampAutonomyTier, DEFAULT_AUTONOMY_TIER, type AutonomyTier } from "#core/shared/ai/actions";

/** The org's current autonomy tier, defaulting to 0 on any error. */
export async function getOrgAutonomyTier(orgId: string): Promise<AutonomyTier> {
  try {
    const rows = (await getTypedDirectus().request(
      readItems("hoa_organizations", {
        filter: { id: { _eq: orgId } },
        fields: ["ai_autonomy_tier"],
        limit: 1,
      })
    )) as { ai_autonomy_tier?: number | null }[];
    return clampAutonomyTier(rows?.[0]?.ai_autonomy_tier ?? DEFAULT_AUTONOMY_TIER);
  } catch {
    return DEFAULT_AUTONOMY_TIER;
  }
}

/** Set the org's autonomy tier (clamped 0–3). */
export async function setOrgAutonomyTier(orgId: string, tier: number): Promise<AutonomyTier> {
  const clamped = clampAutonomyTier(tier);
  await getTypedDirectus().request(
    updateItem("hoa_organizations", orgId, { ai_autonomy_tier: clamped } as any)
  );
  return clamped;
}
