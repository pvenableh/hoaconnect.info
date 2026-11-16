/**
 * An owner reports that their unit is rented; one approval records the lease
 * and links or invites the tenant.
 *
 *   buildLeaseChange   POST /api/org/change-requests (kind "lease"): the unit
 *                      is one the submitter owns, the document a PDF they
 *                      uploaded here (Records › Leases), the dates in order.
 *   applyLeaseRequest  approval: the tenant is linked to the unit if they are
 *                      a member here, else invited as its tenant; then the
 *                      `hoa_leases` row, as POST /api/hoa/units/records writes
 *                      it (owner = the submitter, status active, the document).
 *   claimInvitedLeases accept-invitation: an invited tenant who joins becomes
 *                      the tenant of the lease that invited them.
 *
 * The lease is written at approval with no tenant when the tenant is invited,
 * and gets one when they join, rather than waiting on the request: the unit
 * page shows the unit is rented, with its dates and lease, from the day it is
 * approved, and nobody has to come back to finish it. The request keeps the
 * tenant's name and email meanwhile, and the unit page shows them as invited.
 *
 * Written with the app's token, as the records route is: no HOA Member rule on
 * `hoa_leases` exists or is added.
 */
import { createItem, readItem, readItems, readUser, updateItem } from "@directus/sdk";
import { dateInputToTimestamp } from "#core/shared/units/record-dates";
import { leaseRequestInput, type LeaseRequestPayload } from "#core/shared/units/lease-requests";
import { assertOwnLeaseUpload, memberOwnedUnitsInOrg } from "./unit-record-writes";
import { issueInvitation } from "./invitations";

const idOf = (v: unknown): string | null =>
  typeof v === "string" ? v : ((v as { id?: unknown } | null)?.id as string | undefined) ?? null;

/** Check an owner's lease report and return what the request stores. */
export async function buildLeaseChange(input: {
  orgId: string;
  memberId: string;
  userId: string;
  payload: unknown;
}): Promise<{ action: "create"; target_collection: "hoa_leases"; target_id: null; payload: LeaseRequestPayload }> {
  const { orgId, memberId, userId } = input;
  const owned = await memberOwnedUnitsInOrg(orgId, memberId);
  if (!owned.length) throw createError({ statusCode: 403, message: "Only an owner of a unit here can report a lease." });

  const parsed = leaseRequestInput.safeParse(input.payload ?? {});
  if (!parsed.success) throw createError({ statusCode: 400, message: parsed.error.issues[0]?.message ?? "Check the form." });
  const p = parsed.data;

  const unit = owned.length === 1 && !p.unit_id ? owned[0]! : owned.find((u) => u.id === p.unit_id);
  if (!unit) {
    throw createError({ statusCode: 400, message: p.unit_id ? "That unit isn't one you own." : "Pick the unit you rent out." });
  }

  const me = (await getTypedDirectus()
    .request(readItem("hoa_members", memberId, { fields: ["id", "email"] }))
    .catch(() => null)) as { email?: string | null } | null;
  if (me?.email && me.email.trim().toLowerCase() === p.tenant_email) {
    throw createError({ statusCode: 400, message: "Enter your tenant's email, not yours." });
  }

  const { filename } = await assertOwnLeaseUpload(orgId, p.document, userId);

  return {
    action: "create",
    target_collection: "hoa_leases",
    target_id: null,
    payload: {
      unit_id: unit.id,
      unit_number: unit.unit_number,
      tenant_first_name: p.tenant_first_name,
      tenant_last_name: p.tenant_last_name,
      tenant_email: p.tenant_email,
      start_date: dateInputToTimestamp(p.start_date)!,
      end_date: dateInputToTimestamp(p.end_date)!,
      document: p.document,
      document_name: filename,
    },
  };
}

export type TenantOutcome = "linked" | "already_linked" | "invited" | "already_invited";

export interface LeaseApproval {
  leaseId: string;
  tenant: TenantOutcome;
  tenantName: string;
  unitNumber: string | null;
}

/**
 * Link `memberId` to `unitId` as its tenant, unless a current link exists
 * (then only a link with no residency is told it is a tenant's). A new link
 * is primary only when they have no other current primary.
 */
async function linkTenant(memberId: string, unitId: string, startDay: string | null): Promise<"linked" | "already_linked"> {
  const directus = getTypedDirectus();
  const today = new Date().toISOString().slice(0, 10);
  const links = ((await directus.request(
    readItems("hoa_member_units", {
      filter: { member_id: { _eq: memberId } },
      fields: ["id", "unit_id", "is_primary_unit", "status", "end_date", "member_type"],
      limit: -1,
    })
  )) ?? []) as Array<{ id: string; unit_id?: unknown; is_primary_unit?: boolean | null; status?: string | null; end_date?: string | null; member_type?: string | null }>;
  const current = links.filter((l) => l.status !== "archived" && !(l.end_date && l.end_date.slice(0, 10) < today));
  const here = current.find((l) => idOf(l.unit_id) === unitId);
  if (here) {
    if (!here.member_type) await directus.request(updateItem("hoa_member_units", here.id, { member_type: "tenant" }));
    return "already_linked";
  }
  await directus.request(
    createItem("hoa_member_units", {
      member_id: memberId,
      unit_id: unitId,
      is_primary_unit: !current.some((l) => l.is_primary_unit),
      member_type: "tenant",
      start_date: startDay ?? today,
      status: "published",
    })
  );
  return "linked";
}

/** Who the invitation says it is from: the owner, whose name the tenant knows, if their account can sign it; else the reviewer. */
async function inviter(ownerUserId: string | null, reviewerUserId: string): Promise<{ userId: string; name: string }> {
  for (const id of [ownerUserId, reviewerUserId]) {
    if (!id) continue;
    const u = (await getTypedDirectus()
      .request(readUser(id, { fields: ["id", "first_name", "last_name", "email"] }))
      .catch(() => null)) as { first_name?: string | null; last_name?: string | null; email?: string | null } | null;
    // accept-invitation refuses an invitation whose sender has no first name or email.
    if (u?.first_name && u.email) return { userId: id, name: [u.first_name, u.last_name].filter(Boolean).join(" ") };
  }
  return { userId: reviewerUserId, name: "" };
}

/**
 * Record an approved lease report. Safe to run again after a failure part
 * way: a lease already written for this request is not written twice, a link
 * that exists is kept, and a pending invitation is reused.
 */
export async function applyLeaseRequest(cr: any, ctx: { reviewerUserId: string }): Promise<LeaseApproval> {
  const directus = getTypedDirectus();
  const p = (cr.payload || {}) as LeaseRequestPayload;
  const memberId = idOf(cr.member)!;
  const orgId = idOf(cr.organization)!;
  const tenantName = [p.tenant_first_name, p.tenant_last_name].filter(Boolean).join(" ") || "the tenant";
  const unitLabel = p.unit_number ? `Unit ${p.unit_number}` : "That unit";

  // The unit must still be the owner's: a sold unit's lease is the new owner's to report.
  const owned = await memberOwnedUnitsInOrg(orgId, memberId);
  if (!owned.some((u) => u.id === p.unit_id)) {
    throw createError({ statusCode: 409, message: `${unitLabel} isn't theirs any more. Reject this request with a note.` });
  }
  if (!p.document || !p.tenant_email || !p.start_date || !p.end_date) {
    throw createError({ statusCode: 409, message: "This request is missing the tenant, dates or lease. Reject it with a note." });
  }

  // The tenant: a member here with that email, or someone to invite.
  const email = p.tenant_email.trim().toLowerCase();
  const people = ((await directus.request(
    readItems("hoa_members", {
      filter: { organization: { _eq: orgId }, email: { _eq: email } },
      fields: ["id", "status", "user", "date_created"],
      sort: ["date_created"],
      limit: -1,
    })
  )) ?? []) as Array<{ id: string; status?: string | null; user?: unknown }>;
  const active = people.filter((m) => m.status === "active");
  // Someone who has signed in before someone who has not, as accept-invitation adopts.
  const member = active.find((m) => idOf(m.user)) ?? active[0] ?? null;
  if (!member && people.length) {
    throw createError({
      statusCode: 409,
      message: `${email} belongs to a former member here. Restore them on the Members page, then approve.`,
    });
  }

  let tenant: TenantOutcome;
  let invitationId: string | null = p.invitation_id ?? null;
  if (member) {
    tenant = await linkTenant(member.id, p.unit_id, p.start_date.slice(0, 10));
  } else {
    const pending = (await directus.request(
      readItems("hoa_invitations", {
        filter: {
          email: { _eq: email },
          organization: { _eq: orgId },
          invitation_status: { _eq: "pending" },
          expires_at: { _gt: new Date().toISOString() } as never,
        },
        fields: ["id"],
        limit: 1,
      })
    )) as Array<{ id: string }>;
    if (pending?.length) {
      tenant = "already_invited";
      invitationId = pending[0]!.id;
    } else {
      const from = await inviter(idOf(cr.submitted_by), ctx.reviewerUserId);
      const invitation = await issueInvitation({
        organizationId: orgId,
        email,
        firstName: p.tenant_first_name,
        lastName: p.tenant_last_name,
        roleId: String(useRuntimeConfig().public.directusRoleMember),
        invitedByUserId: from.userId,
        inviterName: from.name,
        memberType: "tenant",
        unitId: p.unit_id,
      });
      tenant = "invited";
      invitationId = invitation.id;
    }
  }

  // The lease, once per request.
  let leaseId = idOf(cr.target_id);
  if (leaseId) {
    const existing = await directus.request(readItem("hoa_leases", leaseId, { fields: ["id"] })).catch(() => null);
    if (!existing) leaseId = null;
  }
  if (!leaseId) {
    const lease = await directus.request(
      createItem("hoa_leases", {
        unit: p.unit_id,
        organization: orgId,
        owner: memberId,
        tenant: member?.id ?? null,
        status: "active",
        start_date: p.start_date,
        end_date: p.end_date,
        document: p.document,
      })
    );
    leaseId = lease.id;
  }

  await directus.request(
    updateItem("hoa_member_change_requests", cr.id, {
      target_id: leaseId,
      payload: { ...p, lease_id: leaseId, tenant_member_id: member?.id ?? null, invitation_id: invitationId },
    })
  );

  return { leaseId: leaseId!, tenant, tenantName, unitNumber: p.unit_number ?? null };
}

/**
 * A person who joined from an invitation becomes the tenant of every approved
 * lease here that named their email and has no tenant yet, and is linked to
 * its unit as its tenant. Returns how many leases they took.
 */
export async function claimInvitedLeases(orgId: string, email: string, memberId: string): Promise<number> {
  const directus = getTypedDirectus();
  const wanted = email.trim().toLowerCase();
  const requests = ((await directus.request(
    readItems("hoa_member_change_requests", {
      filter: { organization: { _eq: orgId }, kind: { _eq: "lease" as never }, status: { _eq: "approved" }, target_id: { _nnull: true } },
      fields: ["id", "target_id", "payload"],
      limit: -1,
    })
  )) ?? []) as Array<{ id: string; target_id: string; payload?: Partial<LeaseRequestPayload> | null }>;

  let claimed = 0;
  for (const r of requests) {
    if ((r.payload?.tenant_email ?? "").trim().toLowerCase() !== wanted) continue;
    const lease = (await directus
      .request(readItem("hoa_leases", r.target_id, { fields: ["id", "tenant", "organization", "unit", "start_date"] }))
      .catch(() => null)) as { id: string; tenant?: unknown; organization?: unknown; unit?: unknown; start_date?: string | null } | null;
    if (!lease || idOf(lease.organization) !== orgId || idOf(lease.tenant)) continue;
    await directus.request(updateItem("hoa_leases", lease.id, { tenant: memberId }));
    const unitId = idOf(lease.unit);
    if (unitId) await linkTenant(memberId, unitId, lease.start_date?.slice(0, 10) ?? null);
    await directus.request(updateItem("hoa_member_change_requests", r.id, { payload: { ...r.payload, tenant_member_id: memberId } }));
    claimed++;
  }
  return claimed;
}

/**
 * Give each lease with no tenant the name of the tenant its owner's report
 * invited, as `invited_tenant`, until they join and become its tenant. The
 * email only with `withEmail` (the owner who typed it, an admin).
 */
export async function withInvitedTenants<T extends { id: string; tenant?: unknown }>(
  orgId: string,
  leases: T[],
  opts: { withEmail?: boolean } = {}
): Promise<Array<T & { invited_tenant?: { first_name: string | null; last_name: string | null; email: string | null } }>> {
  const waiting = leases.filter((l) => !l.tenant).map((l) => l.id);
  if (!waiting.length) return leases;
  const reports = ((await getTypedDirectus().request(
    readItems("hoa_member_change_requests", {
      filter: { organization: { _eq: orgId }, kind: { _eq: "lease" as never }, status: { _eq: "approved" }, target_id: { _in: waiting } },
      fields: ["target_id", "payload"],
      limit: -1,
    })
  )) ?? []) as Array<{ target_id?: string | null; payload?: Partial<LeaseRequestPayload> | null }>;
  return leases.map((l) => {
    const p = l.tenant ? null : reports.find((r) => r.target_id === l.id)?.payload;
    return p?.tenant_email
      ? {
          ...l,
          invited_tenant: { first_name: p.tenant_first_name ?? null, last_name: p.tenant_last_name ?? null, email: opts.withEmail ? p.tenant_email : null },
        }
      : l;
  });
}
