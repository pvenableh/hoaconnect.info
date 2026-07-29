// POST /api/ai/actions/:id/approve — approve a pending proposal, which runs its
// executor. Comms-gated; the row's org must match the caller's authorized org
// (cross-tenant ids are rejected). (Phase 4.)

import { decideAiAction } from "#core/server/utils/ai-actions";

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const userId = (session.user as any)?.id ?? null;
  const id = getRouterParam(event, "id");
  if (!id) throw createError({ statusCode: 400, message: "id is required" });
  const orgId = String((await readBody(event))?.orgId || "").trim();
  if (!orgId) throw createError({ statusCode: 400, message: "orgId is required" });
  await requireOrgComposeAccess(event, orgId);

  const result = await decideAiAction({
    id,
    decision: "approve",
    userId,
    orgId,
    verifyOrg: (rowOrg) => {
      if (rowOrg !== orgId) throw createError({ statusCode: 404, message: "Action not found" });
    },
  });
  return result;
});
