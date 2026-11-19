/**
 * POST /api/org/teams/[id]/members — add a member to a committee.
 * docs/spec-delegation.md.
 *
 * Admin only, because joining a committee grants its areas. The member must be
 * active in this community and have a login (team rows are keyed by user). One
 * ledger entry names the areas that came with it.
 */
import { createItem, readItems } from "@directus/sdk";
import { z } from "zod";
import { buildCommitteeMemberEntry } from "#core/shared/ledger/entries";
import {
  idString,
  loadMemberHolder,
  loadTeamHolder,
  readDelegationBody,
  recordEntry,
  requireDelegationAdmin,
  teamOpenAreas,
} from "#core/server/utils/delegation";
import { orgName } from "#core/server/utils/org-name";

const body = z.object({
  orgId: idString,
  member: idString,
  role: z.enum(["member", "lead"]).default("member"),
});

export default defineEventHandler(async (event) => {
  await requireUserSession(event);
  const b = await readDelegationBody(event, body);
  const actor = await requireDelegationAdmin(event, b.orgId);
  const teamId = String(getRouterParam(event, "id") ?? "").trim();
  if (!teamId) throw createError({ statusCode: 400, message: "A committee is required." });

  const team = await loadTeamHolder(b.orgId, teamId);
  const member = await loadMemberHolder(b.orgId, b.member);
  if (team.status !== "active") throw createError({ statusCode: 409, message: "This committee is archived." });
  if (member.status !== "active") throw createError({ statusCode: 409, message: "Only an active member can join a committee." });
  if (!member.userId) throw createError({ statusCode: 409, message: "This member has no login yet, so they cannot join a committee." });

  const d = getTypedDirectus();
  const existing = (await d.request(
    readItems("hoa_team_members", {
      filter: { team: { _eq: team.id }, user: { _eq: member.userId }, organization: { _eq: b.orgId } },
      fields: ["id"] as any,
      limit: 1,
    })
  )) as any[];
  if (existing?.length) throw createError({ statusCode: 409, message: "They are already on this committee." });

  const row = (await d.request(
    createItem("hoa_team_members", {
      team: team.id,
      user: member.userId,
      member: member.id,
      role: b.role ?? "member",
      organization: b.orgId,
    } as any)
  )) as { id: string };

  const entry = buildCommitteeMemberEntry({
    organizationId: b.orgId,
    organizationName: await orgName(b.orgId),
    team: { id: team.id, name: team.name },
    member: { memberId: member.id, name: member.name },
    change: "joined",
    role: b.role ?? "member",
    areas: await teamOpenAreas(b.orgId, team.id),
    actor,
    occurredAt: new Date().toISOString(),
  });
  const rec = await recordEntry(entry);
  return { id: row?.id ?? null, ...rec, summary: entry.summary };
});
