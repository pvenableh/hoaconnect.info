/**
 * Property Manager grant checks (server-side enforcement).
 *
 * Directus policies are role-wide, so the Property Manager policy is only an
 * org-scoped CEILING. The per-manager grant flags (hoa_members.manager_permissions)
 * are what actually decide what a given manager may do. For sensitive writes
 * (sending communications, creating violations) we enforce those flags here —
 * the same "elevated server route" pattern used for board access.
 */
import type { H3Event } from "h3";
import { readItems } from "@directus/sdk";
import { helperAreasFor, refId, type AreaGrantRow, type HelperAreaKey } from "#core/shared/roles/area-grants";
import { restrictedNow } from "./admin-scope";
import { MANAGER_GRANT_KEYS, type ManagerGrantKey as GrantKey } from "#core/shared/transition/grants";

// The canonical list lives in the shared transition module, because revocation
// walks it too: a key this file knew about and the revoker didn't would stay
// true after a manager left. Re-exported here so existing callers are unchanged.
export type { ManagerGrantKey } from "#core/shared/transition/grants";

/**
 * Return the calling user's Property Manager grant flags for an org, or null if
 * they are not an active Property Manager of that org.
 */
export async function getManagerGrants(
  event: H3Event,
  organizationId: string
): Promise<Record<string, boolean> | null> {
  const session = await getUserSession(event);
  if (!session?.user?.id) return null;

  const config = useRuntimeConfig();
  const pmRole = config.public.directusRolePropertyManager;
  if (!pmRole) return null;

  try {
    const directus = getTypedDirectus();
    const members = await directus.request(
      readItems("hoa_members", {
        filter: {
          user: { _eq: session.user.id },
          organization: { _eq: organizationId },
          role: { _eq: pmRole },
          status: { _eq: "active" },
        },
        fields: ["manager_permissions"],
        limit: 1,
      })
    );
    if (!members?.length) return null;
    const mp = (members[0] as any).manager_permissions;
    return mp && typeof mp === "object" ? mp : {};
  } catch (e) {
    console.error("[manager-access] grant lookup failed:", e);
    return null;
  }
}

/**
 * Authorize an action that an org admin OR a property manager (with a specific
 * granted capability) may perform. Throws 403 otherwise.
 */
export async function requireAdminOrManagerGrant(
  event: H3Event,
  organizationId: string,
  key: ManagerGrantKey
): Promise<{ via: "admin" | "manager" }> {
  const admin = await checkAdminAccess(event, organizationId);
  if (admin.isAdmin) return { via: "admin" };

  const grants = await getManagerGrants(event, organizationId);
  if (grants && grants[key] === true) return { via: "manager" };

  throw createError({
    statusCode: 403,
    message: `Not authorized for this action (${key})`,
  });
}

/**
 * The helper areas the calling user holds in an org (docs/spec-delegation.md):
 * open `hoa_area_grants` rows naming their ACTIVE membership, or a team with
 * status active that they are on. Only `HELPER_AREA_KEYS` count.
 *
 * Fails closed: any read error (the collection before its schema script, a
 * missing session) is no areas. Cached on the event, because one request can
 * ask several gates.
 *
 * Never makes the caller a property manager: `getManagerGrants` is unchanged,
 * so the `property_manager` actor, the ledger's manager tier and manager
 * notifications stay with Property Manager memberships.
 */
export async function getHelperAreas(event: H3Event, organizationId: string): Promise<HelperAreaKey[]> {
  const context = ((event as any).context ??= {}) as Record<string, any>;
  const cache = (context.__helperAreas ??= new Map<string, Promise<HelperAreaKey[]>>()) as Map<string, Promise<HelperAreaKey[]>>;
  const hit = cache.get(organizationId);
  if (hit) return hit;
  const run = readHelperAreas(event, organizationId);
  cache.set(organizationId, run);
  return run;
}

async function readHelperAreas(event: H3Event, organizationId: string): Promise<HelperAreaKey[]> {
  try {
    const session = await getUserSession(event);
    const userId = session?.user?.id;
    if (!userId || !organizationId) return [];
    const membership = await checkMembership(event, organizationId);
    if (!membership?.isMember || !membership.memberId) return [];
    const memberId = String(membership.memberId);

    const directus = getTypedDirectus();
    // Paused while their posting is (docs/spec-member-restrictions.md). A failed
    // read throws into the catch below: no areas.
    if ((await restrictedNow(directus, [memberId])).has(memberId)) return [];
    const teamRows = ((await directus.request(
      readItems("hoa_team_members" as any, {
        filter: { user: { _eq: userId }, organization: { _eq: organizationId } },
        fields: ["team.id", "team.status", "team.organization"] as any,
        limit: 100,
      })
    )) ?? []) as any[];
    const teamIds = teamRows
      .map((r) => r?.team)
      .filter((t) => t && (t.status ?? "active") === "active" && refId(t.organization) === organizationId)
      .map((t) => String(t.id));

    const now = new Date();
    const holders: any[] = [{ member: { _eq: memberId } }];
    if (teamIds.length) holders.push({ team: { _in: teamIds } });
    const rows = ((await directus.request(
      readItems("hoa_area_grants" as any, {
        filter: {
          _and: [
            { organization: { _eq: organizationId } },
            { _or: [{ ends_at: { _null: true } }, { ends_at: { _gt: now.toISOString() } }] },
            { _or: holders },
          ],
        } as any,
        fields: ["id", "organization", "area", "member", "team", "starts_at", "ends_at"] as any,
        limit: -1,
      })
    )) ?? []) as AreaGrantRow[];

    return helperAreasFor({ orgId: organizationId, memberId, teamIds, rows, now });
  } catch (e: any) {
    // One line: before the schema script this fails on every request.
    console.error("[manager-access] helper area lookup failed:", e?.errors?.[0]?.message ?? e?.message ?? String(e));
    return [];
  }
}

/**
 * Every grant key the caller can work in an org through a manager grant or a
 * helper or committee grant. Admin is NOT folded in: callers check it first.
 */
export async function getAreaGrants(
  event: H3Event,
  organizationId: string
): Promise<{ areas: Record<GrantKey, boolean>; manager: Record<string, boolean> | null; helps: HelperAreaKey[] }> {
  const [manager, helps] = await Promise.all([
    getManagerGrants(event, organizationId),
    getHelperAreas(event, organizationId),
  ]);
  const areas = Object.fromEntries(
    MANAGER_GRANT_KEYS.map((k) => [k, manager?.[k] === true || (helps as readonly string[]).includes(k)])
  ) as Record<GrantKey, boolean>;
  return { areas, manager, helps };
}

/**
 * Authorize work in an area that a helper or committee may hold: admin, a
 * manager grant, or a helper area. For a key outside HELPER_AREA_KEYS this is
 * exactly `requireAdminOrManagerGrant`, since no helper row counts for it.
 * Throws 403 otherwise.
 */
export async function requireAreaWork(
  event: H3Event,
  organizationId: string,
  key: GrantKey
): Promise<{ via: "admin" | "manager" | "helper" }> {
  const admin = await checkAdminAccess(event, organizationId);
  if (admin.isAdmin) return { via: "admin" };

  const grants = await getManagerGrants(event, organizationId);
  if (grants && grants[key] === true) return { via: "manager" };

  const helps = await getHelperAreas(event, organizationId);
  if ((helps as readonly string[]).includes(key)) return { via: "helper" };

  throw createError({
    statusCode: 403,
    message: `Not authorized for this action (${key})`,
  });
}
