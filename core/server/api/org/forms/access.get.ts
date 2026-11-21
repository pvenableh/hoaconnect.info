/**
 * GET /api/org/forms/access?orgId= — whether this community's plan includes forms
 * to sign, for the upgrade prompt. Any member may ask; it reveals only the plan state.
 */
import { formsGateMessage } from "#core/shared/billing/forms-plan";

export default defineEventHandler(async (event) => {
  await requireUserSession(event);
  const orgId = String(getQuery(event).orgId || "");
  if (!orgId) throw createError({ statusCode: 400, statusMessage: "orgId is required" });
  const { allowed } = await getRoleContext(event, orgId);
  if (!allowed) throw createError({ statusCode: 403, statusMessage: "Not a member of this community" });
  const gate = await getFormsGate(orgId);
  return { allowed: gate.allowed, reason: gate.reason, message: gate.allowed ? null : formsGateMessage(gate.reason) };
});
