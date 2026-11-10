// Phase 5 "view as" (docs/plan-operator-console.md §5), as a role preview
// (Peter's call, 2026-11-10): what a tenant, an owner, a board officer, an HOA
// Admin or a Property Manager can reach in a community, computed from the very
// rules the app enforces. No session is swapped, so nothing can be written.
import { boardTitleToActor, capabilitiesFor, CAPABILITY_MATRIX, type Actor, type Capability } from "../permissions";
import { decidePollAccess } from "../polls/access";
import { canViewLedger, visibleTiersFor } from "../ledger/visibility";
import { canAskCommunity, supportCategoriesFor, type SupportRoles } from "../support/access";
import { MANAGER_GRANT_KEYS, grantLabel } from "../transition/grants";

export type PreviewRole = "tenant" | "owner" | "board" | "hoa_admin" | "property_manager";

export const PREVIEW_ROLES: ReadonlyArray<{ value: PreviewRole; label: string }> = [
  { value: "tenant", label: "Tenant" },
  { value: "owner", label: "Owner" },
  { value: "board", label: "Board officer" },
  { value: "hoa_admin", label: "HOA Admin" },
  { value: "property_manager", label: "Property Manager" },
];

const CAPABILITY_LABEL: Record<Capability, string> = {
  "projects:read": "See projects",
  "projects:write": "Run projects",
  "milestone:approve": "Approve project milestones",
  "money:read": "See the community's finances",
  "money:write": "Record expenses and payments",
  "directory:read": "See the member directory",
  "documents:read": "Read the community's documents",
  "governing:read": "Read the governing documents",
  "governing:manage": "Manage governing documents and statute flags",
  "communications:send": "Send emails to members",
  "violations:manage": "Manage violations",
  "members:manage": "Manage members",
  "settings:manage": "Change community settings",
};

export interface RolePreviewInput {
  role: PreviewRole;
  /** For a board officer: president, vice_president, secretary, treasurer or director. */
  boardTitle?: string | null;
  /** For a Property Manager: the grants that are on. */
  grants?: string[];
}

export interface RolePreview {
  role: PreviewRole;
  actors: Actor[];
  capabilities: Array<{ key: Capability; label: string; allowed: boolean; note?: string }>;
  polls: { read: boolean; vote: boolean; manage: boolean };
  ledger: { read: boolean; tiers: readonly string[] };
  requests: { ownOnly: boolean; communityInbox: boolean };
  support: { askCommunity: boolean; contactHoaConnect: string[] };
  grants: Array<{ key: string; label: string; on: boolean }>;
}

export function rolePreview(input: RolePreviewInput): RolePreview {
  const grants = input.role === "property_manager" ? (input.grants ?? []).filter((g) => (MANAGER_GRANT_KEYS as readonly string[]).includes(g)) : [];
  const boardActor = input.role === "board" ? boardTitleToActor(input.boardTitle ?? "director") ?? "board_member" : null;
  const actors: Actor[] =
    input.role === "hoa_admin"
      ? ["admin"]
      : input.role === "property_manager"
        ? ["property_manager"]
        : boardActor
          ? ["member", boardActor]
          : ["member"];
  const isAdmin = input.role === "hoa_admin";
  const isBoard = input.role === "board";
  const isManager = input.role === "property_manager";
  const isMember = !isManager; // a manager has no seat of their own

  const held = new Set(capabilitiesFor(actors));
  // A Property Manager's capability also needs the matching grant (enforced in the server utils).
  const GRANT_FOR: Partial<Record<Capability, string>> = {
    "directory:read": "directory",
    "documents:read": "documents",
    "communications:send": "communications",
    "violations:manage": "violations",
    "projects:read": "projects",
    "projects:write": "projects",
  };
  const capabilities = (Object.keys(CAPABILITY_MATRIX) as Capability[]).map((key) => {
    let allowed = held.has(key);
    let note: string | undefined;
    if (allowed && isManager && GRANT_FOR[key]) {
      allowed = grants.includes(GRANT_FOR[key]!);
      if (!allowed) note = `needs the ${grantLabel(GRANT_FOR[key]!)} grant`;
    }
    return { key, label: CAPABILITY_LABEL[key] ?? key, allowed, ...(note ? { note } : {}) };
  });

  const poll = decidePollAccess({ isAdmin, isBoard, isMember, hasFeedbackGrant: isManager && grants.includes("feedback") });
  const ledgerViewer = { isMember, isBoard, isManager, isAdmin };
  const supportRoles: SupportRoles = {
    membership: isAdmin ? "hoa_admin" : isManager ? "property_manager" : "member",
    boardTitles: isBoard ? [input.boardTitle ?? "director"] : [],
    residency: input.role === "tenant" ? "tenant" : input.role === "owner" || isBoard ? "owner" : null,
    managerGrants: grants,
    billingAccountRole: null,
  };
  return {
    role: input.role,
    actors,
    capabilities,
    polls: { read: poll.canRead, vote: poll.canVote, manage: poll.canManage },
    ledger: { read: canViewLedger(ledgerViewer), tiers: canViewLedger(ledgerViewer) ? visibleTiersFor(ledgerViewer) : [] },
    requests: {
      ownOnly: !(isAdmin || isBoard || (isManager && grants.includes("inquiries"))),
      communityInbox: isAdmin || isBoard || (isManager && grants.includes("inquiries")),
    },
    support: { askCommunity: canAskCommunity(supportRoles), contactHoaConnect: supportCategoriesFor(supportRoles) },
    grants: isManager ? MANAGER_GRANT_KEYS.map((k) => ({ key: k, label: grantLabel(k), on: grants.includes(k) })) : [],
  };
}
