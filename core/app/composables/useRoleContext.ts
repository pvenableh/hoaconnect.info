/**
 * useRoleContext — the caller's RoleContext for the selected org, from
 * GET /api/org/role-context (docs/spec-role-context.md). Cached per org in
 * useState, so every caller shares one fetch. The same response carries the
 * actor hats and capabilities that useCapabilities exposes.
 *
 * Enforcement still lives server-side — this only decides what chrome to show.
 */
import type { Actor, Capability } from "#core/shared/permissions";
import {
  resolveRoleContext,
  type RoleBoardTerm,
  type RoleContext,
  type RoleMembership,
} from "#core/shared/roles/role-context";

interface RoleContextState {
  orgId: string | null;
  context: RoleContext | null;
  actors: Actor[];
  capabilities: Capability[];
  loaded: boolean;
}

// One fetch per org at a time, and one org-change watcher, however many
// components ask (client only: module state on the server is shared across
// requests).
const inflight = new Map<string, Promise<void>>();
let watching = false;

export const useRoleContext = () => {
  const selectedOrgId = useState<string | null>("selectedOrgId", () => null);
  // Forwards the session cookie during SSR, so route middleware can load the
  // context on the server too (a bare $fetch there is anonymous and 401s).
  const requestFetch = useRequestFetch();
  const state = useState<RoleContextState>("orgRoleContext", () => ({
    orgId: null,
    context: null,
    actors: [],
    capabilities: [],
    loaded: false,
  }));

  const fetchOnce = async (orgId: string) => {
    try {
      const res = await requestFetch<{ context: RoleContext; actors: Actor[]; capabilities: Capability[] }>(
        "/api/org/role-context",
        { query: { orgId } }
      );
      state.value = {
        orgId,
        context: res.context ?? null,
        actors: res.actors || [],
        capabilities: res.capabilities || [],
        loaded: true,
      };
    } catch (e) {
      console.error("[useRoleContext] load failed:", e);
      state.value = { orgId, context: null, actors: [], capabilities: [], loaded: true };
    }
  };

  const load = async (force = false) => {
    const orgId = selectedOrgId.value;
    if (!orgId) return;
    if (!force && state.value.loaded && state.value.orgId === orgId) return;
    if (import.meta.server) return fetchOnce(orgId);
    const pending = inflight.get(orgId);
    if (pending) return pending;
    const p = fetchOnce(orgId).finally(() => inflight.delete(orgId));
    inflight.set(orgId, p);
    return p;
  };

  /** True once the context for the current org is loaded. */
  const ready = computed(() => state.value.loaded && state.value.orgId === selectedOrgId.value);

  // Refetch when the active org changes.
  if (import.meta.client && !watching) {
    watching = true;
    watch(selectedOrgId, () => void load(true));
  }

  return {
    context: computed(() => state.value.context),
    actors: computed(() => state.value.actors),
    capabilities: computed(() => state.value.capabilities),
    ready,
    load,
  };
};

export interface ClientRoleIds {
  appAdmin?: string | null;
  hoaAdmin?: string | null;
  propertyManager?: string | null;
}

/**
 * Resolve the CACHED membership on the client, synchronously, with the same
 * resolver and the same rules the server uses (docs/spec-capability-nav.md,
 * "Client context"). useCurrentDomainAccess uses this until the server
 * context is loaded for the org on screen, and the server's from then on.
 *
 * The only difference left: a row read before `status` was in the cached
 * fields has none, and counts as active (today's behaviour) rather than as
 * over. The billing account is not in the cache, so `isAccountOwner` is false
 * here — ask useRoleContext().context for it.
 */
export function roleContextFromMembership(
  membership: RoleMembership | null | undefined,
  currentTerms: readonly RoleBoardTerm[],
  globalRoleId: string | null | undefined,
  roles: ClientRoleIds
): RoleContext {
  const row = membership ? { ...membership, status: membership.status ?? "active" } : null;
  const ctx = resolveRoleContext(row, currentTerms, null, {
    userId: null,
    globalRoleId,
    // The server's: App Admin by global role, HOA Admin by membership role.
    roles: {
      appAdmin: roles.appAdmin,
      propertyManager: roles.propertyManager,
      adminRoleIds: [roles.hoaAdmin],
    },
  });
  return { ...ctx, isAccountOwner: false };
}
