/**
 * useTeams — named teams/committees with optional domain-based manager rights.
 *
 * A team has a free-text name and an optional `domain`. Members of a team whose
 * domain maps to a request's type get board-style controls on that request
 * (transition/assign/internal comments) without full board access.
 *
 * Code-first capability. Backed by hoa_teams + hoa_team_members
 * (scripts/create-teams-collections.ts).
 */
import type { RequestType } from "~/config/requestWorkflows";

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
  const { user } = useDirectusAuth();
  const selectedOrgId = useState<string | null>("selectedOrgId", () => null);
  const { list: listTeams, create: createTeam, update: updateTeam, remove: removeTeam } =
    useDirectusItems<Team>("hoa_teams");
  const { list: listMembers, create: createMember, remove: removeMember } =
    useDirectusItems<TeamMember>("hoa_team_members");

  const teamId = (m: TeamMember) => (typeof m.team === "string" ? m.team : m.team?.id);
  const memberUserId = (m: TeamMember) => (typeof m.user === "string" ? m.user : m.user?.id);

  // The domains the current user manages (from the teams they belong to).
  const loadMyDomains = async (): Promise<Set<TeamDomain>> => {
    if (!user.value?.id || !selectedOrgId.value) return new Set();
    const rows = await listMembers({
      fields: ["team.domain"],
      filter: {
        organization: { _eq: selectedOrgId.value },
        user: { _eq: user.value.id },
      },
      limit: 100,
    });
    const domains = new Set<TeamDomain>();
    for (const r of rows as any[]) {
      const d = typeof r.team === "object" ? r.team?.domain : null;
      if (d && d !== "none") domains.add(d);
    }
    return domains;
  };

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

  const addTeamMember = (teamId: string, userId: string, memberId?: string | null, role: "member" | "lead" = "member") => {
    if (!selectedOrgId.value) throw new Error("No organization selected");
    return createMember({ team: teamId, user: userId, member: memberId || null, role, organization: selectedOrgId.value } as TeamMember);
  };
  const removeTeamMember = (id: string) => removeMember(id);

  const canManageRequestType = (myDomains: Set<TeamDomain>, type: string | null | undefined): boolean => {
    const d = TYPE_TO_DOMAIN[(type as RequestType) || "task"];
    return d ? myDomains.has(d) : false;
  };

  return {
    loadMyDomains,
    listAllTeams,
    listAllMembers,
    addTeam,
    renameTeam,
    setTeamDomain,
    deleteTeam,
    addTeamMember,
    removeTeamMember,
    canManageRequestType,
    teamId,
    memberUserId,
    TYPE_TO_DOMAIN,
  };
};
