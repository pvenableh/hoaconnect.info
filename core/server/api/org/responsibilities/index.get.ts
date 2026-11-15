/**
 * GET /api/org/responsibilities?orgId=&asOf= — the whole register for editors
 * and the board (docs/spec-responsibilities.md): every job with its holders on
 * the as-of date (default today), every holder row with history, next review,
 * unassigned since, the two publishing switches, and what the viewer may do.
 * The register page's `def.load`.
 */
import { requireOrgParam, requireResponsibilitiesRead } from "#core/server/utils/responsibility-access";
import { asOfParam, loadOrgSwitches, loadRegister } from "#core/server/utils/responsibilities";

export default defineEventHandler(async (event) => {
  await requireUserSession(event);
  const orgId = requireOrgParam(getQuery(event).orgId);
  const access = await requireResponsibilitiesRead(event, orgId);
  const asOf = asOfParam(event);
  const [responsibilities, org] = await Promise.all([loadRegister(orgId, asOf), loadOrgSwitches(orgId)]);
  return {
    asOf,
    responsibilities,
    visibility: { published: org.published, showUnassigned: org.showUnassigned },
    viewer: { canEdit: access.canEdit, isAdmin: access.isAdmin },
  };
});
