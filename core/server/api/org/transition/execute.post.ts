/**
 * POST /api/org/transition/execute
 *
 * Carry out the management transition. This is what replaces the old one-shot
 * `detach-org`: a board whose manager leaves keeps an administrator, keeps
 * working through a grace window, and ends up with a permanent record of what
 * happened instead of a locked account and no explanation.
 *
 * **The plan is rebuilt here from live data and the posted one is ignored.** A
 * plan is a list of row ids to write to; accepting one from the browser would be
 * accepting "promote this member, deactivate that one" from whoever asked. The
 * client sends only the three choices a human actually made — who takes over,
 * who is leaving, whether to hand the outgoing manager an export — and the
 * server decides what those mean.
 *
 * The trade-off that buys: the plan the admin approved a moment ago might not be
 * the plan that runs, if the org changed underneath them. So the response
 * carries the plan that actually executed, and the wizard shows it.
 */

import { planTransition } from "#core/shared/transition/plan";

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const body = await readBody(event);

  const orgId = String(body?.orgId || "").trim();
  if (!orgId) throw createError({ statusCode: 400, statusMessage: "orgId is required" });

  const admin = await checkAdminAccess(event, orgId);
  if (!admin.isAdmin) {
    throw createError({
      statusCode: 403,
      statusMessage: "Only an administrator can carry out a management transition.",
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

  const user: any = session.user ?? {};
  const actorName =
    [user.first_name, user.last_name].filter(Boolean).join(" ").trim() ||
    user.email ||
    "An administrator";

  const result = await executeTransitionPlan({
    plan,
    organizationId: snapshot.organization.id,
    organizationName: snapshot.organization.name,
    hoaAdminRoleId: snapshot.hoaAdminRoleId,
    billingAccountId: snapshot.organization.billingAccountId,
    actor: {
      userId: user.id ?? null,
      name: actorName,
      email: user.email ?? null,
    },
    now,
  });

  // A partial failure is reported as one. The writes that landed are a safe
  // state — see the ordering note in transition-execute.ts — but telling an
  // admin "done" over a half-finished transition is how a community ends up
  // believing its manager was offboarded when they still hold the keys.
  if (!result.completed) {
    const failed = result.steps.find((s) => s.status === "failed");
    throw createError({
      statusCode: 500,
      statusMessage: `The transition stopped at "${failed?.label ?? "an unknown step"}". Everything before it was applied; nothing after it was. ${failed?.note ?? ""}`.trim(),
      data: result,
    });
  }

  return { ...result, plan };
});
