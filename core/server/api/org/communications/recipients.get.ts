/**
 * GET /api/org/communications/recipients?orgId= — who an email can go to: the
 * community's active members with an email address and the unit links
 * residencyFor() reads, and the community's CC/BCC cutoff. For the composer's
 * recipient picker (docs/spec-delegation.md).
 *
 * Who: admin, a property manager with the `communications` grant, or a helper
 * or committee holding it. Read with the app's token behind the gate, as one
 * request with the caller's access snapshot.
 */
import { readForArea, requireOrgId } from "#core/server/utils/area-reads";
import { RESIDENCY_UNIT_FIELDS } from "#core/shared/members/residency";

export default defineEventHandler(async (event) => {
  const orgId = requireOrgId(getQuery(event).orgId);
  const { rows } = await readForArea(event, orgId, "communications", {
    members: {
      collection: "hoa_members",
      filter: { organization: { _eq: orgId }, status: { _eq: "active" }, email: { _nnull: true } },
      fields: ["id", "first_name", "last_name", "email", "status", "member_type", ...RESIDENCY_UNIT_FIELDS],
      sort: ["last_name", "first_name"],
      limit: -1,
    },
    settings: {
      collection: "block_settings",
      filter: { organization: { _eq: orgId } },
      fields: ["cc_bcc_threshold"],
      limit: 1,
    },
  });
  const threshold = Number(rows.settings?.[0]?.cc_bcc_threshold);
  return { members: rows.members, ccBccThreshold: Number.isFinite(threshold) && threshold > 0 ? threshold : null };
});
