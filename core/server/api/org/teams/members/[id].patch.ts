/**
 * PATCH /api/org/teams/members/[id] — make a committee member its lead, or
 * not. docs/spec-delegation.md. Admin only; one ledger entry; a no-op writes
 * nothing.
 */
import { updateItem } from "@directus/sdk";
import { z } from "zod";
import { buildCommitteeMemberEntry } from "#core/shared/ledger/entries";
import { idString, orgName, readDelegationBody, recordEntry, requireDelegationAdmin, teamOpenAreas } from "#core/server/utils/delegation";
import { loadTeamMemberRow } from "#core/server/utils/committees";

const body = z.object({ orgId: idString, role: z.enum(["member", "lead"]) });

export default defineEventHandler(async (event) => {
  await requireUserSession(event);
  const b = await readDelegationBody(event, body);
  const actor = await requireDelegationAdmin(event, b.orgId);
  const row = await loadTeamMemberRow(b.orgId, String(getRouterParam(event, "id") ?? ""));

  if (row.role === b.role) return { changed: false, recorded: false, recordError: null, summary: null };
  await getTypedDirectus().request(updateItem("hoa_team_members", row.id, { role: b.role } as any));

  const entry = buildCommitteeMemberEntry({
    organizationId: b.orgId,
    organizationName: await orgName(b.orgId),
    team: { id: row.teamId, name: row.teamName },
    member: { memberId: row.memberId, name: row.name },
    change: "role",
    role: b.role,
    areas: await teamOpenAreas(b.orgId, row.teamId),
    actor,
    occurredAt: new Date().toISOString(),
  });
  return { changed: true, ...(await recordEntry(entry)), summary: entry.summary };
});
