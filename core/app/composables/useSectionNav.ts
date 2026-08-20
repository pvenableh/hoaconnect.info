// useSectionNav — the single source of truth for a section's child links
// (each admin hub's sub-pages). The classic grouped sidebar (App/Sidebar.vue),
// the modern secondary sub-nav bar (App/SubNav.vue), AND the hub landing pages
// (PeopleHubPage / ReportingHubPage / MoreHubPage) all read from here, so they
// can never drift apart. Keyed by the hub `key` in useAppNav's ADMIN_APPS
// (people / comms / records / payments / requests / settings).
//
// `module` is the module-gate key (omit for always-on links like Teams/Approvals
// /Activity). `group` lets a section split into labelled groups on its hub page
// (the flat sidebar/sub-nav ignores it). `path` is org-relative — consumers run
// it through buildOrgPath. NOTE: Board (/board) and Rules (/rules) are member
// routes (not /admin/*); they render workspace chrome via their layout:auth.

export interface SectionLink {
  label: string;
  path: string;
  icon: string; // lucide name (no i-lucide- prefix)
  description?: string;
  module?: string;
  group?: string;
}

export interface SectionGroup {
  label?: string;
  items: SectionLink[];
}

const ADMIN_SECTION_LINKS: Record<string, SectionLink[]> = {
  // Dashboard is the "insights" home: the at-a-glance overview plus the usage
  // analytics (resident Activity, AI spend) that don't belong with the
  // association's materials in Records.
  dashboard: [
    { label: "Overview", path: "/", icon: "layout-dashboard", description: "Your community at a glance." },
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
    { label: "Requests", path: "/admin/requests", icon: "clipboard-list", description: "Resident maintenance, architectural, and general requests.", module: "requests", group: "Work" },
    { label: "Projects", path: "/admin/projects", icon: "kanban-square", description: "Track community projects and tasks to completion.", module: "projects", group: "Work" },
    { label: "Approvals", path: "/admin/approvals", icon: "clipboard-check", description: "Review resident-submitted changes to contact info, mailing address, vehicles, and pets.", group: "Review queues" },
    { label: "Moderation", path: "/admin/moderation", icon: "shield-alert", description: "Review flagged posts, comments, and reports.", module: "moderation", group: "Review queues" },
  ],
  // Settings keeps its bespoke grouped hub page (SettingsHubPage); this curated
  // flat list is only for the sidebar/sub-nav (the top destinations).
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

  // Same links, split into labelled groups (for the hub landing pages). A
  // section with no `group` on its links collapses to one unlabelled group.
  const sectionGroupsFor = (key: string | null | undefined): SectionGroup[] => {
    const links = sectionLinksFor(key);
    const order: string[] = [];
    const byGroup = new Map<string, SectionLink[]>();
    for (const l of links) {
      const g = l.group ?? "";
      if (!byGroup.has(g)) {
        byGroup.set(g, []);
        order.push(g);
      }
      byGroup.get(g)!.push(l);
    }
    return order.map((g) => ({ label: g || undefined, items: byGroup.get(g)! }));
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

  return { sectionLinksFor, sectionGroupsFor, isLinkActive, hasChildren, buildOrgPath };
}

// Convenience for the hub landing pages: the section's groups already mapped to
// the SectionHub card shape (label/description/icon/to/show), org paths built.
// Structurally compatible with Admin/SectionHub's HubGroup[] without coupling
// the core layer to an app-level type.
export function useSectionHubGroups(key: string) {
  const { sectionGroupsFor, buildOrgPath } = useSectionNav();
  return computed(() =>
    sectionGroupsFor(key).map((g) => ({
      label: g.label,
      items: g.items.map((l) => ({
        label: l.label,
        description: l.description || "",
        icon: l.icon,
        to: buildOrgPath(l.path),
        show: true,
      })),
    }))
  );
}
