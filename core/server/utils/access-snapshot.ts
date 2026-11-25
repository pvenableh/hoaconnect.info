/**
 * The caller's standing in one community, read ONCE per request.
 *
 * checkAdminAccess, checkMembership, getBoardPosition, getBoardSeatActor,
 * getManagerGrants, the team-lead check in resolveActors and getHelperAreas
 * each asked Directus their own question: about eight requests in three
 * rounds for one resolveCapabilities, and Directus serves requests in turn
 * (~40ms of CPU each). They now answer from one readItemsBatch request:
 *
 *   mine          the caller's memberships in the org, any status, with their
 *                 published board terms (sorted as getBoardPosition sorts)
 *   teams         the caller's team rows in the org, with each team
 *   restrictions  live restrictions on the caller's memberships in the org
 *   areaGrants    the org's area grants that have not ended (helperAreasFor
 *                 keeps the caller's own: as a member, or through a team)
 *
 * The answers below are the old reads' rules applied to these rows. Cached
 * per request, user and org, like checkAdminAccess already was: a request
 * that changes someone's standing and then re-checks it must not use this.
 * If the batch fails (a collection missing before its schema script, say),
 * the snapshot is null and each helper makes its own reads as before.
 */
import type { H3Event } from "h3";
import type { Actor } from "#core/shared/permissions";
import { boardTitleToActor } from "#core/shared/permissions";
import { isCurrentBoardTerm, todayUtc } from "#core/shared/roles/role-context";
import { helperAreasFor, refId, type AreaGrantRow, type HelperAreaKey } from "#core/shared/roles/area-grants";
import { restrictedMemberIds } from "#core/shared/members/restrictions";
import type { BatchSpec } from "./directus-graphql";

/** The caller's memberships in the org: enough for admin, membership, office, seat and manager grants. */
export interface AccessBase {
  userId: string;
  orgId: string;
  mine: any[];
}

/** The base, with teams, restrictions and area grants: the team-lead check and helper areas. */
export interface AccessSnapshot extends AccessBase {
  teams: any[];
  restrictions: any[];
  areaGrants: AreaGrantRow[];
}

/** The role ids the answers compare against (runtime config). */
export interface AccessRoles {
  hoaAdmin?: string | null;
  propertyManager?: string | null;
}

const roleOf = (role: unknown): string | null =>
  typeof role === "string" ? role : ((role as { id?: string } | null | undefined)?.id ?? null);

/**
 * The four reads: `mine` is the base; the other three complete the full
 * snapshot. `org` names the community for every read: by id unless given
 * (batchWithAccessSnapshotBySlug names it by slug).
 */
export function accessSnapshotSpecs(
  userId: string,
  orgId: string,
  now = new Date(),
  org: Record<string, unknown> = { _eq: orgId }
): Record<string, BatchSpec> {
  const iso = now.toISOString();
  return {
    mine: {
      collection: "hoa_members",
      filter: { user: { _eq: userId }, organization: org },
      fields: [
        "id", "status", "role", "manager_permissions",
        "board_member_terms.title", "board_member_terms.status", "board_member_terms.term_start",
        "board_member_terms.term_end", "board_member_terms.sort",
      ],
      deep: { board_member_terms: { _filter: { status: { _eq: "published" } }, _sort: ["sort"], _limit: -1 } },
      sort: ["id"],
      limit: -1,
    },
    teams: {
      collection: "hoa_team_members",
      filter: { user: { _eq: userId }, organization: org },
      fields: ["role", "team.id", "team.status", "team.organization"],
      limit: 100,
    },
    restrictions: {
      collection: "hoa_member_restrictions",
      filter: {
        _and: [
          { member: { user: { _eq: userId }, organization: org } },
          { _or: [{ lifted_at: { _null: true } }, { lifted_at: { _gt: iso } }] },
          { _or: [{ ends_at: { _null: true } }, { ends_at: { _gt: iso } }] },
        ],
      },
      fields: ["member", "starts_at", "ends_at", "lifted_at"],
      limit: -1,
    },
    areaGrants: {
      collection: "hoa_area_grants",
      filter: {
        _and: [{ organization: org }, { _or: [{ ends_at: { _null: true } }, { ends_at: { _gt: iso } }] }],
      },
      fields: ["id", "organization", "area", "member", "team", "starts_at", "ends_at"],
      limit: -1,
    },
  };
}

const BASE_KEYS = ["mine"] as const;
const REST_KEYS = ["teams", "restrictions", "areaGrants"] as const;

type Entry = { base?: Promise<AccessBase | null>; full?: Promise<AccessSnapshot | null> };

async function batch(userId: string, orgId: string, keys: readonly string[]): Promise<Record<string, any[]> | null> {
  const all = accessSnapshotSpecs(userId, orgId);
  try {
    return await readItemsBatch(Object.fromEntries(keys.map((k) => [k, all[k]!])));
  } catch (e: any) {
    // Where no batch reader exists (a unit test that stubs Directus read by
    // read) the helpers simply read as before; anything else is worth a line.
    if (!(e instanceof ReferenceError)) {
      console.warn("[access-snapshot] batch failed; reading one by one:", e?.errors?.[0]?.message ?? e?.message ?? String(e));
    }
    return null;
  }
}

/**
 * The caller's standing in `orgId`, once per request, user and org; null with
 * no session or org, or when the batch fails (the helpers then read as before).
 *
 * `need: "base"` reads only the memberships, which is all checkAdminAccess,
 * checkMembership, getBoardPosition, getBoardSeatActor and getManagerGrants
 * need: a route that only asks "is this an admin" pays for one small read, not
 * four. `need: "full"` adds teams, restrictions and area grants, reusing a base
 * already read or in flight; asked first, it reads all four at once and serves
 * the base too. resolveCapabilities asks for "full" before anything else, so
 * its every question is one request.
 */
export async function accessSnapshot(event: H3Event, orgId: string, need: "base"): Promise<AccessBase | null>;
export async function accessSnapshot(event: H3Event, orgId: string, need?: "full"): Promise<AccessSnapshot | null>;
export async function accessSnapshot(event: H3Event, orgId: string, need: "base" | "full" = "full"): Promise<AccessBase | AccessSnapshot | null> {
  if (!orgId) return null;
  const session = await getUserSession(event);
  const userId = session?.user?.id ? String(session.user.id) : "";
  if (!userId) return null;
  const context = ((event as any).context ??= {}) as Record<string, any>;
  const cache = (context.__accessSnapshot ??= new Map<string, Entry>()) as Map<string, Entry>;
  const key = `${userId}:${orgId}`;
  const entry = cache.get(key) ?? {};
  cache.set(key, entry);

  if (need === "base") {
    entry.base ??= entry.full
      ? entry.full.then((f) => (f ? { userId, orgId, mine: f.mine } : null))
      : batch(userId, orgId, BASE_KEYS).then((r) => (r ? { userId, orgId, mine: r.mine ?? [] } : null));
    return entry.base;
  }

  if (!entry.full) {
    if (entry.base) {
      // The memberships are read or on their way: read only the rest.
      const base = entry.base;
      entry.full = Promise.all([base, batch(userId, orgId, REST_KEYS)]).then(([b, r]) =>
        b && r ? { ...b, teams: r.teams ?? [], restrictions: r.restrictions ?? [], areaGrants: (r.areaGrants ?? []) as AreaGrantRow[] } : null
      );
    } else {
      const full = batch(userId, orgId, [...BASE_KEYS, ...REST_KEYS]).then((r) =>
        r
          ? { userId, orgId, mine: r.mine ?? [], teams: r.teams ?? [], restrictions: r.restrictions ?? [], areaGrants: (r.areaGrants ?? []) as AreaGrantRow[] }
          : null
      );
      entry.full = full;
      entry.base = full.then((f) => (f ? { userId, orgId, mine: f.mine } : null));
    }
  }
  return entry.full;
}

/** The prefix `batchWithAccessSnapshot` puts on the snapshot's own keys; a caller's keys must not use it. */
const SNAPSHOT_PREFIX = "access_";

/**
 * A route's own reads and the caller's full standing in `orgId`, as ONE
 * request: the snapshot's four reads ride in the same batch and are cached
 * for the request, so every access helper after this (checkAdminAccess,
 * getManagerGrants, getHelperAreas, getBoardPosition, checkMembership, …)
 * answers without reading. A route that reads before it decides must still
 * refuse before it returns any of these rows.
 *
 * When the snapshot is already read or on its way, or there is no session,
 * only the route's specs are read. Throws as readItemsBatch throws (the
 * snapshot is then left unread, and the helpers read it as usual).
 */
export async function batchWithAccessSnapshot<K extends string>(
  event: H3Event,
  orgId: string,
  specs: Record<K, BatchSpec>
): Promise<Record<K, any[]>> {
  const session = orgId ? await getUserSession(event) : null;
  const userId = session?.user?.id ? String(session.user.id) : "";
  const context = ((event as any).context ??= {}) as Record<string, any>;
  const cache = (context.__accessSnapshot ??= new Map<string, Entry>()) as Map<string, Entry>;
  const key = `${userId}:${orgId}`;
  if (!userId || cache.has(key)) return readItemsBatch(specs);

  for (const k of Object.keys(specs)) {
    if (k.startsWith(SNAPSHOT_PREFIX)) throw new Error(`batch key ${k} uses the reserved ${SNAPSHOT_PREFIX} prefix`);
  }
  const mine = accessSnapshotSpecs(userId, orgId);
  const keys = [...BASE_KEYS, ...REST_KEYS];
  const r = (await readItemsBatch({
    ...specs,
    ...Object.fromEntries(keys.map((k) => [`${SNAPSHOT_PREFIX}${k}`, mine[k]!])),
  } as Record<string, BatchSpec>)) as Record<string, any[]>;

  const at = (k: string) => r[`${SNAPSHOT_PREFIX}${k}`] ?? [];
  const full: AccessSnapshot = {
    userId,
    orgId,
    mine: at("mine"),
    teams: at("teams"),
    restrictions: at("restrictions"),
    areaGrants: at("areaGrants") as AreaGrantRow[],
  };
  // Another helper may have started a read while this one was out: keep its entry.
  if (!cache.has(key)) cache.set(key, { full: Promise.resolve(full), base: Promise.resolve({ userId, orgId, mine: full.mine }) });
  return Object.fromEntries(Object.keys(specs).map((k) => [k, r[k] ?? []])) as Record<K, any[]>;
}

/** The batch key batchWithAccessSnapshotBySlug reads the community under. */
const SLUG_ORG_KEY = `${SNAPSHOT_PREFIX}org`;

/**
 * batchWithAccessSnapshot for a route that names its community by slug: the
 * slug lookup, the caller's full standing and the route's own reads as ONE
 * request, every read naming the community through its slug. `specsFor`
 * gets the organization filter to use in place of `{ _eq: orgId }`.
 *
 * Answers `{ orgId: "" }` when no community has the slug, as resolveOrgId
 * does; null (nothing cached) when two communities share it, there is no
 * session, or the batch fails, so the route resolves the slug and reads as
 * before. Otherwise the community's id and the route's rows, with the
 * snapshot cached for the request as batchWithAccessSnapshot caches it.
 */
export async function batchWithAccessSnapshotBySlug<K extends string>(
  event: H3Event,
  slug: string,
  specsFor: (org: Record<string, unknown>) => Record<K, BatchSpec>
): Promise<{ orgId: string; rows: Record<K, any[]> } | null> {
  const session = slug ? await getUserSession(event) : null;
  const userId = session?.user?.id ? String(session.user.id) : "";
  if (!userId) return null;

  const org = { slug: { _eq: slug } };
  const specs = specsFor(org);
  for (const k of Object.keys(specs)) {
    if (k.startsWith(SNAPSHOT_PREFIX)) throw new Error(`batch key ${k} uses the reserved ${SNAPSHOT_PREFIX} prefix`);
  }
  // As resolveOrgId reads it (any status), two rows to notice a shared slug.
  const lookup: BatchSpec = { collection: "hoa_organizations", filter: org, fields: ["id"], limit: 2 };
  const snap = accessSnapshotSpecs(userId, "", new Date(), { slug: { _eq: slug } });
  const keys = [...BASE_KEYS, ...REST_KEYS];
  let r: Record<string, any[]>;
  try {
    r = (await readItemsBatch({
      ...specs,
      [SLUG_ORG_KEY]: lookup,
      ...Object.fromEntries(keys.map((k) => [`${SNAPSHOT_PREFIX}${k}`, snap[k]!])),
    } as Record<string, BatchSpec>)) as Record<string, any[]>;
  } catch {
    return null;
  }
  const orgs = r[SLUG_ORG_KEY] ?? [];
  if (orgs.length > 1) return null;
  if (!orgs.length) return { orgId: "", rows: Object.fromEntries(Object.keys(specs).map((k) => [k, [] as any[]])) as Record<K, any[]> };
  const orgId = String(orgs[0]?.id ?? "");
  if (!orgId) return null;

  const at = (k: string) => r[`${SNAPSHOT_PREFIX}${k}`] ?? [];
  const full: AccessSnapshot = {
    userId,
    orgId,
    mine: at("mine"),
    teams: at("teams"),
    restrictions: at("restrictions"),
    areaGrants: at("areaGrants") as AreaGrantRow[],
  };
  const context = ((event as any).context ??= {}) as Record<string, any>;
  const cache = (context.__accessSnapshot ??= new Map<string, Entry>()) as Map<string, Entry>;
  const key = `${userId}:${orgId}`;
  if (!cache.has(key)) cache.set(key, { full: Promise.resolve(full), base: Promise.resolve({ userId, orgId, mine: full.mine }) });
  return { orgId, rows: Object.fromEntries(Object.keys(specs).map((k) => [k, r[k] ?? []])) as Record<K, any[]> };
}

/** checkAdminAccess's answer for an HOA Admin: an active or pending membership with that role (the first, as its limit-1 read). */
export function adminFrom(s: AccessBase, roles: AccessRoles) {
  const member = s.mine.find((m) => ["active", "pending"].includes(m.status));
  if (!member) return { isAdmin: false, isAppAdmin: false, isHoaAdmin: false, userId: s.userId };
  const isHoaAdmin = !!roles.hoaAdmin && roleOf(member.role) === roles.hoaAdmin;
  return { isAdmin: isHoaAdmin, isAppAdmin: false, isHoaAdmin, memberId: String(member.id), userId: s.userId };
}

/** checkMembership's answer: the first active membership. */
export function membershipFrom(s: AccessBase): { isMember: boolean; memberId?: string; memberRole?: string } {
  const member = s.mine.find((m) => m.status === "active");
  if (!member) return { isMember: false };
  return { isMember: true, memberId: String(member.id), memberRole: roleOf(member.role) ?? undefined };
}

const currentTitles = (member: any, today: string): string[] =>
  ((member?.board_member_terms ?? []) as any[])
    .filter((t) => t && typeof t === "object" && isCurrentBoardTerm(t, today))
    // As Directus's sort: ["sort"] on Postgres: ascending, nulls last.
    .sort((a, b) => (a.sort == null ? Infinity : Number(a.sort)) - (b.sort == null ? Infinity : Number(b.sort)))
    .map((t) => t.title)
    .filter((t): t is string => !!t);

/** getBoardPosition's answer: the first current office on checkMembership's membership. */
export function boardPositionFrom(s: AccessBase, today = todayUtc()): string | null {
  const member = s.mine.find((m) => m.status === "active");
  return member ? currentTitles(member, today)[0] ?? null : null;
}

/** getBoardSeatActor's answer: the first current office on any active membership, as an actor. */
export function boardSeatActorFrom(s: AccessBase, today = todayUtc()): Actor | null {
  const titles = s.mine.filter((m) => m.status === "active").flatMap((m) => currentTitles(m, today));
  return boardTitleToActor(titles[0] ?? null);
}

/**
 * isActiveBoardMember's answer (channel-enrollment.ts): an active membership
 * holding a published term that has started and not ended, compared against
 * the current timestamp as that read compares it. A date-only `term_end`
 * sorts before the same day's timestamp, so a term reads as over on its last
 * day here exactly as it does there.
 */
export function activeBoardMemberFrom(s: AccessBase, now = new Date()): boolean {
  const nowIso = now.toISOString();
  return s.mine
    .filter((m) => m.status === "active")
    .flatMap((m) => (m.board_member_terms ?? []) as any[])
    .some(
      (t) =>
        t &&
        typeof t === "object" &&
        t.status === "published" &&
        (!t.term_start || String(t.term_start) <= nowIso) &&
        (!t.term_end || String(t.term_end) >= nowIso)
    );
}

/** getManagerGrants's answer: an active Property Manager membership's grants ({} when unset), else null. */
export function managerGrantsFrom(s: AccessBase, roles: AccessRoles): Record<string, boolean> | null {
  if (!roles.propertyManager) return null;
  const member = s.mine.find((m) => m.status === "active" && roleOf(m.role) === roles.propertyManager);
  if (!member) return null;
  const mp = member.manager_permissions;
  return mp && typeof mp === "object" ? mp : {};
}

/** resolveActors' team-lead check: leads any team in the org. */
export function isTeamLeadFrom(s: AccessSnapshot): boolean {
  return s.teams.some((t) => t?.role === "lead");
}

/** getHelperAreas's answer: none without an active membership or while restricted; else helperAreasFor. */
export function helperAreasFrom(s: AccessSnapshot, now = new Date()): HelperAreaKey[] {
  const membership = membershipFrom(s);
  if (!membership.isMember || !membership.memberId) return [];
  const memberId = membership.memberId;
  if (restrictedMemberIds(s.restrictions, now).has(memberId)) return [];
  const teamIds = s.teams
    .map((r) => r?.team)
    .filter((t) => t && (t.status ?? "active") === "active" && refId(t.organization) === s.orgId)
    .map((t) => String(t.id));
  return helperAreasFor({ orgId: s.orgId, memberId, teamIds, rows: s.areaGrants, now });
}

/** The role ids from runtime config. */
export function accessRoles(): AccessRoles {
  const pub = useRuntimeConfig().public as Record<string, unknown>;
  return {
    hoaAdmin: (pub.directusRoleHoaAdmin as string) || null,
    propertyManager: (pub.directusRolePropertyManager as string) || null,
  };
}
