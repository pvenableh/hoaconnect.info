/**
 * Give an existing account what a community role it now holds needs in
 * Directus.
 *
 * An account has one Directus role, and its role's policies decide what calls
 * on the person's own token may do. A new account takes the role it was
 * invited with. An existing one joining another community kept its role, so
 * someone with the HOA Member role made an admin of a second community had no
 * HOA Admin policy: the app's admin routes (which read the membership) worked,
 * and every Directus call on their own token got member rules there.
 *
 * Changing the account's role would be wrong: the roles are not a ladder (a
 * Property Manager account made an HOA Admin elsewhere would lose its manager
 * policy). Instead the missing policies of the community role are attached to
 * the account itself (`directus_access` with a user, as Directus 11 allows).
 * That widens nothing: the HOA Admin and Property Manager policies reach only
 * the communities in the person's `admin_of` / `manager_of`, which come from
 * their memberships (core/shared/roles/admin-scope.ts).
 *
 * Only the three community roles (member-roles.ts), and only for an account
 * whose own role is one of them: a platform account is left as it is.
 */

interface AccessRow {
  policy?: string | { id?: string } | null;
}

const policyOf = (row: AccessRow): string | null =>
  typeof row.policy === "string" ? row.policy : row.policy?.id ?? null;

async function directusRest<T>(path: string, init: { method?: "GET" | "POST"; query?: Record<string, unknown>; body?: unknown } = {}): Promise<T> {
  const config = useRuntimeConfig();
  const res = await $fetch<{ data: T }>(`${config.directusUrl}${path}`, {
    method: init.method ?? "GET",
    headers: { Authorization: `Bearer ${config.directusToken}` },
    query: init.query,
    body: init.body as Record<string, unknown> | undefined,
  });
  return res.data;
}

/**
 * Attach to `userId` each policy of the community role `roleId` that its
 * account does not already have, through its role or directly. Returns the
 * policy ids attached (none when nothing was missing or the call does not apply).
 */
export async function grantRoleAccess(userId: string, roleId: string | null | undefined): Promise<string[]> {
  const community = communityRoleIds();
  if (!userId || !roleId || !community.includes(roleId)) return [];

  const user = await directusRest<{ role?: string | { id?: string } | null }>(`/users/${userId}`, { query: { fields: "role" } });
  const accountRole = typeof user?.role === "string" ? user.role : user?.role?.id ?? null;
  if (accountRole === roleId) return [];
  if (accountRole && !community.includes(accountRole)) return [];

  const wanted = await directusRest<AccessRow[]>("/access", {
    query: { filter: JSON.stringify({ role: { _eq: roleId } }), fields: "policy", limit: -1 },
  });
  const haveFilter = accountRole
    ? { _or: [{ role: { _eq: accountRole } }, { user: { _eq: userId } }] }
    : { user: { _eq: userId } };
  const have = await directusRest<AccessRow[]>("/access", {
    query: { filter: JSON.stringify(haveFilter), fields: "policy", limit: -1 },
  });

  const held = new Set(have.map(policyOf).filter((v): v is string => !!v));
  const missing = [...new Set(wanted.map(policyOf).filter((v): v is string => !!v && !held.has(v)))];
  for (const policy of missing) {
    await directusRest("/access", { method: "POST", body: { user: userId, policy } });
  }
  return missing;
}
