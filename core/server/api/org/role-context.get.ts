/**
 * GET /api/org/role-context?orgId= — the caller's RoleContext in one org
 * (docs/spec-role-context.md), plus the actor hats and capabilities that
 * /api/org/capabilities returns, so one fetch serves both.
 *
 * Org-scoped: the context is the session user's own, in the org asked for. A
 * caller with no active or pending membership there gets 403 (the App Admin
 * excepted), so this cannot be used to learn anything about another community.
 * Drives UI only — routes still enforce on their own.
 */
export default defineEventHandler(async (event) => {
  await requireUserSession(event);
  const orgId = String(getQuery(event).orgId || "");
  if (!orgId) throw createError({ statusCode: 400, message: "orgId is required" });

  const { context, allowed } = await getRoleContext(event, orgId);
  if (!allowed) throw createError({ statusCode: 403, message: "Not a member of this community" });

  const { actors, capabilities } = await resolveCapabilities(event, orgId);
  return { context, actors, capabilities };
});
