/**
 * GET /api/org/forms/access?orgId= — whether this community's plan includes forms
 * to sign, for the upgrade prompt. Any member may ask; it reveals only the plan state.
 */
import { formsGate, formsGateMessage } from "#core/shared/billing/forms-plan";
import { formsGateSpec } from "#core/server/utils/forms-gate";

export default defineEventHandler(async (event) => {
  await requireUserSession(event);
  const orgId = String(getQuery(event).orgId || "");
  if (!orgId) throw createError({ statusCode: 400, statusMessage: "orgId is required" });
  // The plan rides with the caller's standing as ONE request (role-context.ts),
  // refused before it is used. A missing row (a missing community) or a failed
  // batch goes through getFormsGate, which fails or reads as before.
  const { allowed, rows } = await getRoleContextWith(event, orgId, { plan: formsGateSpec(orgId) });
  if (!allowed) throw createError({ statusCode: 403, statusMessage: "Not a member of this community" });
  const gate = rows.plan[0] ? formsGate(rows.plan[0]) : await getFormsGate(orgId);
  return { allowed: gate.allowed, reason: gate.reason, message: gate.allowed ? null : formsGateMessage(gate.reason) };
});
