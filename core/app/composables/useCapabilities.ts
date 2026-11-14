/**
 * useCapabilities — the calling user's resolved actor hats + capabilities for
 * the selected org, for UI gating. Read from useRoleContext, whose one fetch
 * (/api/org/role-context) carries them, computed exactly as
 * /api/org/capabilities computes them (resolveCapabilities, shared matrix).
 * Cached per org, so multiple <RoleGate>s share one fetch.
 *
 * Enforcement still lives server-side — this only decides what chrome to show.
 */
import type { Actor, Capability } from "#core/shared/permissions";
import { useRoleContext } from "./useRoleContext";

export const useCapabilities = () => {
  const { actors, capabilities, ready, load } = useRoleContext();

  const can = (capability: Capability): boolean => capabilities.value.includes(capability);

  const is = (actor: Actor): boolean => actors.value.includes(actor);

  return {
    actors,
    capabilities,
    ready,
    can,
    is,
    load,
  };
};
