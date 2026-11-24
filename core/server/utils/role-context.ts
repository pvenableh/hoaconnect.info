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
  const session = await getUserSession(event);
  const userId: string | null = session?.user?.id ?? null;
  if (!userId) return { context: emptyRoleContext(orgId), allowed: false };

  const roles = serverRoleIds();
  const globalRoleId = roleIdOf(session?.user?.role);
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

  // Terms, billing and helper areas all need only the membership above (or
  // nothing), never each other: read them in one round trip.
  const active = membership?.id && membership.status === "active";
  const today = new Date().toISOString().split("T")[0];
  // Current terms, read exactly as getBoardPosition reads them.
  const [terms, billing, helperAreas] = await Promise.all([
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
    // Helper and committee areas (docs/spec-delegation.md). The reader requires
    // an active membership, and the resolver ignores them on any other status.
    membership?.status === "active" ? getHelperAreas(event, orgId) : Promise.resolve([]),
  ]);
  const context = resolveRoleContext(membership, terms, billing, { userId, globalRoleId, roles, orgId, helperAreas });
  const isAppAdmin = !!roles.appAdmin && globalRoleId === roles.appAdmin;
  const live = membership?.status === "active" || membership?.status === "pending";
  return { context, allowed: live || isAppAdmin };
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
  const directus = getTypedDirectus();

  const rows = ((await directus.request(
    readItems("hoa_members", {
      filter: { user: { _eq: userId } },
      fields: ["*", ...RESIDENCY_UNIT_FIELDS] as any,
      limit: 200,
    })
  )) ?? []) as RoleMembership[];

  const byOrg = new Map<string, RoleMembership[]>();
  for (const row of rows) {
    const orgId = roleIdOf(row.organization as any);
    if (!orgId) continue;
    byOrg.set(orgId, [...(byOrg.get(orgId) ?? []), row]);
  }

  const today = new Date().toISOString().split("T")[0];
  const out: MembershipHats[] = [];
  for (const [orgId, orgRows] of byOrg) {
    const membership = pickMembership(orgRows);
    let terms: RoleBoardTerm[] = [];
    if (membership?.id && membership.status === "active") {
      terms = ((await directus.request(
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
        })
      )) ?? []) as RoleBoardTerm[];
    }
    const ctx = resolveRoleContext(membership, terms, null, { userId, globalRoleId, roles, orgId });
    out.push({ orgId, hats: ctx.hats, managerTitle: ctx.managerTitle, residency: ctx.residency });
  }
  return out;
}
