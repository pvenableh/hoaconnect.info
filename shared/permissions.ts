/**
 * Code-first capability matrix — HOA features × actors.
 *
 * The single source of truth for "which kind of actor may do what". An **actor**
 * is a hat a user wears inside one org (org admin, a board office, property
 * manager, team lead, plain member); a user can wear several at once. A
 * **capability** is a `feature:action` string. `hasCapability` ORs the matrix
 * across the actors a caller holds, so the most permissive hat wins.
 *
 * This is the STATIC matrix — a per-org editor is deferred. Server routes remain
 * the enforcement point (see server/utils/board-access.ts, project-access.ts,
 * manager-access.ts); this module only answers "does this set of actors include
 * the capability". The same matrix feeds UI gating via <RoleGate> so the chrome
 * a user sees matches what the server will actually allow.
 *
 * `admin` is a super-actor: it implicitly holds every capability, so the matrix
 * below only lists the NON-admin actors per capability.
 *
 * Note on Property Manager: the `property_manager` actor is coarse. A PM's finer
 * per-grant flags (hoa_members.manager_permissions — e.g. the `projects` grant)
 * are enforced separately in the server utils; where a capability depends on a
 * specific grant, the route layers that check on top of this matrix rather than
 * encoding it here.
 */

export type Actor =
  | "admin"
  | "board_president"
  | "board_vp"
  | "board_treasurer"
  | "board_secretary"
  | "board_member"
  | "property_manager"
  | "team_lead"
  | "member";

export type Capability =
  | "projects:read"
  | "projects:write"
  | "milestone:approve"
  | "money:read"
  | "money:write"
  | "directory:read"
  | "documents:read"
  | "communications:send"
  | "violations:manage"
  | "members:manage"
  | "settings:manage";

export const ALL_ACTORS: Actor[] = [
  "admin",
  "board_president",
  "board_vp",
  "board_treasurer",
  "board_secretary",
  "board_member",
  "property_manager",
  "team_lead",
  "member",
];

/**
 * NON-admin actors granted each capability. `admin` is implicit everywhere and
 * is intentionally omitted from these lists (see `hasCapability`).
 */
export const CAPABILITY_MATRIX: Record<Capability, Actor[]> = {
  // Reads are broad — anyone with a seat in the org can see projects/docs/dir.
  "projects:read": [
    "board_president",
    "board_vp",
    "board_treasurer",
    "board_secretary",
    "board_member",
    "property_manager",
    "team_lead",
    "member",
  ],
  "documents:read": [
    "board_president",
    "board_vp",
    "board_treasurer",
    "board_secretary",
    "board_member",
    "property_manager",
    "team_lead",
    "member",
  ],
  "directory:read": [
    "board_president",
    "board_vp",
    "board_treasurer",
    "board_secretary",
    "board_member",
    "property_manager",
    "team_lead",
  ],

  // Project writes: team leads own their team's projects. PM-with-`projects`
  // grant is layered on in project-access.ts (grant-specific).
  "projects:write": ["team_lead"],

  // Milestone approval: project owners (team leads) plus the executive board
  // offices. PM-with-`projects` grant is layered on in the route.
  "milestone:approve": ["board_president", "board_vp", "team_lead"],

  // Money: the treasurer owns the books; the president has read oversight.
  "money:read": ["board_treasurer", "board_president"],
  "money:write": ["board_treasurer"],

  // Higher-trust outward actions.
  "communications:send": ["board_president", "property_manager"],
  "violations:manage": ["property_manager", "board_member"],

  // Org-administration — admin only (implicit; empty non-admin list).
  "members:manage": [],
  "settings:manage": [],
};

/** Map a board office title (hoa_board_members.title) to its actor. */
export function boardTitleToActor(
  title: string | null | undefined
): Actor | null {
  switch (title) {
    case "president":
      return "board_president";
    case "vice_president":
      return "board_vp";
    case "treasurer":
      return "board_treasurer";
    case "secretary":
      return "board_secretary";
    case "director":
      return "board_member";
    default:
      return null;
  }
}

/**
 * Does this set of actors include `capability`? `admin` short-circuits to true
 * (super-actor). Accepts any iterable of actors; unknown actors are ignored.
 */
export function hasCapability(
  actors: Iterable<Actor>,
  capability: Capability
): boolean {
  const granted = CAPABILITY_MATRIX[capability];
  if (!granted) return false;
  for (const a of actors) {
    if (a === "admin") return true;
    if (granted.includes(a)) return true;
  }
  return false;
}

/** The full set of capabilities held by this set of actors (for the client). */
export function capabilitiesFor(actors: Iterable<Actor>): Capability[] {
  const set = new Set(actors);
  if (set.has("admin")) {
    return Object.keys(CAPABILITY_MATRIX) as Capability[];
  }
  return (Object.keys(CAPABILITY_MATRIX) as Capability[]).filter((cap) =>
    CAPABILITY_MATRIX[cap].some((a) => set.has(a))
  );
}
