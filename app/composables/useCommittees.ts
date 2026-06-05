/**
 * useCommittees — lightweight committee/assignment roles.
 *
 * Lets a non-board member be empowered to MANAGE a specific domain (violations,
 * ARC, maintenance, finance) without being a full board member. A committee
 * member gets "manager" capability for their domain: on requests of the matching
 * type they can transition/assign and see/post internal comments.
 *
 * Code-first (UX affordances). Backed by hoa_committee_members
 * (scripts/create-committees-collection.ts).
 */
import type { RequestType } from "~/config/requestWorkflows";

export type CommitteeKey = "violations" | "arc" | "maintenance" | "finance" | "general";

export interface CommitteeMember {
  id: string;
  committee: CommitteeKey;
  role?: "member" | "chair" | null;
  user?: { id: string; first_name?: string; last_name?: string; email?: string } | string | null;
  member?: { id: string; first_name?: string; last_name?: string } | string | null;
  organization?: string | null;
}

// Which committee owns each request type.
const TYPE_TO_COMMITTEE: Record<RequestType, CommitteeKey> = {
  violation: "violations",
  arc: "arc",
  maintenance: "maintenance",
  complaint: "general",
  task: "general",
};

export const COMMITTEE_LABELS: Record<CommitteeKey, string> = {
  violations: "Violations",
  arc: "Architectural Review",
  maintenance: "Maintenance",
  finance: "Finance",
  general: "General",
};

const COMMITTEE_FIELDS = [
  "id",
  "committee",
  "role",
  "organization",
  "user.id",
  "user.first_name",
  "user.last_name",
  "user.email",
  "member.id",
  "member.first_name",
  "member.last_name",
];

export const useCommittees = () => {
  const { user } = useDirectusAuth();
  const selectedOrgId = useState<string | null>("selectedOrgId", () => null);
  const { list, create, remove } = useDirectusItems<CommitteeMember>("hoa_committee_members");

  const userId = (m: CommitteeMember) => (typeof m.user === "string" ? m.user : m.user?.id);

  // The current user's committee keys for the active org.
  const loadMine = async (): Promise<Set<CommitteeKey>> => {
    if (!user.value?.id || !selectedOrgId.value) return new Set();
    const rows = await list({
      fields: ["committee"],
      filter: {
        organization: { _eq: selectedOrgId.value },
        user: { _eq: user.value.id },
      },
      limit: 50,
    });
    return new Set(rows.map((r) => r.committee));
  };

  const listAll = () =>
    list({
      fields: COMMITTEE_FIELDS,
      filter: { organization: { _eq: selectedOrgId.value } },
      sort: ["committee"],
      limit: 200,
    });

  const addMember = async (committee: CommitteeKey, userId: string, memberId?: string | null, role: "member" | "chair" = "member") => {
    if (!selectedOrgId.value) throw new Error("No organization selected");
    return create({
      committee,
      role,
      user: userId,
      member: memberId || null,
      organization: selectedOrgId.value,
    } as CommitteeMember);
  };

  const removeMember = (id: string) => remove(id);

  // Does the current user manage a given request type?
  const canManageRequestType = (mine: Set<CommitteeKey>, type: string | null | undefined): boolean => {
    const key = TYPE_TO_COMMITTEE[(type as RequestType) || "task"];
    return key ? mine.has(key) : false;
  };

  return {
    loadMine,
    listAll,
    addMember,
    removeMember,
    canManageRequestType,
    userId,
    TYPE_TO_COMMITTEE,
  };
};
