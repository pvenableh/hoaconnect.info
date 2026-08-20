/**
 * POST /api/org/transition/preview
 *
 * What would happen if this community changed management companies — computed
 * against live data, written nowhere. The wizard shows this in full before an
 * admin can commit to any of it.
 *
 * Nothing here writes, so it is safe to call on every keystroke of the successor
 * picker: choosing a different person re-plans, and the blockers change with it.
 *
 * HOA-Admin only, like the export. A plan names the members who would lose
 * access and the person who would gain the account — that is not a read anyone
 * else on the org should have.
 */

import { readItems } from "@directus/sdk";
import { eligibleSuccessors, planTransition } from "#core/shared/transition/plan";

export default defineEventHandler(async (event) => {
  await requireUserSession(event);
  const body = await readBody(event);

  const orgId = String(body?.orgId || "").trim();
  if (!orgId) throw createError({ statusCode: 400, statusMessage: "orgId is required" });

  const admin = await checkAdminAccess(event, orgId);
  if (!admin.isAdmin) {
    throw createError({
      statusCode: 403,
      statusMessage: "Only an administrator can plan a management transition.",
    });
  }

  const now = new Date().toISOString();
  const snapshot = await buildTransitionSnapshot(orgId, {
    now,
    successorMemberId: body?.successorMemberId ?? null,
    outgoingMemberIds: Array.isArray(body?.outgoingMemberIds)
      ? body.outgoingMemberIds.map(String)
      : null,
    includeExportForOutgoing: body?.includeExportForOutgoing === true,
  });

  const plan = planTransition(snapshot.input);

  // When the plan refuses for want of anybody to hand the community to, the one
  // useful thing to say next is whether somebody has already been asked. An
  // outstanding invitation turns a dead end ("invite a board member") into a
  // wait ("Dana has until the 27th to accept"), and the two need different
  // actions from the admin reading the screen.
  //
  // Only queried when it is the answer to something — this route is called on
  // every change of the successor picker.
  let pendingAdminInvites: { email: string; expiresAt: string | null }[] = [];
  if (plan.blockers.some((b) => b.code === "no_eligible_successor")) {
    try {
      const invites = (await getTypedDirectus().request(
        readItems("hoa_invitations", {
          filter: {
            organization: { _eq: orgId },
            role: { _eq: snapshot.hoaAdminRoleId },
            invitation_status: { _eq: "pending" },
            expires_at: { _gt: now } as any,
          },
          fields: ["email", "expires_at"] as any,
          limit: 10,
        })
      )) as any[];
      pendingAdminInvites = (invites ?? []).map((i) => ({
        email: i.email ?? "",
        expiresAt: i.expires_at ?? null,
      }));
    } catch (e) {
      // A missing invitation list is a worse screen, not a broken one.
      console.warn("[transition/preview] pending admin invites lookup failed:", e);
    }
  }

  return {
    plan,
    pendingAdminInvites,
    // Everyone the wizard may offer to offboard: the active property managers
    // plus the management company's own staff, whatever role those hold. The
    // admin can untick any of them, which is why the list has to come back in
    // full rather than being inferred from the plan's chosen `outgoing` — an
    // unticked person would otherwise vanish from the screen they were unticked
    // on.
    offboardable: snapshot.input.members
      .filter(
        (m) =>
          m.status === "active" &&
          (m.roleKind === "property_manager" || m.isAgencyStaff === true)
      )
      .map((m) => ({
        id: m.id,
        name: m.name,
        email: m.email,
        roleKind: m.roleKind,
        isAgencyStaff: m.isAgencyStaff === true,
        hasGrants: m.hasGrants,
      })),
    // The picker's options, ranked, from the same function the planner
    // validates against — so the UI can never offer someone it would reject.
    successors: eligibleSuccessors(snapshot.input).map((m) => ({
      id: m.id,
      name: m.name,
      email: m.email,
      isBoardMember: m.isBoardMember,
      boardTitle: m.boardTitle,
    })),
    organization: {
      id: snapshot.organization.id,
      name: snapshot.organization.name,
      slug: snapshot.organization.slug,
      billingAccountId: snapshot.organization.billingAccountId,
      graceEndsAt: snapshot.organization.graceEndsAt,
    },
  };
});
