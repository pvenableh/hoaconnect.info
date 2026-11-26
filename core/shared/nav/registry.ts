/**
 * The app registry — the ONLY source of nav entries (docs/spec-capability-nav.md,
 * plan §2.2: "navigation is the capability matrix, rendered").
 *
 * The dock (and its Apps card on a phone), the section pills, Spotlight,
 * `module.global.ts` and the `nav-gate` middleware all read these entries, so a
 * destination cannot be offered by one surface and refused by another.
 *
 * Each entry names what it `needs`; every need must hold. The hat picks a
 * LAYOUT (which entries are offered, in what order); it never satisfies a need.
 * Access comes only from admin, a capability or an area's work switch.
 *
 * Pure: no Vue, no Directus. Callers build a `NavContext` from the role context.
 */
import type { Capability } from "../permissions";
import { AREA_KEYS, type AreaKey } from "../transition/grants";

export type NavNeed =
  | { admin: true }
  /** Admin holds every capability, so a capability entry also admits admins. */
  | { capability: Capability }
  /** `areas[k].canWork`; a list means any one of them; "any" = at least one area. */
  | { area: AreaKey | readonly AreaKey[] | "any" }
  | { residency: "owner" | "tenant" | "any" }
  /** The community's module toggle. A list means any one of them is on. */
  | { module: string | readonly string[] }
  /** A boolean on the organization; unset counts as true. */
  | { orgFlag: "show_board" };

export interface NavEntry {
  id: string;
  label: string;
  /** Under the dock icon; keeps chip spacing even. */
  shortName: string;
  /** lucide name, without the i-lucide- prefix. */
  icon: string;
  /** Org-relative. A hub's path is only its fallback; it opens on its first pill. */
  path: string;
  needs: readonly NavNeed[];
  /** Set on a pill: the id of the hub it sits under. */
  section?: string;
  /** Prefixes that mark the entry active ("__root__" = exactly "/"). Defaults to its path. */
  match?: readonly string[];
  /** Extra prefixes its module gate covers (legacy URLs with no entry of their own). */
  routes?: readonly string[];
  /**
   * In the member layout, the entry this one takes the place of when it shows
   * (a helper's Projects manages; the resident one only reads). docs/spec-delegation.md.
   */
  replaces?: string;
  description?: string;
}

const A = { admin: true } as const;
const mod = (m: string | readonly string[]) => ({ module: m }) as const;
const area = (a: AreaKey | readonly AreaKey[] | "any") => ({ area: a }) as const;
const cap = (c: Capability) => ({ capability: c }) as const;

// ORDER MATTERS inside a hub: a hub opens on its first visible pill.
export const NAV_ENTRIES: readonly NavEntry[] = [
  // ── The manager's queue ────────────────────────────────────────────────────
  // /manage resolves to the first area the manager can work.
  { id: "queue", label: "Queue", shortName: "Queue", icon: "inbox", path: "/manage", needs: [area("any")], match: ["/manage"] },

  // ── Admin hubs and their pills ─────────────────────────────────────────────
  { id: "dashboard", label: "Dashboard", shortName: "Home", icon: "layout-dashboard", path: "/", needs: [A], match: ["__root__", "/admin/boardroom", "/admin/activity", "/admin/ai-spend"] },
  { id: "overview", section: "dashboard", label: "Overview", shortName: "Overview", icon: "layout-dashboard", path: "/", needs: [A], description: "Your community at a glance." },
  // The dashboard's second view, a pill since 2026-11-18 (it was a segmented
  // control inside the page, which put a second "Overview" under the capsule's).
  // Same page, `?tab=building`: useSectionNav matches a pill's query.
  { id: "building", section: "dashboard", label: "Building", shortName: "Building", icon: "building-2", path: "/?tab=building", needs: [A, mod("feed")], description: "The building feed: announcements, documents and mail as they happen." },
  // The Board Room plans the WHOLE association, so it sits with the
  // assistant's other surfaces rather than under one content section.
  { id: "boardroom", section: "dashboard", label: "Board Room", shortName: "Board Room", icon: "gavel", path: "/admin/boardroom", needs: [A], description: "Have the assistant brief the board and draft a plan you approve step by step." },
  { id: "activity", section: "dashboard", label: "Activity", shortName: "Activity", icon: "activity", path: "/admin/activity", needs: [A], description: "Resident page views, downloads, and logins." },
  { id: "ai-spend", section: "dashboard", label: "AI spend", shortName: "AI spend", icon: "sparkles", path: "/admin/ai-spend", needs: [A], description: "How the assistant and AI features use the credit wallet." },

  { id: "people", label: "People", shortName: "People", icon: "users-round", path: "/admin/people", needs: [A], match: ["/admin/people", "/admin/members", "/admin/units", "/admin/teams", "/board", "/admin/vendors"] },
  { id: "members", section: "people", label: "Members", shortName: "Members", icon: "users-round", path: "/admin/members", needs: [A, mod("directory")], description: "Owners, tenants, and their contact details." },
  { id: "units", section: "people", label: "Units", shortName: "Units", icon: "door-closed", path: "/admin/units", needs: [A, mod("directory")], description: "Units, addresses, and occupancy." },
  { id: "board-roster", section: "people", label: "Board", shortName: "Board", icon: "award", path: "/board", needs: [A, mod("board")], description: "Board roster and current terms." },
  // Directory is "Members, units, and teams" (Settings → Modules), and the
  // route was always gated on it; the pill now says so too.
  { id: "teams", section: "people", label: "Teams", shortName: "Teams", icon: "users", path: "/admin/teams", needs: [A, mod("directory")], description: "Committees and working groups." },
  { id: "vendors-admin", section: "people", label: "Vendors & management", shortName: "Vendors", icon: "contact", path: "/admin/vendors", needs: [A, mod("vendors")], description: "Service providers and property-manager access." },

  { id: "comms", label: "Communications", shortName: "Comms", icon: "mail", path: "/admin/communications", needs: [A, mod(["email", "channels", "polls"])], match: ["/admin/communications", "/admin/email", "/admin/announcements", "/admin/channels", "/polls"] },
  { id: "email", section: "comms", label: "Email", shortName: "Email", icon: "mail", path: "/admin/communications", needs: [A, mod("email")], routes: ["/admin/email"], description: "Compose and send to your community." },
  { id: "channels", section: "comms", label: "Channels", shortName: "Channels", icon: "messages-square", path: "/admin/channels", needs: [A, mod("channels")], description: "Group chat for the board and committees." },
  // Polls has no /admin page: the member route carries the create form and
  // results for anyone the polls routes call a manager.
  { id: "polls-admin", section: "comms", label: "Polls", shortName: "Polls", icon: "vote", path: "/polls", needs: [A, mod("polls")], routes: ["/admin/polls"], description: "Community votes and surveys." },

  { id: "records", label: "Records", shortName: "Records", icon: "library", path: "/admin/reporting", needs: [A, mod(["meetings", "documents", "rules", "governing", "files"])], match: ["/admin/reporting", "/admin/meetings", "/meetings", "/admin/documents", "/documents", "/admin/files", "/rules", "/governing", "/admin/ledger"] },
  { id: "meetings-admin", section: "records", label: "Meetings", shortName: "Meetings", icon: "calendar-days", path: "/admin/meetings", needs: [A, mod("meetings")], description: "Agendas, minutes, RSVPs, and votes." },
  { id: "documents-admin", section: "records", label: "Documents", shortName: "Documents", icon: "file-text", path: "/admin/documents", needs: [A, mod("documents")], description: "The curated, published document library." },
  { id: "storage", section: "records", label: "Storage", shortName: "Storage", icon: "folder", path: "/admin/files", needs: [A, mod("files")], description: "Dropbox-style manager for raw folders and files." },
  { id: "rules-admin", section: "records", label: "Rules", shortName: "Rules", icon: "scale", path: "/rules", needs: [A, mod("rules")], description: "By-laws, CC&Rs, and searchable governance." },
  { id: "governing-admin", section: "records", label: "Governing Documents", shortName: "Gov Docs", icon: "scroll-text", path: "/governing", needs: [A, mod("governing")], description: "The recorded declaration, by-laws and amendments, word for word." },
  // No module gate: a community's permanent record of itself is not optional.
  { id: "ledger-admin", section: "records", label: "Ledger", shortName: "Ledger", icon: "history", path: "/admin/ledger", needs: [A], description: "The permanent record of what happened to your community." },

  // Money: whoever holds money:read (admins and every board seat). What each
  // may do on a page is the server's (money:enter, the approval rule), so the
  // pages show only those controls (docs/spec-money-approvals.md).
  { id: "payments", label: "Money", shortName: "Money", icon: "wallet", path: "/admin/payments", needs: [cap("money:read"), mod(["payments", "expenses"])], match: ["/admin/payments", "/admin/expenses", "/approvals"] },
  { id: "payments-admin", section: "payments", label: "Payments", shortName: "Payments", icon: "wallet", path: "/admin/payments", needs: [cap("money:read"), mod("payments")], description: "Dues, assessments, and statements." },
  { id: "expenses", section: "payments", label: "Expenses", shortName: "Expenses", icon: "receipt", path: "/admin/expenses", needs: [cap("money:read"), mod("expenses")], description: "Track and categorize community expenses." },
  // Money approvals: the same page twice, as a pill in the Money hub and as a
  // member-layout slot after Money (a pill cannot sit in a layout). Entries
  // that tie on a path are any-of for the gate; both need the same here.
  { id: "money-approvals-admin", section: "payments", label: "Approvals", shortName: "Approvals", icon: "stamp", path: "/approvals", needs: [cap("money:read"), mod(["payments", "expenses"])], description: "Spending and voids waiting on the board." },

  // The responsibilities register (plan §3.4). Two entries on one path, because
  // needs are ANDed and it has two doors: `responsibilities:read` (admins hold
  // every capability, and so does every board seat) and the manager's area
  // grant. `entriesForPath` treats entries that tie on a path as any-of for the
  // gate, which is how Documents and Projects already do it (`documents` and
  // `documents-mgr`). An any-of need would have to teach every reader of `needs`
  // a new shape. Writes are the editors' (admin or the grant): the page shows
  // those controls only when the route says `viewer.canEdit`.
  { id: "responsibilities-register", label: "Responsibilities", shortName: "Duties", icon: "list-checks", path: "/admin/responsibilities", needs: [cap("responsibilities:read"), mod("responsibilities")] },

  { id: "requests", label: "Requests", shortName: "Requests", icon: "clipboard-list", path: "/admin/more", needs: [A], match: ["/admin/more", "/admin/requests", "/admin/projects", "/admin/leads", "/admin/approvals", "/admin/moderation"] },
  { id: "requests-admin", section: "requests", label: "Requests", shortName: "Requests", icon: "clipboard-list", path: "/admin/requests", needs: [A, mod("requests")], description: "Resident maintenance, architectural, and general requests." },
  { id: "projects-admin", section: "requests", label: "Projects", shortName: "Projects", icon: "kanban-square", path: "/admin/projects", needs: [A, mod("projects")], description: "Track community projects and tasks to completion." },
  { id: "leads", section: "requests", label: "Leads", shortName: "Leads", icon: "inbox", path: "/admin/leads", needs: [A], description: "Inquiries from your public site's contact form." },
  { id: "approvals-admin", section: "requests", label: "Approvals", shortName: "Approvals", icon: "clipboard-check", path: "/admin/approvals", needs: [A], description: "Review resident-submitted changes to contact info, mailing address, vehicles, and pets." },
  { id: "moderation", section: "requests", label: "Moderation", shortName: "Moderation", icon: "shield-alert", path: "/admin/moderation", needs: [A, mod("moderation")], description: "Review flagged posts, comments, and reports." },

  // Settings keeps a real landing page (a twelve-destination map); these pills
  // are its top five.
  { id: "settings", label: "Settings", shortName: "Setup", icon: "settings", path: "/admin/settings", needs: [A], match: ["/admin/settings", "/admin/users"] },
  { id: "organization", section: "settings", label: "Organization", shortName: "Organization", icon: "building-2", path: "/admin/settings/organization", needs: [A], description: "Identity, branding, and SEO." },
  { id: "domains", section: "settings", label: "Public site", shortName: "Public site", icon: "globe", path: "/admin/settings/domains", needs: [A], description: "Landing page and custom domain." },
  { id: "users", section: "settings", label: "Users", shortName: "Users", icon: "user-cog", path: "/admin/users", needs: [A], description: "Login accounts and roles." },
  { id: "features", section: "settings", label: "Features", shortName: "Features", icon: "toggle-right", path: "/admin/settings/organization?tab=modules", needs: [A], description: "Turn optional apps on or off." },
  { id: "billing", section: "settings", label: "Billing", shortName: "Billing", icon: "sparkles", path: "/admin/settings/organization?tab=subscription", needs: [A], description: "Plan, dues, and payouts." },

  // ── Member apps ────────────────────────────────────────────────────────────
  { id: "home", label: "Home", shortName: "Home", icon: "home", path: "/", needs: [], match: ["__root__"] },
  { id: "meetings", label: "Meetings", shortName: "Meet", icon: "calendar-days", path: "/meetings", needs: [mod("meetings")] },
  { id: "documents", label: "Documents", shortName: "Docs", icon: "file-text", path: "/documents", needs: [mod("documents")] },
  { id: "rules", label: "Rules", shortName: "Rules", icon: "scale", path: "/rules", needs: [mod("rules")] },
  // The recorded declaration, by-laws and amendments — not house Rules.
  { id: "governing", label: "Governing Documents", shortName: "Gov Docs", icon: "scroll-text", path: "/governing", needs: [mod("governing")] },
  { id: "board", label: "Board", shortName: "Board", icon: "award", path: "/board", needs: [mod("board"), { orgFlag: "show_board" }] },
  // The published register: who handles what, today. The board decides when it
  // is published (the page says so until then), so the entry needs only the module.
  { id: "responsibilities", label: "Who handles what", shortName: "Jobs", icon: "hand-helping", path: "/responsibilities", needs: [mod("responsibilities")] },
  // Ungated (Pillar B): an owner sees what their board decided without asking.
  { id: "ledger", label: "Ledger", shortName: "Ledger", icon: "history", path: "/ledger", needs: [] },
  { id: "pay", label: "Payments", shortName: "Pay", icon: "credit-card", path: "/payments", needs: [mod("payments")] },
  // What the board is waiting on (docs/spec-money-approvals.md). Every board seat.
  { id: "money-approvals", label: "Approvals", shortName: "Approvals", icon: "stamp", path: "/approvals", needs: [cap("money:read"), mod(["payments", "expenses"])] },
  { id: "my-requests", label: "Requests", shortName: "Requests", icon: "clipboard-list", path: "/requests", needs: [mod("requests")] },
  { id: "projects", label: "Projects", shortName: "Projects", icon: "kanban-square", path: "/projects", needs: [mod("projects")] },
  { id: "polls", label: "Polls", shortName: "Polls", icon: "vote", path: "/polls", needs: [mod("polls")] },
  { id: "vendors", label: "Vendors", shortName: "Vendors", icon: "contact", path: "/vendors", needs: [mod("vendors")] },

  // ── Manager areas: one entry per area that has a page ─────────────────────
  // Violations are worked on the inquiries page: the violation requests, and "New violation".
  { id: "inquiries", label: "Inquiries", shortName: "Inquiries", icon: "inbox", path: "/manage/inquiries", needs: [area(["inquiries", "violations"])] },
  { id: "directory", label: "Directory", shortName: "Directory", icon: "users", path: "/manage/directory", needs: [area("directory")] },
  // The server (isChangeReviewer) lets a manager or helper with Directory review changes.
  { id: "approvals", label: "Approvals", shortName: "Approvals", icon: "clipboard-check", path: "/admin/approvals", needs: [area("directory")] },
  { id: "communications", label: "Communications", shortName: "Comms", icon: "mail", path: "/manage/communications", needs: [area("communications")] },
  { id: "documents-mgr", label: "Documents", shortName: "Docs", icon: "file-text", path: "/documents", needs: [area("documents"), mod("documents")] },
  { id: "feedback", label: "Feedback", shortName: "Feedback", icon: "vote", path: "/polls", needs: [area("feedback"), mod("polls")] },
  // The meetings page for whoever works the area; a helper's takes the resident Meetings' place.
  { id: "meetings-mgr", label: "Meetings", shortName: "Meet", icon: "calendar-days", path: "/manage/meetings", needs: [area("meetings"), mod("meetings")], replaces: "meetings" },
  { id: "projects-mgr", label: "Projects", shortName: "Projects", icon: "kanban-square", path: "/admin/projects", needs: [area("projects"), mod("projects")], replaces: "projects" },
  { id: "responsibilities-mgr", label: "Responsibilities", shortName: "Duties", icon: "list-checks", path: "/admin/responsibilities", needs: [area("responsibilities"), mod("responsibilities")] },
  { id: "activity-mgr", label: "Activity", shortName: "Activity", icon: "activity", path: "/admin/activity", needs: [area("activity")] },
];

/** Routes with a module gate and no nav entry. */
export const ROUTE_ONLY_GATES: readonly { path: string; module: string }[] = [
  // The building feed is a Dashboard tab, not an app.
  { path: "/feed", module: "feed" },
];

/** The hat picks the layout; `needs` decide what of it shows. */
export const NAV_LAYOUTS = {
  admin: ["queue", "dashboard", "people", "responsibilities-register", "comms", "records", "payments", "requests", "settings"],
  manager: ["queue", "inquiries", "directory", "approvals", "communications", "documents-mgr", "meetings-mgr", "feedback", "projects-mgr", "responsibilities-mgr", "activity-mgr"],
  // A board seat's own register sits beside the one owners read.
  member: ["home", "meetings", "documents", "rules", "governing", "board", "responsibilities-register", "responsibilities", "ledger", "payments", "money-approvals", "pay", "my-requests", "projects", "polls"],
  /** What the phone's Apps card adds beyond the dock (a member's Vendors): once
   *  the mobile menu sheet's "Navigation" list; the dock skips what it holds. */
  sheet: ["home", "board", "documents", "vendors"],
} as const satisfies Record<string, readonly string[]>;

export type NavLayoutId = keyof typeof NAV_LAYOUTS;

/**
 * What a helper or committee member adds to the member layout
 * (docs/spec-delegation.md): the manage entry for each helper area whose
 * page is not already in the member dock. Documents and Polls are: those
 * pages show their manage controls from the server's `viewer`. Kept out of
 * NAV_LAYOUTS.member so page transitions and MEMBER_APPS are unchanged.
 */
export const MEMBER_HELPER_ENTRIES = ["inquiries", "directory", "approvals", "communications", "meetings-mgr", "projects-mgr", "responsibilities-mgr"] as const;


/** Hubs that keep a landing page of their own instead of opening on a pill. */
const HUB_HOME_OVERRIDE: Readonly<Record<string, string>> = { dashboard: "/", settings: "/admin/settings" };

/** What one person can do in the community being viewed. */
export interface NavContext {
  admin: boolean;
  capabilities: readonly Capability[];
  canWork: (area: AreaKey) => boolean;
  residency: "owner" | "tenant" | "none";
  isEnabled: (module: string) => boolean;
  orgFlag: (flag: string) => boolean;
}

const BY_ID: ReadonlyMap<string, NavEntry> = new Map(NAV_ENTRIES.map((e) => [e.id, e]));

export function navEntry(id: string): NavEntry | undefined {
  return BY_ID.get(id);
}

/** The pills under a hub, in registry order. */
export function pillsOf(hubId: string): NavEntry[] {
  return NAV_ENTRIES.filter((e) => e.section === hubId);
}

export function isHub(id: string): boolean {
  return NAV_ENTRIES.some((e) => e.section === id);
}

/** Does one need hold? */
export function holds(need: NavNeed, ctx: NavContext): boolean {
  if ("admin" in need) return ctx.admin;
  if ("capability" in need) return ctx.admin || ctx.capabilities.includes(need.capability);
  if ("area" in need) {
    if (need.area === "any") return ctx.admin || anyAreaWorkable(ctx);
    const keys: readonly AreaKey[] = typeof need.area === "string" ? [need.area] : need.area;
    return ctx.admin || keys.some((k) => ctx.canWork(k));
  }
  if ("residency" in need) {
    return need.residency === "any" ? ctx.residency !== "none" : ctx.residency === need.residency;
  }
  if ("module" in need) {
    const keys = typeof need.module === "string" ? [need.module] : need.module;
    return keys.some((k) => ctx.isEnabled(k));
  }
  return ctx.orgFlag(need.orgFlag);
}

function anyAreaWorkable(ctx: NavContext): boolean {
  return AREA_KEYS.some((k) => ctx.canWork(k));
}

/** Every need holds. A hub additionally needs one visible pill. */
export function meets(entry: NavEntry, ctx: NavContext): boolean {
  if (!entry.needs.every((n) => holds(n, ctx))) return false;
  if (isHub(entry.id)) return pillsOf(entry.id).some((p) => meets(p, ctx));
  return true;
}

/** The access needs only — module toggles are module.global's job. */
export function meetsAccess(entry: NavEntry, ctx: NavContext): boolean {
  return entry.needs.every((n) => "module" in n || holds(n, ctx));
}

export function visiblePills(hubId: string, ctx: NavContext): NavEntry[] {
  return pillsOf(hubId).filter((p) => meets(p, ctx));
}

/** Where a hub opens: its override, else its first visible pill. Null when none shows. */
export function hubHome(hubId: string, ctx: NavContext): string | null {
  const override = HUB_HOME_OVERRIDE[hubId];
  if (override) return override;
  return visiblePills(hubId, ctx)[0]?.path ?? null;
}

export interface LayoutInput {
  admin: boolean;
  /** At least one area this person can work (admin aside). */
  anyArea: boolean;
  /**
   * Every area they can work is held as a helper or committee member
   * (RoleContext `helps`), none through a manager grant.
   */
  helperOnly?: boolean;
  previewing: boolean;
}

/** Which layout a person gets. Identity only: never grants a need. */
export function layoutFor(input: LayoutInput): NavLayoutId {
  if (input.previewing) return "member";
  if (input.admin) return "admin";
  // A manager grant puts a person in the manager's dock; a manager with nothing
  // granted has nothing to put there. A helper stays a resident: the member dock
  // with their entries added (MEMBER_HELPER_ENTRIES), never the manager's.
  return input.anyArea && !input.helperOnly ? "manager" : "member";
}

/**
 * A layout's visible entries. The admin layout offers the queue only to an
 * admin wearing the manager hat; a hub is resolved to where it opens.
 */
export function navEntriesFor(layout: NavLayoutId, ctx: NavContext, opts: { managerHat?: boolean } = {}): NavEntry[] {
  const out: NavEntry[] = [];
  for (const id of NAV_LAYOUTS[layout]) {
    if (layout === "admin" && id === "queue" && !opts.managerHat) continue;
    const entry = BY_ID.get(id);
    if (!entry || !meets(entry, ctx)) continue;
    out.push(isHub(id) ? { ...entry, path: hubHome(id, ctx) ?? entry.path } : entry);
  }
  if (layout === "member") {
    // A helper's entries: in place of the one they replace, else appended,
    // and never a second slot for a page already in the dock.
    for (const id of MEMBER_HELPER_ENTRIES) {
      const entry = BY_ID.get(id);
      if (!entry || !meets(entry, ctx)) continue;
      const at = entry.replaces ? out.findIndex((e) => e.id === entry.replaces) : -1;
      if (at >= 0) out.splice(at, 1, entry);
      else if (!out.some((e) => e.path === entry.path)) out.push(entry);
    }
  }
  return out;
}

/** The context an admin previewing the member view is shown: no hats, areas or capabilities. */
export function previewContext(ctx: NavContext): NavContext {
  return { ...ctx, admin: false, capabilities: [], canWork: () => false };
}

/** Where a person's home is: the queue for a manager who can work something, else the org root. */
export function homePathFor(input: { managerHat: boolean; anyArea: boolean }): "/manage" | "/" {
  return input.managerHat && input.anyArea ? "/manage" : "/";
}

// ── Route gates ──────────────────────────────────────────────────────────────

const stripQuery = (p: string) => p.split("?")[0] || "/";

function singleModule(entry: NavEntry): string | null {
  const keys = entry.needs.flatMap((n) => ("module" in n ? [n.module] : []));
  if (keys.length !== 1) return null;
  const k = keys[0];
  return typeof k === "string" ? k : null;
}

/** The route prefixes an entry covers: its path plus `routes`. The org root covers nothing. */
export function coveredPrefixes(entry: NavEntry): string[] {
  return [entry.path, ...(entry.routes ?? [])].map(stripQuery).filter((p) => p !== "/");
}

/**
 * module.global's table, built from the registry: every entry with exactly one
 * module key gates its path and `routes` on it. Hubs (a list of modules) gate
 * nothing themselves; their pills do.
 */
export function moduleRoutePrefixes(): { module: string; prefix: string }[] {
  const out = new Map<string, string>();
  for (const e of NAV_ENTRIES) {
    const m = singleModule(e);
    if (!m) continue;
    for (const p of coveredPrefixes(e)) if (!out.has(p)) out.set(p, m);
  }
  for (const g of ROUTE_ONLY_GATES) if (!out.has(g.path)) out.set(g.path, g.module);
  return [...out].map(([prefix, module]) => ({ module, prefix }));
}

const covers = (prefix: string, rel: string) => rel === prefix || rel.startsWith(`${prefix}/`);

/** The module an org-relative route belongs to (longest prefix), or null. */
export function moduleForPath(rel: string): string | null {
  let best: { module: string; len: number } | null = null;
  for (const { module, prefix } of moduleRoutePrefixes()) {
    if (covers(prefix, rel) && (!best || prefix.length > best.len)) best = { module, len: prefix.length };
  }
  return best?.module ?? null;
}

/** The entries whose longest covered prefix matches `rel` (all ties). */
export function entriesForPath(rel: string): NavEntry[] {
  let bestLen = -1;
  let hits: NavEntry[] = [];
  for (const e of NAV_ENTRIES) {
    for (const p of coveredPrefixes(e)) {
      if (!covers(p, rel)) continue;
      if (p.length > bestLen) {
        bestLen = p.length;
        hits = [e];
      } else if (p.length === bestLen && !hits.includes(e)) {
        hits.push(e);
      }
    }
  }
  return hits;
}

/** May this person open `rel`? True when any entry covering it meets its access needs. */
export function routeAllowed(rel: string, ctx: NavContext): boolean {
  const entries = entriesForPath(rel);
  if (!entries.length) return true;
  return entries.some((e) => meetsAccess(e, ctx));
}
