/**
 * Read everything a transition depends on out of Directus, in the shape the
 * pure planner wants.
 *
 * Deliberately shared by BOTH `/api/org/transition/preview` and `/execute`, and
 * that is the whole point of the file. The execute route re-reads and re-plans
 * from scratch rather than trusting a plan posted back by the client — a plan is
 * a list of row ids to write to, so accepting one from the browser would be
 * accepting "promote this member, deactivate that one" from whoever asked. If
 * preview and execute built their snapshots separately they could also drift,
 * and the admin would approve one thing while a different one ran.
 *
 * Role ids come from runtime config here, so the pure module never learns an
 * env var (see the header of `shared/transition/plan.ts`).
 */

import { readItems } from "@directus/sdk";
import type {
  BoardTitle,
  MemberSnapshot,
  MemberStatus,
  OrgSnapshot,
  RoleKind,
  TransitionInput,
  VendorSnapshot,
} from "#core/shared/transition/plan";
import { hasAnyGrant } from "#core/shared/transition/grants";

/** Fields on `hoa_organizations` the planner reads. */
const ORG_FIELDS = [
  "id",
  "name",
  "slug",
  "billing_account",
  "subscription_status",
  "is_free_account",
  "grace_ends_at",
] as const;

function idOf(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (typeof value === "object" && "id" in (value as any)) {
    return String((value as any).id);
  }
  return null;
}

export interface TransitionSnapshot {
  readonly input: TransitionInput;
  readonly organization: OrgSnapshot;
  /** Resolved once here so the executor writes the same id the planner assumed. */
  readonly hoaAdminRoleId: string;
}

export async function buildTransitionSnapshot(
  organizationId: string,
  options: {
    readonly now: string;
    readonly successorMemberId?: string | null;
    readonly outgoingMemberIds?: readonly string[] | null;
    readonly includeExportForOutgoing?: boolean;
  }
): Promise<TransitionSnapshot> {
  const config = useRuntimeConfig();
  const hoaAdminRoleId = String(config.public.directusRoleHoaAdmin || "");
  const pmRoleId = String(config.public.directusRolePropertyManager || "");
  const directus = getTypedDirectus();

  const orgs = (await directus.request(
    readItems("hoa_organizations", {
      filter: { id: { _eq: organizationId } },
      fields: [...ORG_FIELDS] as any,
      limit: 1,
    })
  )) as any[];

  const orgRow = orgs?.[0];
  if (!orgRow) {
    throw createError({ statusCode: 404, statusMessage: "Community not found." });
  }

  const billingAccountId = idOf(orgRow.billing_account);

  const organization: OrgSnapshot = {
    id: String(orgRow.id),
    name: orgRow.name || "",
    slug: orgRow.slug || "",
    billingAccountId,
    subscriptionStatus: orgRow.subscription_status ?? null,
    isFreeAccount: orgRow.is_free_account === true,
    graceEndsAt: orgRow.grace_ends_at ?? null,
  };

  // ── Members ──────────────────────────────────────────────────────────────
  const memberRows = (await directus.request(
    readItems("hoa_members", {
      filter: { organization: { _eq: organizationId } },
      fields: [
        "id",
        "first_name",
        "last_name",
        "email",
        "user",
        "role",
        "status",
        "manager_permissions",
      ] as any,
      limit: -1,
    })
  )) as any[];

  // ── Who works for the management company ─────────────────────────────────
  // The agency's own staff hold memberships — often HOA Admin, because
  // `add-property.post.ts` makes the creating agency the admin outright. The
  // planner has to know which memberships those are; see `isAgencyStaff`.
  const agencyUserIds = new Set<string>();
  if (billingAccountId) {
    const staff = (await directus.request(
      readItems("billing_account_members", {
        filter: { billing_account: { _eq: billingAccountId } },
        fields: ["user"] as any,
        limit: -1,
      })
    )) as any[];
    for (const row of staff ?? []) {
      const uid = idOf(row.user);
      if (uid) agencyUserIds.add(uid);
    }
  }

  // ── Board seats ──────────────────────────────────────────────────────────
  // `hoa_board_members` has no organization column — a term reaches its org
  // through the member, which is also how the export map scopes it.
  const memberIds = memberRows.map((m) => String(m.id));
  const boardByMemberId = new Map<string, BoardTitle | null>();
  if (memberIds.length > 0) {
    const terms = (await directus.request(
      readItems("hoa_board_members", {
        filter: { hoa_member: { _in: memberIds } },
        fields: ["hoa_member", "title", "term_end", "status"] as any,
        limit: -1,
      })
    )) as any[];

    for (const term of terms ?? []) {
      // An expired or archived term is not a current seat. `term_end` in the
      // future (or absent) means they are still serving.
      if (term.status === "archived") continue;
      if (term.term_end && new Date(term.term_end) < new Date(options.now)) continue;
      const mid = idOf(term.hoa_member);
      if (mid) boardByMemberId.set(mid, (term.title as BoardTitle) ?? null);
    }
  }

  const members: MemberSnapshot[] = memberRows.map((row) => {
    const roleId = idOf(row.role);
    const roleKind: RoleKind =
      roleId && roleId === hoaAdminRoleId
        ? "hoa_admin"
        : roleId && roleId === pmRoleId
          ? "property_manager"
          : "member";

    const userId = idOf(row.user);
    const id = String(row.id);
    const name = [row.first_name, row.last_name].filter(Boolean).join(" ").trim();

    return {
      id,
      name: name || row.email || id,
      email: row.email ?? null,
      userId,
      roleKind,
      status: (row.status as MemberStatus) ?? "active",
      isBoardMember: boardByMemberId.has(id),
      boardTitle: boardByMemberId.get(id) ?? null,
      hasGrants: hasAnyGrant(row.manager_permissions),
      isAgencyStaff: Boolean(userId && agencyUserIds.has(userId)),
    };
  });

  // ── The management company's row in the community's vendor list ──────────
  const vendorRows = (await directus.request(
    readItems("hoa_vendors", {
      filter: {
        organization: { _eq: organizationId },
        category: { _eq: "management" },
      },
      fields: ["id", "company", "status", "active_until", "user", "hoa_member"] as any,
      limit: -1,
    })
  )) as any[];

  const managementVendors: VendorSnapshot[] = (vendorRows ?? []).map((row) => ({
    id: String(row.id),
    company: row.company ?? null,
    status: row.status ?? null,
    activeUntil: row.active_until ?? null,
    userId: idOf(row.user),
    memberId: idOf(row.hoa_member),
  }));

  return {
    hoaAdminRoleId,
    organization,
    input: {
      organization,
      members,
      managementVendors,
      successorMemberId: options.successorMemberId ?? null,
      outgoingMemberIds: options.outgoingMemberIds ?? null,
      includeExportForOutgoing: options.includeExportForOutgoing === true,
      now: options.now,
    },
  };
}
