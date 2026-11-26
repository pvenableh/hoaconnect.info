/**
 * GET /api/org/meetings?orgId= — the meetings page's reads: every meeting of
 * the community with its attendance, the people who can attend, and the board
 * terms (for the role an attendee held that day). One request with the
 * caller's access snapshot. Admin, the `meetings` grant, or a helper or
 * committee holding it (core/server/utils/meeting-access.ts).
 */
import { readForArea, requireOrgId } from "#core/server/utils/area-reads";
import { meetingsPageSpecs } from "#core/server/utils/meeting-access";

export default defineEventHandler(async (event) => {
  const orgId = requireOrgId(getQuery(event).orgId);
  const { rows } = await readForArea(event, orgId, "meetings", meetingsPageSpecs(orgId));
  return { meetings: rows.meetings, members: rows.members, boardTerms: rows.terms };
});
