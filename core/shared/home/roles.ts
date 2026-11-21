// The role config behind the home: which content each of the six roles gets in
// the three bands (docs/plan-unified-experience.md §5).
//
// Pure on purpose. `homeFor` reads a RoleContext (who one person is in one
// community) and returns the bands' content KEYS, in order. It names content; it
// does not build it. `HomePage` maps each key to a component, so adding a role's
// tile is a config line, not a new component.
//
// Hats add, never switch: a person who is an owner and on the board gets both
// sets, deduped, the higher-priority role's items first.
import type { RoleContext } from "../roles/role-context";

export type HomeRole = "admin" | "manager" | "board" | "team" | "owner" | "tenant";

/** Display order and merge priority: the widest responsibility reads first. */
export const HOME_ROLE_ORDER: readonly HomeRole[] = [
  "admin",
  "manager",
  "board",
  "team",
  "owner",
  "tenant",
];

/** Band 1: the stack of things that need this person. */
export type NeedsKey =
  | "setup-health"
  | "overdue-community"
  | "delegated-queue"
  | "approvals"
  | "votes"
  | "my-tasks"
  | "area-queue"
  | "balance-due"
  | "forms-to-sign"
  | "notices"
  | "my-requests";

/** Band 2: the marks (`Sparkline`, `Ring`, `Meter`, `StatusTrack`, `Heatstrip`). */
export type GlanceKey =
  | "dashboard-widgets"
  | "community-load"
  | "response-sparkline"
  | "signature-ring"
  | "arrears-meter"
  | "collections-trend"
  | "contracts-heatstrip"
  | "team-ring"
  | "week-strip"
  | "paid-ring"
  | "balance-sparkline"
  | "request-status-track"
  | "next-meeting"
  | "next-event";

/** What the person can do without leaving the home. */
export type ActKey =
  | "reorder-widgets"
  | "reorder-dock"
  | "reassign"
  | "reply-from-row"
  | "approve-in-card"
  | "open-record-over-home"
  | "move-task"
  | "check-off"
  | "pay-sheet"
  | "vote-in-card"
  | "rsvp"
  | "new-request-sheet"
  | "swipe-acknowledge";

export interface HomeConfig {
  needs: readonly NeedsKey[];
  glance: readonly GlanceKey[];
  acts: readonly ActKey[];
}

/** §5's table, row for row. */
export const ROLE_HOMES: Record<HomeRole, HomeConfig> = {
  tenant: {
    needs: ["notices", "my-requests"],
    glance: ["request-status-track", "next-event"],
    acts: ["new-request-sheet", "swipe-acknowledge"],
  },
  owner: {
    needs: ["balance-due", "votes", "forms-to-sign"],
    glance: ["paid-ring", "balance-sparkline", "next-meeting"],
    acts: ["pay-sheet", "vote-in-card", "rsvp"],
  },
  board: {
    needs: ["approvals", "votes"],
    glance: ["signature-ring", "arrears-meter", "collections-trend", "contracts-heatstrip"],
    acts: ["approve-in-card", "open-record-over-home"],
  },
  team: {
    needs: ["my-tasks", "area-queue"],
    glance: ["team-ring", "week-strip"],
    acts: ["move-task", "check-off"],
  },
  manager: {
    needs: ["delegated-queue"],
    glance: ["community-load", "response-sparkline"],
    acts: ["reassign", "reply-from-row"],
  },
  admin: {
    needs: ["setup-health", "overdue-community"],
    glance: ["dashboard-widgets"],
    acts: ["reorder-widgets", "reorder-dock"],
  },
};

/** The third band is the same for everyone: the feed. */
export const FEED_KEY = "whats-new" as const;

export interface HomeBands {
  /** Every role this person holds here, in priority order. */
  roles: HomeRole[];
  needs: NeedsKey[];
  glance: GlanceKey[];
  acts: ActKey[];
  feed: typeof FEED_KEY;
}

/**
 * The roles a context holds. Residency gives owner or tenant; the hats give the
 * rest; a helper or committee grant is the team role. A membership that is over
 * (nothing resolved) holds none.
 */
export function homeRoles(ctx: RoleContext | null | undefined): HomeRole[] {
  if (!ctx) return [];
  const held = new Set<HomeRole>();
  if (ctx.hats.admin) held.add("admin");
  if (ctx.hats.manager) held.add("manager");
  if (ctx.hats.board) held.add("board");
  if (ctx.helps.length > 0) held.add("team");
  if (ctx.residency === "owner") held.add("owner");
  if (ctx.residency === "tenant") held.add("tenant");
  return HOME_ROLE_ORDER.filter((r) => held.has(r));
}

function union<T>(lists: readonly (readonly T[])[]): T[] {
  return [...new Set(lists.flat())];
}

/** Compose the bands for a set of roles: items deduped, first role's order wins. */
export function homeForRoles(roles: readonly HomeRole[]): HomeBands {
  const ordered = HOME_ROLE_ORDER.filter((r) => roles.includes(r));
  return {
    roles: ordered,
    needs: union(ordered.map((r) => ROLE_HOMES[r].needs)),
    glance: union(ordered.map((r) => ROLE_HOMES[r].glance)),
    acts: union(ordered.map((r) => ROLE_HOMES[r].acts)),
    feed: FEED_KEY,
  };
}

/** The home for one person in one community. */
export function homeFor(ctx: RoleContext | null | undefined): HomeBands {
  return homeForRoles(homeRoles(ctx));
}
