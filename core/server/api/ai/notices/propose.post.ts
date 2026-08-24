/**
 * POST /api/ai/notices/propose — turn a notice's suggested action into a real
 * pending proposal.
 *
 * This is the door Phase 5 opens: until now the only way an `ai_actions` row
 * came into existence was a chat turn. A notice already carries a fully-formed
 * `proposedAction` (Phase 4), and this endpoint is what makes "Create a task for
 * this" on a notice card do something.
 *
 * ── What the client is trusted with: an id, and nothing else ────────────────
 * The body names a notice. It does NOT carry the action type or the payload.
 * The server re-runs the same deterministic generators, finds the notice by id,
 * and takes the `proposedAction` *it* produced. A client that posts a payload
 * has no way to get it executed, and a notice that no longer exists — because
 * the request was closed an hour ago — cannot be acted on at all. Re-deriving is
 * cheap here precisely because the generators make no LLM call.
 *
 * ── And it still goes through the one approval path ─────────────────────────
 * `proposeAction()` writes the row, and `shouldAutoApprove()` inside it decides
 * whether the org's dial runs it now or a human answers it later. There is no
 * second lane. Outbound work cannot reach this endpoint by three independent
 * gates: the generators only ever emit from `PROACTIVE_ACTIONS`, that list is
 * re-checked here, and the catalog's own `outbound` flag is checked after it —
 * so an outbound key added to the allow-list by mistake still stops at the door.
 *
 * Body: { orgId, noticeId, entityType?, entityId? }
 *   entityType/entityId narrow the regeneration to one record's generator
 *   instead of sweeping the community — same notice ids either way.
 *
 * Gated exactly like GET /api/ai/notices: org admins and seated board members.
 * A notice names other people's arrears; acting on one is board business.
 */

import { readItems } from "@directus/sdk";
import {
  collectOrgNotices,
  collectDirectorAgenda,
  PROACTIVE_ACTIONS,
  type AINotice,
} from "#core/server/utils/ai-notices";
import { actionByKey } from "#core/shared/ai/actions";
import { proposeAction } from "#core/server/utils/ai-actions";
import { getOrgAutonomyTier } from "#core/server/utils/ai-autonomy";

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuthenticatedUser(event);

  const body = ((await readBody(event).catch(() => ({}))) || {}) as {
    orgId?: string;
    noticeId?: string;
    entityType?: string;
    entityId?: string;
  };

  const orgId = String(body.orgId || "").trim();
  if (!orgId) throw createError({ statusCode: 400, message: "orgId is required" });
  const noticeId = String(body.noticeId || "").trim();
  if (!noticeId) throw createError({ statusCode: 400, message: "noticeId is required" });

  const directus = getTypedDirectus();

  const admin = await checkAdminAccess(event, orgId);
  const allowed = admin.isAdmin || (await isActiveBoardMember(directus, userId, orgId));
  if (!allowed) {
    throw createError({ statusCode: 403, message: "Admin or board access required" });
  }

  // Re-derive the notice. Entity-scoped when we know the record (one generator),
  // org-wide otherwise.
  const now = new Date();
  const entityType = body.entityType ? String(body.entityType) : null;
  const entityId = body.entityId ? String(body.entityId) : null;

  let notices: AINotice[];
  if (entityType && entityId) {
    const agenda = await collectDirectorAgenda(directus, orgId, now, { entityType, entityId });
    notices = agenda.groups.flatMap((g) => g.notices);
  } else {
    notices = await collectOrgNotices(directus, orgId, now);
  }

  const notice = notices.find((n) => n.id === noticeId);
  if (!notice) {
    // Gone, not forbidden: the underlying fact stopped being true between the
    // page load and the click, which is a normal outcome and reads better as
    // "nothing to do" than as an error.
    throw createError({
      statusCode: 404,
      message: "That notice no longer applies — it may already have been handled.",
    });
  }

  const proposed = notice.proposedAction;
  if (!proposed) {
    throw createError({ statusCode: 400, message: "That notice has nothing to propose." });
  }

  // Belt and braces over what the generators already guarantee (see the header).
  if (!(PROACTIVE_ACTIONS as readonly string[]).includes(proposed.actionType)) {
    throw createError({ statusCode: 400, message: "That action cannot be proposed from a notice." });
  }
  const def = actionByKey(proposed.actionType);
  if (!def || def.outbound) {
    throw createError({ statusCode: 400, message: "That action cannot be proposed from a notice." });
  }

  // Don't stack duplicates: tapping the button twice, or two board members
  // tapping it on the same notice, should converge on one proposal.
  if (notice.entityType && notice.entityId) {
    const existing = (await directus
      .request(
        readItems("ai_actions", {
          filter: {
            _and: [
              { organization: { _eq: orgId } },
              { status: { _eq: "pending" } },
              { action_type: { _eq: proposed.actionType } },
              { entity_type: { _eq: notice.entityType } },
              { entity_id: { _eq: String(notice.entityId) } },
            ],
          },
          fields: ["id"],
          limit: 1,
        })
      )
      .catch(() => [])) as { id: string }[];
    if (existing?.[0]?.id) {
      return {
        actionId: existing[0].id,
        status: "pending",
        duplicate: true,
        summary: "That is already waiting in your review list.",
      };
    }
  }

  const result = await proposeAction(proposed.actionType, proposed.payload, {
    orgId,
    userId,
    entityType: notice.entityType ?? null,
    entityId: notice.entityId ?? null,
    autonomyTier: await getOrgAutonomyTier(orgId),
  });

  if (!result.success) {
    throw createError({ statusCode: 422, message: result.error || "Could not propose that action." });
  }

  return {
    actionId: result.actionId ?? null,
    status: result.status ?? "pending",
    duplicate: false,
    summary: result.summary,
  };
});
