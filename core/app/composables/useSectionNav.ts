// useSectionNav — the single source of truth for a section's child links (each
// admin section's sub-pages). The sub-nav pill bar (App/SubNav.vue), the mobile
// nav sheet, and the dock's section-home resolution all read from here, so they
// can never drift apart. Keyed by the section `key` in useAppNav's ADMIN_APPS
// (people / comms / records / payments / requests / settings).
//
// ORDER MATTERS: the first module-enabled link in a section is where the dock
// lands (sectionHomeFor), so put the section's main screen first.
//
// `module` is the module-gate key (omit for always-on links like Teams /
// Approvals / Activity). `path` is org-relative — consumers run it through
// buildOrgPath. NOTE: Board (/board) and Rules (/rules) are member routes (not
// /admin/*); they render workspace chrome via their layout:auth.

export interface SectionLink {
  label: string;
  path: string;
  icon: string; // lucide name (no i-lucide- prefix)
  description?: string;
  module?: string;
}

const ADMIN_SECTION_LINKS: Record<string, SectionLink[]> = {
  // Dashboard is the "insights" home: the at-a-glance overview plus the usage
  // analytics (resident Activity, AI spend) that don't belong with the
  // association's materials in Records.
  dashboard: [
    { label: "Overview", path: "/", icon: "layout-dashboard", description: "Your community at a glance." },
    // The Board Room sits with the assistant's other surfaces rather than
    // earning an eighth dock slot: it plans the WHOLE association, so filing it
    // under any one content section would have been a lie about its scope. Its
    // minutes are filed under Records → Meetings, where a governance record
    // belongs.
    { label: "Board Room", path: "/admin/boardroom", icon: "gavel", description: "Have the assistant brief the board and draft a plan you approve step by step." },
    { label: "Activity", path: "/admin/activity", icon: "activity", description: "Resident page views, downloads, and logins." },
    { label: "AI spend", path: "/admin/ai-spend", icon: "sparkles", description: "How the assistant and AI features use the credit wallet." },
  ],
  people: [
    { label: "Members", path: "/admin/members", icon: "users-round", description: "Owners, tenants, and their contact details.", module: "directory" },
    { label: "Units", path: "/admin/units", icon: "door-closed", description: "Units, addresses, and occupancy.", module: "directory" },
    { label: "Board", path: "/board", icon: "award", description: "Board roster and current terms.", module: "board" },
    { label: "Teams", path: "/admin/teams", icon: "users", description: "Committees and working groups." },
    { label: "Vendors & management", path: "/admin/vendors", icon: "contact", description: "Service providers and property-manager access.", module: "vendors" },
  ],
  comms: [
    { label: "Email", path: "/admin/communications", icon: "mail", description: "Compose and send to your community.", module: "email" },
    { label: "Channels", path: "/admin/channels", icon: "messages-square", description: "Group chat for the board and committees.", module: "channels" },
  ],
  records: [
    { label: "Meetings", path: "/admin/meetings", icon: "calendar-days", description: "Agendas, minutes, RSVPs, and votes.", module: "meetings" },
    { label: "Documents", path: "/admin/documents", icon: "file-text", description: "The curated, published document library.", module: "documents" },
    { label: "Storage", path: "/admin/files", icon: "folder", description: "Dropbox-style manager for raw folders and files.", module: "files" },
    { label: "Rules", path: "/rules", icon: "scale", description: "By-laws, CC&Rs, and searchable governance.", module: "rules" },
    // No module gate: a community's permanent record of itself is not an
    // optional app, and an org that could switch its own audit trail off in
    // Settings would make "append-only" a setting rather than a guarantee.
    { label: "Ledger", path: "/admin/ledger", icon: "history", description: "The permanent record of what happened to your community." },
  ],
  payments: [
    { label: "Payments", path: "/admin/payments", icon: "wallet", description: "Dues, assessments, and statements.", module: "payments" },
    { label: "Expenses", path: "/admin/expenses", icon: "receipt", description: "Track and categorize community expenses.", module: "expenses" },
  ],
  requests: [
    { label: "Requests", path: "/admin/requests", icon: "clipboard-list", description: "Resident maintenance, architectural, and general requests.", module: "requests" },
    { label: "Projects", path: "/admin/projects", icon: "kanban-square", description: "Track community projects and tasks to completion.", module: "projects" },
    { label: "Approvals", path: "/admin/approvals", icon: "clipboard-check", description: "Review resident-submitted changes to contact info, mailing address, vehicles, and pets." },
    { label: "Moderation", path: "/admin/moderation", icon: "shield-alert", description: "Review flagged posts, comments, and reports.", module: "moderation" },
  ],
  // Settings is the one section that keeps a real landing page of its own
  // (SettingsHubPage — a twelve-destination map). This curated flat list is the
  // sub-nav's top five, not that whole map.
  settings: [
    { label: "Organization", path: "/admin/settings/organization", icon: "building-2", description: "Identity, branding, and SEO." },
    { label: "Public site", path: "/admin/settings/domains", icon: "globe", description: "Landing page and custom domain." },
    { label: "Users", path: "/admin/users", icon: "user-cog", description: "Login accounts and roles." },
    { label: "Features", path: "/admin/settings/organization?tab=modules", icon: "toggle-right", description: "Turn optional apps on or off." },
    { label: "Billing", path: "/admin/settings/organization?tab=subscription", icon: "sparkles", description: "Plan, dues, and payouts." },
  ],
};

export function useSectionNav() {
  const route = useRoute();
  const { isEnabled } = useModules();
  const { buildOrgPath } = useOrgNavigation();

  // Module-filtered flat links for a hub (drops links whose module is off).
  const sectionLinksFor = (key: string | null | undefined): SectionLink[] => {
    if (!key) return [];
    return (ADMIN_SECTION_LINKS[key] || []).filter((l) => !l.module || isEnabled(l.module));
  };

  // Is this section link the current page? Compare against the org-scoped path,
  // query stripped, by prefix (so /admin/projects/123 keeps Projects active).
  const isLinkActive = (path: string): boolean => {
    const target = buildOrgPath(path).split("?")[0];
    const here = route.path.replace(/\/$/, "") || "/";
    const base = target.replace(/\/$/, "") || "/";
    // A link to the org root ("/", e.g. the Dashboard "Overview" tab) must match
    // ONLY the root itself — the prefix rule would otherwise mark it active on
    // every page under /{slug}/.
    const orgRoot = buildOrgPath("/").split("?")[0].replace(/\/$/, "") || "/";
    if (base === orgRoot) return here === base;
    return here === base || here.startsWith(base + "/");
  };

  const hasChildren = (key: string | null | undefined): boolean =>
    sectionLinksFor(key).length > 0;

  // Org-relative landing route for a section (see sectionHomeFor below).
  const resolveSectionHome = (key: string | null | undefined): string | null =>
    sectionHomeFor(key, isEnabled);

  return {
    sectionLinksFor,
    isLinkActive,
    hasChildren,
    resolveSectionHome,
    buildOrgPath,
  };
}

// The route a dock/sidebar section slot should actually open. A section used to
// land on a card grid (AdminSectionHub) whose links were IDENTICAL to the pills
// AppSubNav already shows on every workspace page — a whole screen of clicking
// for a menu the user could see anyway. So a section opens its first
// module-enabled child instead, and the sub-nav keeps doing the disclosure.
//
// Module-aware by construction: an org with Directory off lands on Board rather
// than a dead Members link. Sections in SECTION_HOME_OVERRIDE keep a real
// landing page of their own — Settings is a genuine map (twelve destinations
// against the sub-nav's five curated ones), so it stays put.
const SECTION_HOME_OVERRIDE: Record<string, string> = {
  dashboard: "/",
  settings: "/admin/settings",
};

export function sectionHomeFor(
  key: string | null | undefined,
  isEnabled: (module: string) => boolean
): string | null {
  if (!key) return null;
  const override = SECTION_HOME_OVERRIDE[key];
  if (override) return override;
  const first = (ADMIN_SECTION_LINKS[key] || []).find((l) => !l.module || isEnabled(l.module));
  return first?.path ?? null;
}

// The section-root routes that used to render an AdminSectionHub card grid.
// Kept as real routes (bookmarks, org-redirect.global's allowlist, and the
// custom-domain orgScopedRedirect map all point at them) but redirected onto
// the section's home by the `section-home` middleware. Mapped to the section
// key so the middleware doesn't need a second copy of the dock registry.
export const SECTION_ROOT_ROUTES: Record<string, string> = {
  "/admin/people": "people",
  "/admin/reporting": "records",
  "/admin/more": "requests",
};
