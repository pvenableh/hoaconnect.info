/**
 * The membership name of each login in a community, for anywhere one person's
 * name is shown to someone else (core/shared/members/display-name.ts says why).
 * Reads `hoa_members` with the admin token, filtered by the community.
 */
import { readItems, readUser } from "@directus/sdk";
import { displayName, fullName, namesByUser, partsByUser, type NameParts } from "#core/shared/members/display-name";

async function memberRows(orgId: string, userIds: Iterable<string | null | undefined>): Promise<any[]> {
  const ids = [...new Set([...userIds].filter((u): u is string => typeof u === "string" && u.length > 0))];
  if (!orgId || ids.length === 0) return [];
  try {
    return ((await getTypedDirectus().request(
      readItems("hoa_members", {
        filter: { organization: { _eq: orgId }, user: { _in: ids } },
        fields: ["user", "first_name", "last_name", "status"] as any,
        limit: -1,
      })
    )) ?? []) as any[];
  } catch (e: any) {
    console.error("[member-names] lookup failed:", e?.message ?? e);
    return [];
  }
}

/** userId → "First Last" from this community's memberships. Missing users are absent. */
export async function memberNamesFor(orgId: string, userIds: Iterable<string | null | undefined>): Promise<Map<string, string>> {
  return namesByUser(await memberRows(orgId, userIds));
}

/** userId → { first_name, last_name } from this community's memberships. */
export async function memberNamePartsFor(
  orgId: string,
  userIds: Iterable<string | null | undefined>
): Promise<Map<string, { first_name: string | null; last_name: string | null }>> {
  return partsByUser(await memberRows(orgId, userIds));
}

/** One person's name for others: the membership's in `orgId`, else the login's. */
export async function memberNameFor(
  orgId: string,
  login: (NameParts & { id?: string | null }) | string | null | undefined,
  fallback = "Member"
): Promise<string> {
  const id = typeof login === "string" ? login : login?.id ?? null;
  const names = id ? await memberNamesFor(orgId, [id]) : new Map<string, string>();
  return (id && names.get(id)) || displayName(null, typeof login === "object" ? login : null, fallback);
}

/**
 * Who acted, for a ledger entry or an audit row: the session user named by the
 * community's name for them. Falls back to the login's name (from the session,
 * else read, since the session does not always carry it), then the email. A
 * permanent record should name a person, not a login.
 */
export async function ledgerActorFor(
  orgId: string,
  sessionUser: Record<string, any> | null | undefined
): Promise<{ userId: string | null; name: string; email: string | null }> {
  const u = sessionUser ?? {};
  const id = u.id ? String(u.id) : null;
  let email: string | null = u.email ?? null;
  let name = (id && (await memberNamesFor(orgId, [id])).get(id)) || fullName({
    first_name: u.first_name ?? u.firstName,
    last_name: u.last_name ?? u.lastName,
  });
  if (!name && id) {
    try {
      const login = (await getTypedDirectus().request(readUser(id, { fields: ["first_name", "last_name", "email"] as any }))) as any;
      name = fullName(login);
      email = email ?? login?.email ?? null;
    } catch {
      // The email still names them.
    }
  }
  return { userId: id, name: name || email || "An administrator", email };
}
