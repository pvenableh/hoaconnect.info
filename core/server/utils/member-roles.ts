/**
 * The roles a community may hand out.
 *
 * A membership's `role` is a Directus role id, and an invitation's role becomes
 * the Directus role of the account created when it is accepted. So the role an
 * admin picks is not only "what this person is in our community": named freely,
 * it is "what this account is on the platform". Until 2026-11-12 the invite and
 * approve routes took any role id the browser sent, and the App Admin's id is in
 * public runtime config, so an admin of ANY community could invite an address
 * they own as App Admin — which passes `checkAdminAccess` for every community.
 *
 * A community admin may make someone a member, an HOA admin or a property
 * manager of their own community; nothing else. The App Admin is unrestricted.
 */

/** The three membership roles a community admin may assign. */
export function communityRoleIds(): string[] {
  const p = useRuntimeConfig().public as Record<string, unknown>;
  return [p.directusRoleMember, p.directusRoleHoaAdmin, p.directusRolePropertyManager].filter(
    (id): id is string => typeof id === "string" && id.length > 0
  );
}

/** Throw 403 unless `roleId` is a community role, or the caller is the App Admin. */
export function assertAssignableRole(roleId: unknown, caller: { isAppAdmin?: boolean }): void {
  if (caller.isAppAdmin === true) return;
  if (typeof roleId === "string" && communityRoleIds().includes(roleId)) return;
  throw createError({
    statusCode: 403,
    message: "A community can make someone a member, an administrator or a property manager, and nothing else.",
  });
}
