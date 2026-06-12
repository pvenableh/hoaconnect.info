/**
 * useCapabilities — the calling user's resolved actor hats + capabilities for
 * the selected org, for UI gating. Backed by /api/org/capabilities (which uses
 * the shared capability matrix). Cached per-org in useState so multiple
 * <RoleGate>s share one fetch.
 *
 * Enforcement still lives server-side — this only decides what chrome to show.
 */
import type { Actor, Capability } from "~~/shared/permissions";

interface CapabilityState {
  orgId: string | null;
  actors: Actor[];
  capabilities: Capability[];
  loaded: boolean;
}

export const useCapabilities = () => {
  const selectedOrgId = useState<string | null>("selectedOrgId", () => null);
  const state = useState<CapabilityState>("orgCapabilities", () => ({
    orgId: null,
    actors: [],
    capabilities: [],
    loaded: false,
  }));

  const load = async (force = false) => {
    const orgId = selectedOrgId.value;
    if (!orgId) return;
    if (!force && state.value.loaded && state.value.orgId === orgId) return;
    try {
      const res = await $fetch<{ actors: Actor[]; capabilities: Capability[] }>(
        "/api/org/capabilities",
        { query: { orgId } }
      );
      state.value = {
        orgId,
        actors: res.actors || [],
        capabilities: res.capabilities || [],
        loaded: true,
      };
    } catch (e) {
      console.error("[useCapabilities] load failed:", e);
      state.value = { orgId, actors: [], capabilities: [], loaded: true };
    }
  };

  /** True once capabilities for the current org are loaded. */
  const ready = computed(
    () => state.value.loaded && state.value.orgId === selectedOrgId.value
  );

  const can = (capability: Capability): boolean =>
    state.value.capabilities.includes(capability);

  const is = (actor: Actor): boolean => state.value.actors.includes(actor);

  // Refetch when the active org changes.
  watch(selectedOrgId, () => load(true));

  return {
    actors: computed(() => state.value.actors),
    capabilities: computed(() => state.value.capabilities),
    ready,
    can,
    is,
    load,
  };
};
