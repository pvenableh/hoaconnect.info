/**
 * GET /api/org/directory?orgId= — the community's active members with their
 * contact fields, for /manage/directory (docs/spec-delegation.md).
 *
 * Who: admin, a property manager with the `directory` grant, or a helper or
 * committee holding it. Read with the app's token, so a helper (a plain HOA
 * Member in Directus) sees what a manager sees, and nobody else does.
 */
import { readForArea, requireOrgId } from "#core/server/utils/area-reads";
import type { ReadSpec } from "#core/server/utils/directus-graphql";
import { RESIDENCY_UNIT_FIELDS, residencyFor } from "#core/shared/members/residency";

const DIRECTORY_FIELDS = ["id", "first_name", "last_name", "email", "phone", "member_type"] as const;

function directorySpec(orgId: string): ReadSpec {
  return {
    collection: "hoa_members",
    filter: { organization: { _eq: orgId }, status: { _eq: "active" } },
    fields: [...DIRECTORY_FIELDS, ...RESIDENCY_UNIT_FIELDS],
    sort: ["first_name"],
    limit: -1,
  };
}

export default defineEventHandler(async (event) => {
  const orgId = requireOrgId(getQuery(event).orgId);
  const { rows } = await readForArea(event, orgId, "directory", { directory: directorySpec(orgId) });
  // `member_type` goes out resolved (the current unit link first), and the
  // links themselves stay on the server.
  const members = ((rows.directory ?? []) as Array<Record<string, any>>).map(({ units, ...m }) => ({
    ...m,
    member_type: residencyFor({ member_type: m.member_type, units }),
  }));
  return { members };
});
