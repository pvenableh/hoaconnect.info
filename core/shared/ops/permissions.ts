// Who may use the operator console, and for what (docs/plan-operator-console.md §6).
//
// Two platform roles, each a Directus role on the user and checked BY ID, never
// by name: a name is editable in Data Studio, an id is not.
//   - App Admin: everything.
//   - Platform Support: reads the console and works the support inbox. No money.
//
// Shared so the server guard (`requireOpsPermission`) and the client gate
// (`useRoles().isPlatformSupport`) can't disagree about the matrix.

export type PlatformRole = "app_admin" | "platform_support";
export type OpsPermission = "billing.read" | "billing.write" | "support";

export const OPS_PERMISSIONS: Readonly<Record<PlatformRole, readonly OpsPermission[]>> = {
  app_admin: ["billing.read", "billing.write", "support"],
  platform_support: ["billing.read", "support"],
};

export interface PlatformRoleIds {
  appAdmin?: string | null;
  platformSupport?: string | null;
}

/** The Directus role id off a session user, whether stored as an id or an object. */
export function roleIdOf(role: unknown): string | null {
  if (typeof role === "string") return role || null;
  if (role && typeof role === "object" && typeof (role as { id?: unknown }).id === "string") {
    return (role as { id: string }).id || null;
  }
  return null;
}

/**
 * The platform role a Directus role id stands for, or null. An unset id in
 * config never matches: before the Platform Support role exists, nobody is
 * Platform Support, including a user whose role is somehow empty.
 */
export function platformRoleFor(roleId: string | null | undefined, ids: PlatformRoleIds): PlatformRole | null {
  if (!roleId) return null;
  if (ids.appAdmin && roleId === ids.appAdmin) return "app_admin";
  if (ids.platformSupport && roleId === ids.platformSupport) return "platform_support";
  return null;
}

export function opsCan(role: PlatformRole | null | undefined, permission: OpsPermission): boolean {
  return !!role && OPS_PERMISSIONS[role].includes(permission);
}
