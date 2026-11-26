/**
 * GET /api/org/inquiries?orgId= — the community's requests, newest change
 * first (100), for /manage/inquiries (docs/spec-delegation.md).
 *
 * Who: admin, a property manager with the `inquiries` grant, or a helper or
 * committee holding it, for every request; the `violations` area alone, for
 * the violation requests (`scope`). Read with the app's token behind the gate.
 */
import { requireOrgId } from "#core/server/utils/area-reads";
import { readAreaRequests } from "#core/server/utils/area-requests";

export default defineEventHandler(async (event) => {
  const orgId = requireOrgId(getQuery(event).orgId);
  return await readAreaRequests(event, orgId);
});
