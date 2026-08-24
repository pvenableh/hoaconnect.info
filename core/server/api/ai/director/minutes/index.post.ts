/**
 * POST /api/ai/director/minutes — record what the board decided.
 *
 * ── The one thing this route refuses to take from the caller ────────────────
 * The step list. A browser sends the plan id; the server reads the steps back
 * through `loadPlanSteps()` and rolls them up with `summarizeMinutesSteps()`.
 * Minutes are a governance record, and a record whose counts came from the same
 * screen that was displaying them is a record that can be wrong in exactly the
 * way nobody would notice. The prose is the caller's; the tally is not.
 *
 * Body: { orgId, planId, sessionId?, title?, scopeType?, entityType?, entityId?,
 *         subject?, topic?, summary?, intro?, points?, money? }
 *
 * Gated like the plan endpoint: org admins and seated board members.
 */

import { loadPlanSteps } from "#core/server/utils/director-sessions";
import {
  saveMinutes,
  summarizeMinutesSteps,
  type MinutesStep,
} from "#core/server/utils/director-minutes";

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuthenticatedUser(event);

  const body = ((await readBody(event).catch(() => ({}))) || {}) as {
    orgId?: string;
    planId?: string;
    sessionId?: string | number;
    title?: string;
    scopeType?: string;
    entityType?: string;
    entityId?: string;
    subject?: string;
    topic?: string;
    summary?: string;
    intro?: string;
    points?: string[];
    money?: any;
  };

  const orgId = String(body.orgId || "").trim();
  if (!orgId) throw createError({ statusCode: 400, message: "orgId is required" });

  const planId = String(body.planId || "").trim();
  if (!planId) throw createError({ statusCode: 400, message: "planId is required" });

  const directus = getTypedDirectus();

  // Authorization first — before a single row of this community is read.
  const admin = await checkAdminAccess(event, orgId);
  const allowed = admin.isAdmin || (await isActiveBoardMember(directus, userId, orgId));
  if (!allowed) {
    throw createError({ statusCode: 403, message: "Admin or board access required" });
  }

  // The org filter rides inside loadPlanSteps, so a guessed plan id cannot pull
  // another community's steps into this community's minutes.
  const steps: MinutesStep[] = (await loadPlanSteps(planId, orgId)).map((s) => ({
    id: String(s.id),
    actionType: s.actionType,
    title: s.title,
    status: s.status,
    outbound: s.outbound,
  }));

  const entityType = String(body.entityType || "").trim();
  const entityId = String(body.entityId || "").trim();
  const isEntity = body.scopeType === "entity" || (!!entityType && !!entityId);

  const minutesId = await saveMinutes({
    organizationId: orgId,
    authorId: userId,
    sessionId: body.sessionId ?? null,
    title: String(body.title || "").trim() || null,
    scopeType: isEntity ? "entity" : "org",
    entityType: isEntity ? entityType : null,
    entityId: isEntity ? entityId : null,
    subject: String(body.subject || "").trim() || null,
    topic: String(body.topic || "").trim() || null,
    planId,
    summary: String(body.summary || "").trim() || null,
    intro: String(body.intro || "").trim() || null,
    points: Array.isArray(body.points) ? body.points.map(String) : null,
    money: body.money ?? null,
    steps,
    stats: summarizeMinutesSteps(steps),
  });

  // A null id means the collections are not provisioned — the recap layer is
  // inert until `pnpm create:boardroom` has been run, and says so rather than
  // pretending it saved.
  return { minutesId, saved: !!minutesId, stats: summarizeMinutesSteps(steps) };
});
