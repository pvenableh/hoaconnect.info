/**
 * DELETE /api/org/teams/members/[id]?orgId= — take someone off a committee.
 * docs/spec-delegation.md. Admin only. The committee's areas stop for them at
 * once (they are derived from the row), and the ledger entry names them.
 */
import { deleteItem } from "@directus/sdk";
import { buildCommitteeMemberEntry } from "#core/shared/ledger/entries";
import { orgIdFromQuery, recordEntry, requireDelegationAdmin, teamOpenAreas } from "#core/server/utils/delegation";
import { orgName } from "#core/server/utils/org-name";
import { loadTeamMemberRow } from "#core/server/utils/committees";

export default defineEventHandler(async (event) => {
  await requireUserSession(event);
  const orgId = orgIdFromQuery(event);
  const actor = await requireDelegationAdmin(event, orgId);
  const row = await loadTeamMemberRow(orgId, String(getRouterParam(event, "id") ?? ""));

  const areas = await teamOpenAreas(orgId, row.teamId);
  await getTypedDirectus().request(deleteItem("hoa_team_members", row.id));

  const entry = buildCommitteeMemberEntry({
    organizationId: orgId,
    organizationName: await orgName(orgId),
    team: { id: row.teamId, name: row.teamName },
    member: { memberId: row.memberId, name: row.name },
    change: "left",
    role: row.role,
    areas,
    actor,
    occurredAt: new Date().toISOString(),
  });
  return { ok: true, ...(await recordEntry(entry)), summary: entry.summary };
});
