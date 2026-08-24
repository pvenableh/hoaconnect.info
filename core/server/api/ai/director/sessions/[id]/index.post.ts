/**
 * POST /api/ai/director/sessions/[id] — everything that happens IN the room.
 *
 * One door rather than six. Join, leave, attach a plan, move the slide, report
 * a decision and close the meeting are not six resources — they are six things
 * that happen to one meeting, and every one of them ends the same way: the
 * `revision` moves so the other people watching know to re-read. Collapsing
 * them means one authorization gate, one org check, and one place a future op
 * can forget neither.
 *
 * Body: { orgId, op, ... }
 *   join      — take a seat (or re-take one after a reload)
 *   leave     — give the seat up
 *   plan      { planId, title? } — attach a freshly drafted plan
 *   present   { slide }          — move the presenter's pointer
 *   activity  { stepId?, label? } — report a decision made on a step
 *   end       — close the meeting (host only)
 *
 * Gated like the plan endpoint: org admins and seated board members.
 */

import { readUsers } from "@directus/sdk";
import {
  endDirectorSession,
  loadPlanSteps,
  loadSession,
  recordActivity,
  setPresenterSlide,
  setSessionPlan,
  upsertAttendee,
} from "#core/server/utils/director-sessions";

const OPS = new Set(["join", "leave", "plan", "present", "activity", "end"]);

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuthenticatedUser(event);

  const body = ((await readBody(event).catch(() => ({}))) || {}) as {
    orgId?: string;
    op?: string;
    planId?: string;
    title?: string;
    slide?: number;
    stepId?: string;
    label?: string;
  };

  const orgId = String(body.orgId || "").trim();
  if (!orgId) throw createError({ statusCode: 400, message: "orgId is required" });

  const op = String(body.op || "").trim();
  if (!OPS.has(op)) throw createError({ statusCode: 400, message: "Unknown op" });

  const sessionId = String(getRouterParam(event, "id") || "").trim();
  if (!sessionId) throw createError({ statusCode: 400, message: "session id is required" });

  const directus = getTypedDirectus();

  // Authorization first — before a single row of this community is read.
  const admin = await checkAdminAccess(event, orgId);
  const allowed = admin.isAdmin || (await isActiveBoardMember(directus, userId, orgId));
  if (!allowed) {
    throw createError({ statusCode: 403, message: "Admin or board access required" });
  }

  const session = await loadSession(sessionId, orgId);
  if (!session) throw createError({ statusCode: 404, message: "Session not found" });

  let actorName: string | null =
    session.attendees.find((a) => String(a.userId) === String(userId))?.name ?? null;
  if (!actorName) {
    try {
      const users = (await directus.request(
        readUsers({
          filter: { id: { _eq: userId } },
          fields: ["first_name", "last_name", "email"],
          limit: 1,
        })
      )) as any[];
      const u = users?.[0];
      actorName =
        [u?.first_name, u?.last_name].filter(Boolean).join(" ").trim() || u?.email || null;
    } catch {
      /* the activity line reads fine without a name */
    }
  }

  switch (op) {
    case "join":
      await upsertAttendee(sessionId, { userId, name: actorName, status: "active" });
      await recordActivity(sessionId, {
        type: "join",
        actorId: userId,
        actorName,
        label: "pulled up a chair",
      });
      break;

    case "leave":
      await upsertAttendee(sessionId, { userId, name: actorName, status: "left" });
      await recordActivity(sessionId, {
        type: "leave",
        actorId: userId,
        actorName,
        label: "left the room",
      });
      break;

    case "plan": {
      const planId = String(body.planId || "").trim();
      if (!planId) throw createError({ statusCode: 400, message: "planId is required" });
      await setSessionPlan(sessionId, planId, String(body.title || "").trim() || null);
      await recordActivity(sessionId, {
        type: "draft",
        actorId: userId,
        actorName,
        label: "put a plan on the table",
      });
      break;
    }

    case "present":
      await setPresenterSlide(sessionId, Number(body.slide) || 0);
      await recordActivity(sessionId, {
        type: "present",
        actorId: userId,
        actorName,
        label: "moved the room along",
      });
      break;

    case "activity": {
      // The caller says WHICH step it decided; the room is told what the step
      // actually IS. Reading the row back rather than trusting the body is what
      // stops the activity line from claiming an approval that never happened.
      const stepId = String(body.stepId || "").trim();
      let status: string | null = null;
      let label = String(body.label || "").trim() || "made a decision";
      if (stepId) {
        const step = (await loadPlanSteps(session.planId, orgId)).find(
          (s) => String(s.id) === stepId
        );
        if (step) {
          status = step.status;
          label = step.title;
        }
      }
      await recordActivity(sessionId, {
        type: "decision",
        actorId: userId,
        actorName,
        stepId: stepId || null,
        status,
        label,
      });
      break;
    }

    case "end":
      // Ending is the host's — an attendee who wants out has `leave`.
      if (String(session.hostId) !== String(userId)) {
        throw createError({ statusCode: 403, message: "Only the host can end this meeting" });
      }
      await endDirectorSession(sessionId);
      await recordActivity(sessionId, {
        type: "end",
        actorId: userId,
        actorName,
        label: "closed the meeting",
      });
      break;
  }

  return { ok: true, session: await loadSession(sessionId, orgId) };
});
