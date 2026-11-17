/**
 * Committee membership rows (hoa_team_members), read through the org filter
 * for the admin-only routes under /api/org/teams (docs/spec-delegation.md).
 */
import { readItems } from "@directus/sdk";
import { refId } from "#core/shared/roles/area-grants";

export interface TeamMemberRow {
  id: string;
  teamId: string;
  teamName: string;
  memberId: string | null;
  name: string;
  role: "member" | "lead";
}

/** One row of `orgId`, or 404. The name comes from the membership, else the login. */
export async function loadTeamMemberRow(orgId: string, rowId: string): Promise<TeamMemberRow> {
  if (!rowId.trim()) throw createError({ statusCode: 400, message: "A committee member is required." });
  const rows = (await getTypedDirectus().request(
    readItems("hoa_team_members", {
      filter: { id: { _eq: rowId }, organization: { _eq: orgId } },
      fields: [
        "id", "role", "team.id", "team.name",
        "member.id", "member.first_name", "member.last_name", "member.email",
        "user.first_name", "user.last_name", "user.email",
      ] as any,
      limit: 1,
    })
  )) as any[];
  const r = rows?.[0];
  if (!r) throw createError({ statusCode: 404, message: "No such committee member in this community." });
  const person = (p: any) => (p && typeof p === "object" ? [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || p.email || "" : "");
  return {
    id: String(r.id),
    teamId: String(refId(r.team) ?? ""),
    teamName: String(r.team?.name ?? ""),
    memberId: refId(r.member),
    name: person(r.member) || person(r.user),
    role: r.role === "lead" ? "lead" : "member",
  };
}
