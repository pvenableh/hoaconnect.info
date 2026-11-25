/**
 * The server side of the RoleContext (docs/spec-role-context.md): read the
 * caller's rows for ONE org and hand them to the shared pure resolver.
 *
 * Every read is filtered by the session user and the org asked for; nothing
 * the client sends besides `orgId` is used. Not an enforcement point yet —
 * routes still call checkAdminAccess / requireAdminOrManagerGrant, which this
 * resolves identically.
 */
import type { H3Event } from "h3";
import { accessSnapshot, batchWithAccessSnapshot } from "./access-snapshot";
import type { BatchSpec } from "./directus-graphql";
import { readItem, readItems } from "@directus/sdk";
import { capabilitiesFor, type Actor, type Capability } from "#core/shared/permissions";
import { roleIdOf } from "#core/shared/ops/permissions";
import { RESIDENCY_UNIT_FIELDS } from "#core/shared/members/residency";
import {
  emptyRoleContext,
  resolveRoleContext,
  type RoleBillingAccount,
  type RoleBoardTerm,
  type RoleContext,
  type RoleIds,
  type RoleMembership,
} from "#core/shared/roles/role-context";

/** The role ids the server resolves with — the same ones checkAdminAccess and getManagerGrants use. */
export function serverRoleIds(): RoleIds {
  const config = useRuntimeConfig();
  return {
    appAdmin: config.public.directusRoleAppAdmin as string | undefined,
    propertyManager: config.public.directusRolePropertyManager as string | undefined,
    adminRoleIds: [config.public.directusRoleHoaAdmin as string | undefined],
  };
}

const STATUS_RANK: Record<string, number> = { active: 0, pending: 1, inactive: 2, archived: 3 };

/** One row per person per org is the rule; if there are more, the live one wins. */
function pickMembership(rows: RoleMembership[]): RoleMembership | null {
  if (!rows.length) return null;
  return [...rows].sort((a, b) => (STATUS_RANK[a.status ?? ""] ?? 9) - (STATUS_RANK[b.status ?? ""] ?? 9))[0] ?? null;
}

async function readBillingAccount(orgId: string, userId: string): Promise<RoleBillingAccount | null> {
  const directus = getTypedDirectus();
  const org = (await directus.request(
    readItem("hoa_organizations", orgId, { fields: ["billing_account"] })
  )) as { billing_account?: string | { id?: string } | null } | null;
  const accountId = roleIdOf(org?.billing_account);
  if (!accountId) return null;
  // The account and the caller's seat on it both need only the account id.
  const [account, members] = (await Promise.all([
    directus.request(readItem("billing_accounts", accountId, { fields: ["id", "owner"] })),
    directus.request(
      readItems("billing_account_members", {
        filter: { billing_account: { _eq: accountId }, user: { _eq: userId } },
        fields: ["user", "role"],
        limit: 10,
      })
    ),
  ])) as [{ owner?: string | { id?: string } | null } | null, RoleBillingAccount["members"]];
  return { owner: account?.owner ?? null, members: members ?? [] };
}

export interface ResolvedRoleContext {
  context: RoleContext;
  /** An active or pending membership here, or the platform App Admin. */
  allowed: boolean;
}

/** The caller's RoleContext in `orgId`. */
export async function getRoleContext(event: H3Event, orgId: string): Promise<ResolvedRoleContext> {
  const { context, allowed } = await getRoleContextWith(event, orgId, {});
  return { context, allowed };
}

/** The membership fields resolveRoleContext reads (the `*` read's, named, plus residency). */
export const ROLE_MEMBERSHIP_FIELDS = [
  "id", "organization", "status", "role", "manager_permissions", "is_manager", "manager_title", "manager_areas",
  "member_type", ...RESIDENCY_UNIT_FIELDS,
] as const;

type RoleKey = "rc_members" | "rc_terms" | "rc_org" | "rc_seats";

/**
 * getRoleContext's reads as batch specs, all keyed on the caller and the
 * community so none waits for another: the caller's memberships, the current
 * terms on any of them, the community's billing account (with its owner), and
 * the caller's seats on billing accounts. `roleInputsFrom` narrows them to
 * what the reads one by one return.
 */
export function roleContextSpecs(userId: string, orgId: string, today = new Date().toISOString().split("T")[0]): Record<RoleKey, BatchSpec> {
  return {
    rc_members: {
      collection: "hoa_members",
      filter: { user: { _eq: userId }, organization: { _eq: orgId } },
      fields: ROLE_MEMBERSHIP_FIELDS,
      limit: 10,
    },
    rc_terms: {
      collection: "hoa_board_members",
      filter: {
        _and: [
          { hoa_member: { user: { _eq: userId }, organization: { _eq: orgId } } },
          { status: { _eq: "published" } },
          { _or: [{ term_start: { _lte: today } }, { term_start: { _null: true } }] },
          { _or: [{ term_end: { _gte: today } }, { term_end: { _null: true } }] },
        ],
      },
      fields: ["title", "hoa_member"],
      sort: ["sort"],
      limit: -1,
    },
    rc_org: { collection: "hoa_organizations", filter: { id: { _eq: orgId } }, fields: ["billing_account.id", "billing_account.owner"], limit: 1 },
    rc_seats: {
      collection: "billing_account_members",
      filter: { user: { _eq: userId } },
      fields: ["user", "role", "billing_account"],
      limit: -1,
    },
  };
}

interface RoleInputs {
  membership: RoleMembership | null;
  terms: RoleBoardTerm[];
  billing: RoleBillingAccount | null;
}

/**
 * The membership, current terms and billing account from `roleContextSpecs`'
 * rows, as the reads one by one find them. Null when the community has no row:
 * those reads fail there, so the caller runs them to fail the same way.
 */
export function roleInputsFrom(read: Record<RoleKey, any[]>): RoleInputs | null {
  const org = read.rc_org?.[0];
  if (!org) return null;
  const membership = pickMembership((read.rc_members ?? []) as RoleMembership[]);
  const active = membership?.id && membership.status === "active";
  const terms = active
    ? (read.rc_terms ?? []).filter((t) => roleIdOf(t.hoa_member) === membership.id).map((t) => ({ title: t.title }) as RoleBoardTerm)
    : [];
  const account = org.billing_account && typeof org.billing_account === "object" ? org.billing_account : null;
  const accountId = roleIdOf(account);
  const billing = accountId
    ? {
        owner: account.owner ?? null,
        members: (read.rc_seats ?? [])
          .filter((m) => roleIdOf(m.billing_account) === accountId)
          .slice(0, 10)
          .map((m) => ({ user: m.user, role: m.role })),
      }
    : null;
  return { membership, terms, billing };
}

/** getRoleContext's reads one by one: the fallback, and the shape `roleInputsFrom` matches. */
export async function readRoleInputsOneByOne(userId: string, orgId: string): Promise<RoleInputs> {
  const directus = getTypedDirectus();

  // `*`, not a field list: until scripts/add-manager-hat.ts has run the manager
  // fields do not exist, and naming a missing field fails the whole read.
  const rows = (await directus.request(
    readItems("hoa_members", {
      filter: { user: { _eq: userId }, organization: { _eq: orgId } },
      fields: ["*", ...RESIDENCY_UNIT_FIELDS] as any,
      limit: 10,
    })
  )) as RoleMembership[];
  const membership = pickMembership(rows ?? []);

  // Terms and billing both need only the membership above (or nothing), never
  // each other: read them in one round trip.
  const active = membership?.id && membership.status === "active";
  const today = new Date().toISOString().split("T")[0];
  // Current terms, read exactly as getBoardPosition reads them.
  const [terms, billing] = await Promise.all([
    active
      ? directus
          .request(
            readItems("hoa_board_members", {
              filter: {
                _and: [
                  { hoa_member: { _eq: membership.id } },
                  { status: { _eq: "published" } },
                  { _or: [{ term_start: { _lte: today } }, { term_start: { _null: true } }] },
                  { _or: [{ term_end: { _gte: today } }, { term_end: { _null: true } }] },
                ],
              } as any,
              fields: ["title"],
              sort: ["sort"],
            })
          )
          .then((r) => ((r ?? []) as RoleBoardTerm[]))
      : Promise.resolve([] as RoleBoardTerm[]),
    readBillingAccount(orgId, userId),
  ]);
  return { membership, terms, billing };
}

/**
 * getRoleContext, with a route's own reads in the same Directus request: the
 * caller's memberships, terms and billing, their full access standing
 * (batchWithAccessSnapshot, which also answers the helper areas) and `extra`,
 * as ONE batch. A route that decides from the context must still refuse
 * before it returns any of `extra`'s rows. Keys `rc_*` and `access_*` are
 * reserved. If the batch fails (manager fields not migrated yet, say), the
 * context is read one by one as before and `extra` on its own.
 */
export async function getRoleContextWith<K extends string>(
  event: H3Event,
  orgId: string,
  extra: Record<K, BatchSpec>
): Promise<ResolvedRoleContext & { rows: Record<K, any[]> }> {
  const readExtra = async (): Promise<Record<K, any[]>> =>
    Object.keys(extra).length ? readItemsBatch(extra) : ({} as Record<K, any[]>);
  const session = await getUserSession(event);
  const userId: string | null = session?.user?.id ?? null;
  if (!userId) return { context: emptyRoleContext(orgId), allowed: false, rows: await readExtra() };

  const roles = serverRoleIds();
  const globalRoleId = roleIdOf(session?.user?.role);

  for (const k of Object.keys(extra)) {
    if (k.startsWith("rc_")) throw new Error(`batch key ${k} uses the reserved rc_ prefix`);
  }
  const read = await batchWithAccessSnapshot(event, orgId, { ...roleContextSpecs(userId, orgId), ...extra } as Record<RoleKey | K, BatchSpec>).catch(
    (e: any) => {
      if (!(e instanceof ReferenceError)) console.warn("[role-context] batch failed; reading one by one:", e?.message ?? e);
      return null;
    }
  );
  const inputs = (read && roleInputsFrom(read)) || (await readRoleInputsOneByOne(userId, orgId));
  const rows = read ? (Object.fromEntries(Object.keys(extra).map((k) => [k, read[k as K] ?? []])) as Record<K, any[]>) : await readExtra();

  // Helper and committee areas (docs/spec-delegation.md). The reader requires
  // an active membership, and the resolver ignores them on any other status.
  const helperAreas = inputs.membership?.status === "active" ? await getHelperAreas(event, orgId) : [];
  const context = resolveRoleContext(inputs.membership, inputs.terms, inputs.billing, { userId, globalRoleId, roles, orgId, helperAreas });
  const isAppAdmin = !!roles.appAdmin && globalRoleId === roles.appAdmin;
  const live = inputs.membership?.status === "active" || inputs.membership?.status === "pending";
  return { context, allowed: live || isAppAdmin, rows };
}

/**
 * Actor hats + capabilities for UI gating, with the PM `projects` grant layered
 * on the static matrix the way project-access.ts layers it. Shared by
 * /api/org/capabilities and /api/org/role-context so the two cannot drift.
 */
export async function resolveCapabilities(
  event: H3Event,
  orgId: string,
  /** `helpers: false` leaves out the helper-area read, for a caller that only asks about capabilities no helper area adds (money:read). */
  opts: { helpers?: boolean } = {}
): Promise<{ actors: Actor[]; capabilities: Capability[] }> {
  // Every question below answers from one read of the caller's standing
  // (access-snapshot.ts): read all of it first, so it is one request.
  await accessSnapshot(event, orgId);
  // Actors, manager grants and helper areas are independent reads: one round trip.
  // The grants are read once and shared with resolveActors.
  const grantsRead = getManagerGrants(event, orgId);
  const [actors, grants, helps] = await Promise.all([
    resolveActors(event, orgId, grantsRead),
    grantsRead,
    opts.helpers === false ? Promise.resolve([] as Awaited<ReturnType<typeof getHelperAreas>>) : getHelperAreas(event, orgId),
  ]);
  const caps = new Set(capabilitiesFor(actors));
  if (grants?.projects === true || helps.includes("projects")) {
    caps.add("projects:write");
    caps.add("milestone:approve");
  }
  // A property manager with the projects grant enters expenses
  // (docs/spec-money-approvals.md). A helper with the projects area does not:
  // the grant is the manager's, and a helper is a member.
  if (grants?.projects === true) caps.add("money:enter");

  return { actors, capabilities: [...caps] };
}

/** Published board terms on `who` that are current on `today`, as getRoleContext reads them. */
function currentTermsOf(who: Record<string, unknown>, today: string) {
  return {
    _and: [
      who,
      { status: { _eq: "published" } },
      { _or: [{ term_start: { _lte: today } }, { term_start: { _null: true } }] },
      { _or: [{ term_end: { _gte: today } }, { term_end: { _null: true } }] },
    ],
  } as any;
}

/**
 * getMembershipHats' reads as ONE batch: the caller's memberships in every
 * community, and the current terms on any of them (each membership's are
 * picked out by id, as the read per membership found them). The members read
 * names ROLE_MEMBERSHIP_FIELDS rather than `*`, as roleContextSpecs does.
 */
export function membershipHatsSpecs(userId: string, today: string) {
  return {
    hats_members: {
      collection: "hoa_members",
      filter: { user: { _eq: userId } },
      fields: ROLE_MEMBERSHIP_FIELDS,
      limit: 200,
    },
    hats_terms: {
      collection: "hoa_board_members",
      filter: currentTermsOf({ hoa_member: { user: { _eq: userId } } }, today),
      fields: ["title", "hoa_member"],
      limit: -1,
    },
  } satisfies Record<string, BatchSpec>;
}

/** One membership's hats, for the org switcher's badge. Identity only. */
export interface MembershipHats {
  orgId: string;
  hats: RoleContext["hats"];
  managerTitle: string | null;
  residency: RoleContext["residency"];
}

/**
 * The session user's hats in every community they belong to, for the org
 * switcher (docs/spec-capability-nav.md). Reads only the caller's own rows,
 * with the admin token and `*`, so the client never names the manager fields.
 * Board terms are read per membership exactly as getRoleContext reads them.
 */
export async function getMembershipHats(event: H3Event): Promise<MembershipHats[]> {
  const session = await getUserSession(event);
  const userId: string | null = session?.user?.id ?? null;
  if (!userId) return [];
  const roles = serverRoleIds();
  const globalRoleId = roleIdOf(session?.user?.role);
  const today = new Date().toISOString().split("T")[0]!;
  const batched = await Promise.resolve()
    .then(() => readItemsBatch(membershipHatsSpecs(userId, today)))
    .catch((e: any) => {
    if (!(e instanceof ReferenceError)) console.warn("[role-context] hats batch failed; reading one by one:", e?.message ?? e);
    return null;
  });
  const directus = getTypedDirectus();

  const rows = (batched
    ? batched.hats_members
    : ((await directus.request(
        readItems("hoa_members", {
          filter: { user: { _eq: userId } },
          fields: ["*", ...RESIDENCY_UNIT_FIELDS] as any,
          limit: 200,
        })
      )) ?? [])) as RoleMembership[];

  const byOrg = new Map<string, RoleMembership[]>();
  for (const row of rows) {
    const orgId = roleIdOf(row.organization as any);
    if (!orgId) continue;
    byOrg.set(orgId, [...(byOrg.get(orgId) ?? []), row]);
  }

  const out: MembershipHats[] = [];
  for (const [orgId, orgRows] of byOrg) {
    const membership = pickMembership(orgRows);
    let terms: RoleBoardTerm[] = [];
    if (membership?.id && membership.status === "active") {
      terms = batched
        ? batched.hats_terms.filter((t) => roleIdOf(t.hoa_member) === membership.id).map((t) => ({ title: t.title }) as RoleBoardTerm)
        : (((await directus.request(
            readItems("hoa_board_members", {
              filter: currentTermsOf({ hoa_member: { _eq: membership.id } }, today),
              fields: ["title"],
            })
          )) ?? []) as RoleBoardTerm[]);
    }
    const ctx = resolveRoleContext(membership, terms, null, { userId, globalRoleId, roles, orgId });
    out.push({ orgId, hats: ctx.hats, managerTitle: ctx.managerTitle, residency: ctx.residency });
  }
  return out;
}
