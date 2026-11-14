/**
 * resolveHomePath — where a person lands in a community after login
 * (docs/spec-capability-nav.md, "Home and badge"): the queue for a manager
 * (hat) who can work an area there, the org root for everyone else.
 *
 * Reads the server's RoleContext for that org, because the hat is not in the
 * cached membership. Any failure lands on the org root, as before.
 */
import type { RoleContext } from "#core/shared/roles/role-context";
import { AREA_KEYS } from "#core/shared/transition/grants";
import { homePathFor } from "#core/shared/nav/registry";

export async function resolveHomePath(orgId: string | null | undefined): Promise<"/manage" | "/"> {
  if (!orgId) return "/";
  try {
    const res = await $fetch<{ context: RoleContext | null }>("/api/org/role-context", { query: { orgId } });
    const ctx = res?.context;
    if (!ctx) return "/";
    return homePathFor({
      managerHat: ctx.hats.manager,
      anyArea: AREA_KEYS.some((k) => ctx.areas[k]?.canWork),
    });
  } catch {
    return "/";
  }
}

/** `/{slug}` or `/{slug}/manage`. */
export function orgHomeUrl(slug: string, home: "/manage" | "/"): string {
  return home === "/" ? `/${slug}` : `/${slug}${home}`;
}
