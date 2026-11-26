/**
 * GET /api/org/inquiries?orgId= — the community's requests, newest change
 * first (100), for /manage/inquiries (docs/spec-delegation.md).
 *
 * Who: admin, a property manager with the `inquiries` grant, or a helper or
 * committee holding it. Read with the app's token behind the gate.
 */
import { readForArea, requireOrgId } from "#core/server/utils/area-reads";
import { requestListSpec } from "#core/server/utils/area-requests";

export default defineEventHandler(async (event) => {
  const orgId = requireOrgId(getQuery(event).orgId);
  const { rows } = await readForArea(event, orgId, "inquiries", { requests: requestListSpec(orgId) });
  return { requests: rows.requests };
});
