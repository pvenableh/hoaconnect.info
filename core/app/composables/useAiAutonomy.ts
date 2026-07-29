// useAiAutonomy — the per-org AI trust dial (Phase 4). Reads the tier and (for
// admins) sets it. Optimistic with rollback. The tier ladder + labels come from
// the shared source so client and server never drift.
import { AUTONOMY_TIERS, clampAutonomyTier, type AutonomyTier } from "#core/shared/ai/actions";

export function useAiAutonomy(orgId: Ref<string | null | undefined>) {
  const tier = ref<AutonomyTier>(0);
  const saving = ref(false);

  async function refresh() {
    if (!orgId.value) return;
    try {
      const res = await $fetch<{ tier: number }>("/api/ai/autonomy", { query: { orgId: orgId.value } });
      tier.value = clampAutonomyTier(res.tier);
    } catch {
      /* keep current */
    }
  }

  async function setTier(next: number): Promise<boolean> {
    if (!orgId.value) return false;
    const clamped = clampAutonomyTier(next);
    const prev = tier.value;
    tier.value = clamped; // optimistic
    saving.value = true;
    try {
      const res = await $fetch<{ tier: number }>("/api/ai/autonomy", {
        method: "POST",
        body: { orgId: orgId.value, tier: clamped },
      });
      tier.value = clampAutonomyTier(res.tier);
      return true;
    } catch (err) {
      tier.value = prev; // rollback (e.g. non-admin 403)
      throw err;
    } finally {
      saving.value = false;
    }
  }

  return { tier, saving, tiers: AUTONOMY_TIERS, refresh, setTier };
}
