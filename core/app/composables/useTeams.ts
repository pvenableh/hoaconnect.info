/**
 * useTeams — named teams (committees).
 *
 * A team has a free-text name and an optional `domain`, a label for which
 * request type it looks after. The domain grants nothing (docs/spec-delegation.md):
 * a committee works an area only when an admin gives it one, through
 * /api/org/area-grants. Leads still own their team's projects.
 *
 * Joining a committee grants its areas, so membership is written through the
 * admin-only /api/org/teams routes, which record each change in the ledger.
 * Teams themselves are still written with the admin's Directus token.
 *
 * Backed by hoa_teams + hoa_team_members (scripts/create-teams-collections.ts).
 */
import type { RequestType } from "#core/app/config/requestWorkflows";

export type TeamDomain = "none" | "violations" | "arc" | "maintenance" | "finance" | "general";

export interface Team {
  id: string;
  name: string;
  domain?: TeamDomain | null;
  color?: string | null;
  icon?: string | null;
  description?: string | null;
  status?: string | null;
  organization?: string | null;
}

export interface TeamMember {
  id: string;
  team?: Team | string | null;
  user?: { id: string; first_name?: string; last_name?: string; email?: string } | string | null;
  member?: { id: string; first_name?: string; last_name?: string } | string | null;
  role?: "member" | "lead" | null;
  organization?: string | null;
}

// Which team domain owns each request type.
const TYPE_TO_DOMAIN: Record<RequestType, TeamDomain> = {
  violation: "violations",
  arc: "arc",
  maintenance: "maintenance",
  complaint: "general",
  task: "general",
  question: "general",
};

export const DOMAIN_LABELS: Record<TeamDomain, string> = {
  none: "No domain",
  violations: "Violations",
  arc: "Architectural Review",
  maintenance: "Maintenance",
  finance: "Finance",
  general: "General",
};

export const useTeams = () => {
  const selectedOrgId = useState<string | null>("selectedOrgId", () => null);
  const { list: listTeams, create: createTeam, update: updateTeam, remove: removeTeam } =
    useDirectusItems<Team>("hoa_teams");
  const { list: listMembers } = useDirectusItems<TeamMember>("hoa_team_members");

  const teamId = (m: TeamMember) => (typeof m.team === "string" ? m.team : m.team?.id);
  const memberUserId = (m: TeamMember) => (typeof m.user === "string" ? m.user : m.user?.id);

  const listAllTeams = () =>
    listTeams({
      fields: ["id", "name", "domain", "color", "icon", "description", "status", "organization"],
      filter: { organization: { _eq: selectedOrgId.value } },
      sort: ["name"],
      limit: 200,
    });

  const listAllMembers = () =>
    listMembers({
      fields: [
        "id", "role", "organization",
        "team.id", "team.name", "team.domain",
        "user.id", "user.first_name", "user.last_name", "user.email",
        "member.id", "member.first_name", "member.last_name",
      ],
      filter: { organization: { _eq: selectedOrgId.value } },
      limit: 500,
    });

  const addTeam = (name: string, domain: TeamDomain = "none") => {
    if (!selectedOrgId.value) throw new Error("No organization selected");
    return createTeam({ name, domain, status: "active", organization: selectedOrgId.value } as Team);
  };
  const renameTeam = (id: string, name: string) => updateTeam(id, { name } as Partial<Team>);
  const setTeamDomain = (id: string, domain: TeamDomain) => updateTeam(id, { domain } as Partial<Team>);
  const deleteTeam = (id: string) => removeTeam(id);

  /** Add a member to a committee (admin only; recorded in the ledger). */
  const addTeamMember = (teamId: string, memberId: string, role: "member" | "lead" = "member") => {
    if (!selectedOrgId.value) throw new Error("No organization selected");
    return $fetch(`/api/org/teams/${encodeURIComponent(teamId)}/members`, {
      method: "POST",
      body: { orgId: selectedOrgId.value, member: memberId, role },
    });
  };
  const removeTeamMember = (id: string) =>
    $fetch(`/api/org/teams/members/${encodeURIComponent(id)}`, {
      method: "DELETE",
      query: { orgId: selectedOrgId.value },
    });

  /** Promote/demote a team member between lead and plain member. */
  const setLead = (memberRowId: string, isLead: boolean) =>
    $fetch(`/api/org/teams/members/${encodeURIComponent(memberRowId)}`, {
      method: "PATCH",
      body: { orgId: selectedOrgId.value, role: isLead ? "lead" : "member" },
    });

  /** Fetch one team by id (org-scoped). */
  const getTeam = async (id: string): Promise<Team | null> => {
    const rows = (await listTeams({
      fields: ["id", "name", "domain", "color", "icon", "description", "status", "organization"],
      filter: { id: { _eq: id }, organization: { _eq: selectedOrgId.value } },
      limit: 1,
    })) as Team[];
    return rows?.[0] ?? null;
  };

  /** Members of a single team. */
  const listTeamMembers = (tid: string) =>
    listMembers({
      fields: [
        "id", "role", "organization",
        "user.id", "user.first_name", "user.last_name", "user.email",
        "member.id", "member.first_name", "member.last_name",
      ],
      filter: { organization: { _eq: selectedOrgId.value }, team: { _eq: tid } },
      sort: ["role", "user.first_name"],
      limit: 200,
    });

  /** Projects owned by a team (via the elevated projects route). */
  const teamProjects = (tid: string) => useProjects().list({ team: tid });

  return {
    listAllTeams,
    listAllMembers,
    addTeam,
    renameTeam,
    setTeamDomain,
    deleteTeam,
    addTeamMember,
    removeTeamMember,
    setLead,
    getTeam,
    listTeamMembers,
    teamProjects,
    teamId,
    memberUserId,
    TYPE_TO_DOMAIN,
  };
};
