/**
 * POST /api/ai/director/sessions — convene a Board Room meeting.
 *
 * A session is the multiplayer wrapper around a plan, not a second copy of one.
 * The briefing and the steps stay exactly where they were — `plan.post.ts` and
 * `ai_actions` — and this row only records who is in the room, what it is
 * about, and a `revision` counter the others can watch.
 *
 * Convening is deliberately optional. The Board Room page drafts and approves
 * perfectly well without a session; you convene one when you want other people
 * to follow along.
 *
 * Body: { orgId, title?, scopeType?, entityType?, entityId?, subject?, topic?,
 *         planId?, viewOnly? }
 *
 * Gated like the plan endpoint: org admins and seated board members.
 */

import { readUsers } from "@directus/sdk";
import {
  createDirectorSession,
  loadSession,
  recordActivity,
} from "#core/server/utils/director-sessions";

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuthenticatedUser(event);

  const body = ((await readBody(event).catch(() => ({}))) || {}) as {
    orgId?: string;
    title?: string;
    scopeType?: string;
    entityType?: string;
    entityId?: string;
    subject?: string;
    topic?: string;
    planId?: string;
    viewOnly?: boolean;
  };

  const orgId = String(body.orgId || "").trim();
  if (!orgId) throw createError({ statusCode: 400, message: "orgId is required" });

  const directus = getTypedDirectus();

  // Authorization first — before a single row of this community is read.
  const admin = await checkAdminAccess(event, orgId);
  const allowed = admin.isAdmin || (await isActiveBoardMember(directus, userId, orgId));
  if (!allowed) {
    throw createError({ statusCode: 403, message: "Admin or board access required" });
  }

  // The host's name rides on the attendee entry so the room can say who is at
  // the table without every follower resolving user ids of their own.
  let hostName: string | null = null;
  try {
    const users = (await directus.request(
      readUsers({
        filter: { id: { _eq: userId } },
        fields: ["first_name", "last_name", "email"],
        limit: 1,
      })
    )) as any[];
    const u = users?.[0];
    hostName =
      [u?.first_name, u?.last_name].filter(Boolean).join(" ").trim() || u?.email || null;
  } catch {
    /* a nameless host still gets a seat */
  }

  const entityType = String(body.entityType || "").trim();
  const entityId = String(body.entityId || "").trim();
  const isEntity = body.scopeType === "entity" || (!!entityType && !!entityId);

  const sessionId = await createDirectorSession({
    organizationId: orgId,
    hostId: userId,
    hostName,
    title: String(body.title || "").trim() || null,
    scopeType: isEntity ? "entity" : "org",
    entityType: isEntity ? entityType : null,
    entityId: isEntity ? entityId : null,
    subject: String(body.subject || "").trim() || null,
    topic: String(body.topic || "").trim() || null,
    planId: String(body.planId || "").trim() || null,
    viewOnly: body.viewOnly === true,
  });

  // A null id means the collections are not provisioned. That is not an error
  // the page should die on — the Board Room simply stays single-player until
  // `pnpm create:boardroom` has been run.
  if (!sessionId) return { sessionId: null, session: null, provisioned: false };

  await recordActivity(sessionId, {
    type: "convene",
    actorId: userId,
    actorName: hostName,
    label: "opened the room",
  });

  return {
    sessionId,
    session: await loadSession(sessionId, orgId),
    provisioned: true,
  };
});
