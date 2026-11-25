/**
 * The reads behind GET /api/support/context, as one readItemsBatch.
 *
 * The route used to read the caller's HOA Admin memberships and billing
 * accounts (supportViewerFor), then their active memberships, then per
 * community the membership again and its board terms (supportRolesFor), then
 * the billing accounts again: six requests for one community, two more for
 * each further one. Directus serves requests one after another (~40ms of CPU
 * each), so the three reads below now answer all of it:
 *
 *   members   every active membership, with its community, role, residency
 *             and grants (the HOA Admin read is these rows with that role)
 *   board     published board terms on those memberships, current today
 *   accounts  billing accounts the caller owns or administers
 *
 * The answers are supportRolesFor's and supportViewerForUser's rules applied
 * to these rows.
 */
import { canAskCommunity, NO_ROLES, supportCategoriesFor, type SupportRoles } from "#core/shared/support/access";
import { residencyFor, RESIDENCY_UNIT_FIELDS } from "#core/shared/members/residency";
import { normalizeGrants, MANAGER_GRANT_KEYS } from "#core/shared/transition/grants";
import type { BatchSpec } from "./directus-graphql";

const idOf = (v: unknown): string | null =>
  v && typeof v === "object" ? ((v as { id?: string }).id ?? null) : typeof v === "string" && v ? v : null;

export function supportContextSpecs(userId: string, today: string) {
  return {
    sup_members: {
      collection: "hoa_members",
      filter: { user: { _eq: userId }, status: { _eq: "active" } },
      fields: ["id", "role", "member_type", "manager_permissions", ...RESIDENCY_UNIT_FIELDS, "organization.id", "organization.name", "organization.slug"],
      // supportRolesFor took the first active membership in a community (by id).
      sort: ["id"],
      limit: -1,
    },
    sup_board: {
      collection: "hoa_board_members",
      filter: {
        _and: [
          { hoa_member: { user: { _eq: userId }, status: { _eq: "active" } } },
          { status: { _eq: "published" } },
          { _or: [{ term_start: { _lte: today } }, { term_start: { _null: true } }] },
          { _or: [{ term_end: { _gte: today } }, { term_end: { _null: true } }] },
        ],
      },
      fields: ["hoa_member", "title"],
      limit: -1,
    },
    sup_accounts: {
      collection: "billing_account_members",
      filter: { user: { _eq: userId }, role: { _in: ["owner", "billing_admin"] } },
      fields: ["role", "billing_account.id", "billing_account.name"],
      limit: -1,
    },
  } satisfies Record<string, BatchSpec>;
}

export type SupportContextRows = Record<keyof ReturnType<typeof supportContextSpecs>, any[]>;

/** The hats one membership wears (supportRolesFor for a community). */
export function supportRolesOf(member: any, board: readonly any[], roles: { hoaAdmin?: string | null; propertyManager?: string | null }): SupportRoles {
  const out: SupportRoles = { ...NO_ROLES, boardTitles: [], managerGrants: [] };
  if (!member) return out;
  const role = idOf(member.role);
  out.membership = role === roles.hoaAdmin ? "hoa_admin" : role === roles.propertyManager ? "property_manager" : "member";
  out.residency = residencyFor(member) ?? null;
  if (out.membership === "property_manager") {
    const g = normalizeGrants(member.manager_permissions);
    out.managerGrants = MANAGER_GRANT_KEYS.filter((k) => g[k]);
  }
  const mine = board.filter((b) => idOf(b.hoa_member) === String(member.id));
  out.boardTitles = [...new Set(mine.map((b) => String(b.title)).filter(Boolean))];
  return out;
}

/** The route's answer from the rows. */
export function supportContextFrom(
  rows: SupportContextRows,
  viewer: { staff: boolean },
  roles: { hoaAdmin?: string | null; propertyManager?: string | null }
) {
  // supportViewerForUser's HOA Admin read: active memberships with that role.
  const adminOf = new Set(
    rows.sup_members.filter((m) => roles.hoaAdmin && idOf(m.role) === roles.hoaAdmin).map((m) => idOf(m.organization)).filter((x): x is string => !!x)
  );
  const firstIn = new Map<string, any>();
  for (const m of rows.sup_members) {
    const org = idOf(m.organization);
    if (org && !firstIn.has(org)) firstIn.set(org, m);
  }
  const communities = rows.sup_members
    .map((m) => m.organization)
    .filter((o: any) => o && idOf(o))
    .map((o: any) => {
      const id = idOf(o)!;
      const r = supportRolesOf(firstIn.get(id), rows.sup_board, roles);
      return {
        id,
        name: o.name || o.slug,
        slug: o.slug ?? null,
        canAsk: canAskCommunity(r),
        categories: supportCategoriesFor(r),
        isAdmin: adminOf.has(id),
      };
    });

  const accounts = rows.sup_accounts
    .filter((a) => idOf(a.billing_account))
    .map((a) => ({
      id: idOf(a.billing_account)!,
      name: a.billing_account?.name ?? "Billing account",
      categories: supportCategoriesFor({ membership: null, boardTitles: [], residency: null, managerGrants: [], billingAccountRole: a.role }),
    }));

  return {
    communities: communities.sort((a, b) => String(a.name).localeCompare(String(b.name))),
    accounts,
    staff: viewer.staff,
    adminOfAny: adminOf.size > 0,
  };
}
