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

  return {
    plan,
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
