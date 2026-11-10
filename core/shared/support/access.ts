// Who may contact HOA Connect, about what, and who sees each request
// (docs/plan-operator-console.md §3 and §5, Phase 3; decisions §9.4–§9.6).
//
// Two doors. "Ask my community" goes to the HOA: it is a `question` in the
// existing community request inbox (hoa_requests), which HOA Admins, the board
// and Property Managers with the `inquiries` grant already work (Peter's call,
// 2026-11-10: reuse it rather than build a second inbox). "Contact HOA Connect"
// is a platform support request, decided here. Shared, so the form offers only
// what the server will accept.

export type SupportCategory = "question" | "bug" | "billing" | "feature";
export type SupportStatus = "new" | "open" | "waiting" | "closed";
export type SupportPriority = "low" | "normal" | "high" | "urgent";

export const SUPPORT_CATEGORIES: ReadonlyArray<{ value: SupportCategory; label: string; hint: string }> = [
  { value: "bug", label: "Something isn't working", hint: "A page, button or email in the app doesn't do what it should." },
  { value: "question", label: "A question about HOA Connect", hint: "How to do something in the app." },
  { value: "billing", label: "Billing", hint: "Your community's HOA Connect subscription, invoices or card." },
  { value: "feature", label: "An idea", hint: "Something you'd like the app to do." },
];

/** As the person who asked reads it. */
export const SUPPORT_STATUS_LABEL: Readonly<Record<SupportStatus, string>> = {
  new: "New",
  open: "Open",
  waiting: "Waiting on you",
  closed: "Closed",
};

/** As HOA Connect reads it, in the console. */
export const SUPPORT_STATUS_LABEL_STAFF: Readonly<Record<SupportStatus, string>> = {
  new: "New",
  open: "Open",
  waiting: "Waiting on them",
  closed: "Closed",
};

export const SUPPORT_PRIORITIES: readonly SupportPriority[] = ["low", "normal", "high", "urgent"];

/** The hats a person wears in one community (or billing account) when they ask. Stored on the request. */
export interface SupportRoles {
  /** hoa_admin | property_manager | member, from their active membership. */
  membership: "hoa_admin" | "property_manager" | "member" | null;
  /** Current-term board offices. */
  boardTitles: string[];
  /** owner | tenant, from residencyFor(). */
  residency: "owner" | "tenant" | null;
  /** A Property Manager's grants that are on. */
  managerGrants: string[];
  /** owner | billing_admin | viewer on the billing account in context. */
  billingAccountRole: string | null;
}

export const NO_ROLES: SupportRoles = {
  membership: null,
  boardTitles: [],
  residency: null,
  managerGrants: [],
  billingAccountRole: null,
};

const ALL: SupportCategory[] = ["bug", "question", "billing", "feature"];

/**
 * What this person may raise with HOA Connect, in this context.
 *  - HOA Admins and board officers: anything.
 *  - Property Managers: anything, with the `contact_platform` grant; nothing without.
 *  - A billing account's owner or billing_admin: anything (the account is what they pay).
 *  - Owners and tenants: app problems only ("Report a problem with the app"); their
 *    questions about the community go to the community (§9.5).
 */
export function supportCategoriesFor(roles: SupportRoles): SupportCategory[] {
  if (roles.membership === "hoa_admin" || roles.boardTitles.length) return ALL;
  if (roles.billingAccountRole === "owner" || roles.billingAccountRole === "billing_admin") return ALL;
  if (roles.membership === "property_manager") return roles.managerGrants.includes("contact_platform") ? ALL : [];
  if (roles.membership === "member") return ["bug"];
  return [];
}

/** Members (owners, tenants, board) can ask their community; a manager or a stranger can't. */
export function canAskCommunity(roles: SupportRoles): boolean {
  return roles.membership === "member" || roles.membership === "hoa_admin" || roles.boardTitles.length > 0;
}

export interface SupportRequestRef {
  requester: string | null;
  organization: string | null;
  billing_account: string | null;
}

export interface SupportViewer {
  userId: string;
  /** HOA Connect staff with the `support` permission (App Admin, Platform Support). */
  staff: boolean;
  /** Communities where this person is an active HOA Admin. */
  adminOf: ReadonlySet<string>;
  /** Billing accounts where this person is owner or billing_admin. */
  accountAdminOf: ReadonlySet<string>;
}

export type SupportAccess = "staff" | "requester" | "community_admin" | "account_admin";

/**
 * How this person may see a platform request, or null. Staff see every one; the
 * requester their own; a community's HOA Admins every one from it (§9.6); a
 * billing account's owner and billing_admins every one about the account. A
 * board officer or a Property Manager sees only what they opened.
 */
export function supportAccess(viewer: SupportViewer, req: SupportRequestRef): SupportAccess | null {
  if (viewer.staff) return "staff";
  if (req.requester && req.requester === viewer.userId) return "requester";
  if (req.organization && viewer.adminOf.has(req.organization)) return "community_admin";
  if (req.billing_account && viewer.accountAdminOf.has(req.billing_account)) return "account_admin";
  return null;
}

export const SUBJECT_MAX = 160;
export const BODY_MAX = 5000;
