/**
 * GET /api/org/violations/members?orgId= — the community's active members by
 * name, for "New violation"'s member picker (docs/spec-delegation.md).
 *
 * Who: admin, a property manager with the `violations` grant, or a helper or
 * committee holding it. Names only: a contact field is the directory's.
 */
import { readForArea, requireOrgId } from "#core/server/utils/area-reads";

export default defineEventHandler(async (event) => {
  const orgId = requireOrgId(getQuery(event).orgId);
  const { rows } = await readForArea(event, orgId, "violations", {
    members: {
      collection: "hoa_members",
      filter: { organization: { _eq: orgId }, status: { _eq: "active" } },
      fields: ["id", "first_name", "last_name"],
      sort: ["first_name"],
      limit: -1,
    },
  });
  return { members: rows.members.map((m: any) => ({ id: m.id, first_name: m.first_name ?? null, last_name: m.last_name ?? null })) };
});
