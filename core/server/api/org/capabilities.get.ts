import { capabilitiesFor } from "#core/shared/permissions";

/**
 * The calling user's resolved actor hats + capabilities for an org. Drives
 * client-side UI gating (<RoleGate> / useCapabilities) so the chrome a user sees
 * matches what the server will allow. NOT an enforcement point — routes still
 * re-check server-side.
 *
 * The PM `projects` grant is layered on top of the static matrix here, the same
 * way project-access.ts layers it, so the UI reflects grant-specific access.
 */
export default defineEventHandler(async (event) => {
  await requireUserSession(event);
  const query = getQuery(event);
  const orgId = String(query.orgId || "");
  if (!orgId) throw createError({ statusCode: 400, message: "orgId is required" });

  const actors = await resolveActors(event, orgId);
  const caps = new Set(capabilitiesFor(actors));

  const grants = await getManagerGrants(event, orgId);
  if (grants?.projects === true) {
    caps.add("projects:write");
    caps.add("milestone:approve");
  }

  return { actors, capabilities: [...caps] };
});
