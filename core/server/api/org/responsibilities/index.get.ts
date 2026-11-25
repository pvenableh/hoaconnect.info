/**
 * GET /api/org/responsibilities?orgId=&asOf= — the whole register for editors
 * and the board (docs/spec-responsibilities.md): every job with its holders on
 * the as-of date (default today), every holder row with history, next review,
 * unassigned since, the two publishing switches, and what the viewer may do.
 * The register page's `def.load`.
 *
 * One Directus request: the register's reads and the caller's standing go out
 * as one batch (batchWithAccessSnapshot), and the access check then answers
 * from that standing. A caller without read access gets its 403 before any of
 * those rows leave the server. If the batch cannot run, the reads go one by
 * one as before.
 */
import { requireOrgParam, requireResponsibilitiesRead } from "#core/server/utils/responsibility-access";
import {
  asOfParam,
  loadOrgSwitches,
  loadRegister,
  registerFrom,
  registerSpecs,
  type RegisterKey,
} from "#core/server/utils/responsibilities";

export default defineEventHandler(async (event) => {
  await requireUserSession(event);
  const orgId = requireOrgParam(getQuery(event).orgId);
  const read: Record<RegisterKey, any[]> | null = await batchWithAccessSnapshot(event, orgId, registerSpecs(orgId)).catch(
    (e: any) => {
      console.warn("[responsibilities] register batch failed; reading one by one:", e?.message ?? e);
      return null;
    }
  );
  const access = await requireResponsibilitiesRead(event, orgId);
  const asOf = asOfParam(event);
  const { rows: responsibilities, org } = read
    ? registerFrom(orgId, read, asOf)
    : await Promise.all([loadRegister(orgId, asOf), loadOrgSwitches(orgId)]).then(([rows, o]) => ({ rows, org: o }));
  return {
    asOf,
    responsibilities,
    visibility: { published: org.published, showUnassigned: org.showUnassigned },
    viewer: { canEdit: access.canEdit, isAdmin: access.isAdmin },
  };
});
