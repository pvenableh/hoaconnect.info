/**
 * The org switcher's badge for one membership (docs/spec-capability-nav.md):
 * the manager hat as its own chip, carrying the manager's title, and the other
 * hats as the line under the community's name. Hats add, so an admin who
 * manages shows both. Identity only: nothing here grants access.
 *
 * Pure.
 */
export interface HatBadgeInput {
  hats: { board: boolean; manager: boolean; admin: boolean };
  managerTitle: string | null;
  residency: "owner" | "tenant" | "none";
}

/** "Manager", or "Manager · Accounting" with a title. Null without the hat. */
export function managerChip(b: HatBadgeInput): string | null {
  if (!b.hats.manager) return null;
  const title = b.managerTitle?.trim();
  return title ? `Manager · ${title}` : "Manager";
}

/** The line under the name: every hat but the manager's, then residency. */
export function hatLine(b: HatBadgeInput): string {
  const parts: string[] = [];
  if (b.hats.admin) parts.push("Admin");
  if (b.hats.board) parts.push("Board");
  if (b.residency === "owner") parts.push("Owner");
  else if (b.residency === "tenant") parts.push("Resident");
  if (!parts.length) return b.hats.manager ? "" : "Member";
  return parts.join(" · ");
}
