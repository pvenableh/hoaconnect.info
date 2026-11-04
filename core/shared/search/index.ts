/**
 * The record groups Spotlight (⌘K) searches, and who may search each.
 *
 * Pure — no Directus, no H3 — so the gating and the filter shape are unit
 * tested (tests/shared/search.test.ts) and the route (`GET /api/search`) is a
 * thin loop over this table.
 *
 * WHO: record search is a STAFF affordance. Every hit links into /admin, which
 * a plain member cannot open, so offering members a list of their neighbours'
 * names would be both a privacy leak and a page of dead links. Members still
 * get the destination search (apps and sections), which is client-side.
 * Within staff, each group is further gated on the capability matrix
 * (`core/shared/permissions.ts`), the same table the routes enforce.
 *
 * ORG SCOPE: every filter carries `organization = orgId`. The route queries
 * with the admin token (it has to — a board member's Directus role cannot read
 * every collection), so this filter is the ONLY thing between a caller and
 * another association's rows. `buildSearchFilter` always adds it; there is a
 * test that it cannot be omitted.
 */
import type { Actor, Capability } from "#core/shared/permissions";
import { hasCapability } from "#core/shared/permissions";

export type SearchGroupKey =
  | "members"
  | "units"
  | "vendors"
  | "documents"
  | "meetings"
  | "requests"
  | "projects"
  | "channels";

export interface SearchHit {
  id: string;
  name: string;
  description: string;
  /** Org-relative path; the client prefixes the org slug. */
  to: string;
  /** A member hit's login (Directus user id), when they have one — what "Message …" needs. */
  userId?: string;
}

export interface SearchGroupResult {
  key: SearchGroupKey;
  label: string;
  icon: string;
  /** The org module that switches this group's app on; the client hides the group when it is off. */
  module?: string;
  items: SearchHit[];
}

type Row = Record<string, any>;

export interface SearchGroupDef {
  key: SearchGroupKey;
  label: string;
  icon: string;
  collection: string;
  module?: string;
  /** A capability from the matrix, or "admin" for association admins only. */
  requires: Capability | "admin";
  fields: string[];
  searchFields: string[];
  toHit: (row: Row) => SearchHit;
}

const STAFF: Actor[] = [
  "admin",
  "board_president",
  "board_vp",
  "board_treasurer",
  "board_secretary",
  "board_member",
  "property_manager",
];

export const MIN_QUERY = 2;
export const MAX_QUERY = 64;
export const PER_GROUP = 5;

const join = (...parts: Array<string | null | undefined>) =>
  parts.filter((p) => p && String(p).trim()).join(" · ");

const shortDate = (v: string | null | undefined) => (v ? String(v).slice(0, 10) : "");

export const SEARCH_GROUPS: SearchGroupDef[] = [
  {
    key: "members",
    label: "Members",
    icon: "lucide:users-round",
    collection: "hoa_members",
    module: "directory",
    requires: "directory:read",
    fields: ["id", "first_name", "last_name", "email", "member_type", "company", "user"],
    searchFields: ["first_name", "last_name", "email", "company", "phone"],
    toHit: (r) => ({
      id: String(r.id),
      name: [r.first_name, r.last_name].filter(Boolean).join(" ") || r.email || "Member",
      description: join(r.email, r.member_type),
      to: `/admin/members?member=${encodeURIComponent(String(r.id))}`,
      ...(r.user ? { userId: String(typeof r.user === "object" ? r.user.id : r.user) } : {}),
    }),
  },
  {
    key: "units",
    label: "Units",
    icon: "lucide:door-closed",
    collection: "hoa_units",
    module: "directory",
    requires: "directory:read",
    fields: ["id", "unit_number", "occupancy"],
    searchFields: ["unit_number"],
    toHit: (r) => ({
      id: String(r.id),
      name: `Unit ${r.unit_number ?? ""}`.trim(),
      description: join(r.occupancy),
      to: `/admin/units/${encodeURIComponent(String(r.id))}`,
    }),
  },
  {
    key: "vendors",
    label: "Vendors",
    icon: "lucide:contact",
    collection: "hoa_vendors",
    module: "vendors",
    requires: "directory:read",
    fields: ["id", "company", "name", "category", "email"],
    searchFields: ["company", "name", "email", "category"],
    toHit: (r) => ({
      id: String(r.id),
      name: r.company || r.name || "Vendor",
      description: join(r.company ? r.name : null, r.category),
      to: "/admin/vendors",
    }),
  },
  {
    key: "documents",
    label: "Documents",
    icon: "lucide:file-text",
    collection: "hoa_documents",
    module: "documents",
    requires: "documents:read",
    fields: ["id", "title", "date_published"],
    searchFields: ["title"],
    toHit: (r) => ({
      id: String(r.id),
      name: r.title || "Document",
      description: shortDate(r.date_published),
      to: "/admin/documents",
    }),
  },
  {
    key: "meetings",
    label: "Meetings",
    icon: "lucide:calendar-days",
    collection: "hoa_meetings",
    module: "meetings",
    requires: "documents:read",
    fields: ["id", "title", "meeting_date", "location"],
    searchFields: ["title", "location"],
    toHit: (r) => ({
      id: String(r.id),
      name: r.title || "Meeting",
      description: join(shortDate(r.meeting_date), r.location),
      to: "/admin/meetings",
    }),
  },
  {
    key: "requests",
    label: "Requests",
    icon: "lucide:clipboard-list",
    collection: "hoa_requests",
    module: "requests",
    requires: "violations:manage",
    fields: ["id", "title", "type", "status"],
    searchFields: ["title", "description"],
    toHit: (r) => ({
      id: String(r.id),
      name: r.title || "Request",
      description: join(r.type, r.status),
      to: `/admin/requests/${encodeURIComponent(String(r.id))}`,
    }),
  },
  {
    key: "projects",
    label: "Projects",
    icon: "lucide:kanban-square",
    collection: "hoa_projects",
    module: "projects",
    requires: "projects:read",
    fields: ["id", "title", "status"],
    searchFields: ["title", "description"],
    toHit: (r) => ({
      id: String(r.id),
      name: r.title || "Project",
      description: join(r.status),
      to: `/admin/projects/${encodeURIComponent(String(r.id))}`,
    }),
  },
  {
    // Admins only: channel visibility is per-membership (private channels), and
    // the membership check lives in the channel routes, not in this table.
    key: "channels",
    label: "Channels",
    icon: "lucide:messages-square",
    collection: "hoa_channels",
    module: "channels",
    requires: "admin",
    fields: ["id", "name", "slug", "description"],
    searchFields: ["name", "description"],
    toHit: (r) => ({
      id: String(r.id),
      name: r.name ? `#${r.name}` : "Channel",
      description: r.description || "",
      to: `/admin/channels/${encodeURIComponent(String(r.slug || r.id))}`,
    }),
  },
];

export const isStaff = (actors: Iterable<Actor>) => [...actors].some((a) => STAFF.includes(a));

/** The groups this caller may search. Empty for a non-staff caller. */
export function searchGroupsFor(actors: Actor[]): SearchGroupDef[] {
  if (!isStaff(actors)) return [];
  return SEARCH_GROUPS.filter((g) =>
    g.requires === "admin" ? actors.includes("admin") : hasCapability(actors, g.requires),
  );
}

/** Trimmed and bounded; null when too short to be worth a round trip. */
export function normalizeQuery(raw: unknown): string | null {
  const q = String(raw ?? "").trim().slice(0, MAX_QUERY);
  return q.length >= MIN_QUERY ? q : null;
}

/** Directus filter: the org scope AND any search field containing the query. */
export function buildSearchFilter(def: SearchGroupDef, orgId: string, q: string) {
  return {
    _and: [
      { organization: { _eq: orgId } },
      { _or: def.searchFields.map((f) => ({ [f]: { _icontains: q } })) },
    ],
  };
}
