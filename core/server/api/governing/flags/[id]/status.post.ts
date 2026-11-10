// POST /api/governing/flags/:id/status — confirm or dismiss a statute flag, or
// mark it confirmed by counsel. Managers only. Body: { status, reason? }.
// Writes an audit row. Never touches a flag's wording or any provision text.
import { requireGoverningManage } from "#core/server/utils/governing-access";
import { isSettableFlagStatus, setGoverningFlagStatus } from "#core/server/utils/governing-flags";
import { requireOrgId } from "#core/server/utils/org-context";

export default defineEventHandler(async (event) => {
  const orgId = await requireOrgId(event);
  await requireGoverningManage(event, orgId);
  const body = ((await readBody(event)) ?? {}) as { status?: unknown; reason?: unknown };
  if (!isSettableFlagStatus(body.status)) {
    throw createError({ statusCode: 400, message: "status must be confirmed, dismissed or counsel_confirmed" });
  }
  const reason = typeof body.reason === "string" && body.reason.trim() ? body.reason.trim().slice(0, 2000) : null;
  return setGoverningFlagStatus(event, orgId, String(getRouterParam(event, "id") ?? ""), body.status, reason);
});
