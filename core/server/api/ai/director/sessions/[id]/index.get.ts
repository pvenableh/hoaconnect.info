/**
 * GET /api/ai/director/sessions/[id] — the poll door.
 *
 * ── Why this is a poll and not a socket ─────────────────────────────────────
 * The three Board Room collections are admin-only, so nothing in a browser can
 * subscribe to `hoa_director_sessions` and be pushed a `revision` bump. The
 * alternative was a scoped read policy on that one collection plus the WS
 * manager; it needs a prod permission run, and this needs none. The page's
 * contract is the same either way — "the revision moved, re-read the steps" —
 * so the socket remains a drop-in upgrade rather than a rewrite.
 *
 * ── Why `since` ─────────────────────────────────────────────────────────────
 * The quiet path is the common one: nothing has happened since the last tick.
 * Passing `?since=<revision>` returns the session row (one row, always cheap)
 * and omits `steps` entirely when the revision has not moved. A room that is
 * idle costs one small row per tick; a room where somebody just approved a step
 * costs the steps as well, exactly once.
 *
 * Query: orgId (required), since (optional revision the caller already has).
 *
 * Gated like the plan endpoint: org admins and seated board members.
 */

import { loadSession, loadPlanSteps } from "#core/server/utils/director-sessions";

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuthenticatedUser(event);

  const q = getQuery(event);
  const orgId = String(q.orgId || "").trim();
  if (!orgId) throw createError({ statusCode: 400, message: "orgId is required" });

  const sessionId = String(getRouterParam(event, "id") || "").trim();
  if (!sessionId) throw createError({ statusCode: 400, message: "session id is required" });

  const directus = getTypedDirectus();

  // Authorization first — before a single row of this community is read.
  const admin = await checkAdminAccess(event, orgId);
  const allowed = admin.isAdmin || (await isActiveBoardMember(directus, userId, orgId));
  if (!allowed) {
    throw createError({ statusCode: 403, message: "Admin or board access required" });
  }

  // `loadSession` re-checks the org itself — a session id is a bare uuid in a
  // URL, and being an admin somewhere is not being an admin here.
  const session = await loadSession(sessionId, orgId);
  if (!session) throw createError({ statusCode: 404, message: "Session not found" });

  const sinceRaw = q.since;
  const since = sinceRaw === undefined || sinceRaw === "" ? null : Number(sinceRaw);
  const unchanged = since !== null && Number.isFinite(since) && since === session.revision;

  return {
    session,
    revision: session.revision,
    changed: !unchanged,
    steps: unchanged ? null : await loadPlanSteps(session.planId, orgId),
  };
});
