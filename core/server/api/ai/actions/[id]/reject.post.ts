// POST /api/ai/actions/:id/reject — reject a pending proposal (nothing runs).
// Comms-gated + org-scoped. (Phase 4.)

import { decideAiAction } from "#core/server/utils/ai-actions";

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const userId = (session.user as any)?.id ?? null;
  const id = getRouterParam(event, "id");
  if (!id) throw createError({ statusCode: 400, message: "id is required" });
  const orgId = String((await readBody(event))?.orgId || "").trim();
  if (!orgId) throw createError({ statusCode: 400, message: "orgId is required" });
  await requireOrgComposeAccess(event, orgId);

  return decideAiAction({
    id,
    decision: "reject",
    userId,
    orgId,
    verifyOrg: (rowOrg) => {
      if (rowOrg !== orgId) throw createError({ statusCode: 404, message: "Action not found" });
    },
  });
});
