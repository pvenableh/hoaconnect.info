// useModules — per-org optional module on/off toggles (Phase 7b, Track B).
//
// Each org stores a `modules` JSON map on hoa_organizations (added by
// scripts/add-org-modules-field.ts). Disabled modules hide from the dock and
// their pages refuse access (via the `module` route middleware). This is org
// config, not a permission boundary — the server still enforces real access.
//
// Source of truth is the slug-resolved org from useActiveHoa (the /api/hoa/find
// payload includes every org field, `modules` among them). Missing/unknown keys
// default to ENABLED so existing orgs — whose column is null until first save —
// lose nothing.

export type ModuleKey =
  | "feed"
  | "meetings"
  | "polls"
  | "requests"
  | "projects"
  | "moderation"
  | "documents"
  | "rules"
  | "directory"
  | "pets"
  | "vehicles"
  | "leases"
  | "payments"
  | "expenses"
  | "email"
  | "board"
  | "channels";

// Core apps are never toggleable — they must always be reachable.
export const CORE_MODULE_KEYS = ["dashboard", "home", "settings"] as const;

/**
 * The catalogue of toggleable modules, grouped the way Settings → Modules shows
 * them. Lives here rather than in the form because two screens now need it: the
 * form renders it, and the Settings health strip counts how many of them are on.
 * Two hand-kept copies of this list would drift the moment a module is added,
 * and the strip would quietly report "12 of 17" forever.
 *
 * Core apps (dashboard, home, settings) are intentionally absent — never off.
 */
export interface ModuleDefinition {
  key: string;
  label: string;
  description: string;
}

export interface ModuleGroup {
  label: string;
  description: string;
  modules: ModuleDefinition[];
}

export const MODULE_GROUPS: ModuleGroup[] = [
  {
    label: "Community",
    description: "Social and engagement features for residents.",
    modules: [
      { key: "feed", label: "Building Feed", description: "Community posts and activity feed (shown as a Dashboard tab)." },
      { key: "meetings", label: "Meetings", description: "Agendas, minutes, and RSVPs." },
      { key: "polls", label: "Polls", description: "Community votes and surveys." },
      { key: "requests", label: "Requests", description: "Maintenance and service tickets." },
      { key: "moderation", label: "Moderation", description: "Comment reports and review queue." },
    ],
  },
  {
    label: "Records",
    description: "Documents and resident record-keeping.",
    modules: [
      { key: "documents", label: "Documents", description: "Shared files and document library." },
      { key: "files", label: "Storage", description: "Dropbox-style file manager for the org's raw folders and files (Documents is the curated, published library)." },
      { key: "rules", label: "Rules", description: "By-laws, CC&Rs, and searchable governance." },
      { key: "directory", label: "Directory", description: "Members, units, and teams." },
      { key: "vendors", label: "Vendors", description: "Service-provider directory (management, attorney, elevator, …), member-visible per vendor." },
      { key: "pets", label: "Pets", description: "Pet registration records." },
      { key: "vehicles", label: "Vehicles", description: "Vehicle and parking records." },
      { key: "leases", label: "Leases", description: "Tenant lease records." },
    ],
  },
  {
    label: "Money",
    description: "Dues, payments, and expense tracking.",
    modules: [
      { key: "payments", label: "Payments", description: "Resident dues and online payments." },
      { key: "expenses", label: "Expenses", description: "Track money out (vendors, bills)." },
    ],
  },
  {
    label: "Internal",
    description: "Admin and board tools, not member-facing.",
    modules: [
      { key: "channels", label: "Channels", description: "Internal chat for admins and board, with per-channel member invites." },
    ],
  },
  {
    label: "Other",
    description: "Additional tools.",
    modules: [
      { key: "board", label: "Board", description: "Board member roster and terms." },
      { key: "email", label: "Communications", description: "Email broadcasts, newsletters, alerts, templates, and delivery activity." },
    ],
  },
];

/** Every toggleable module key, flattened. */
export const ALL_MODULE_KEYS: string[] = MODULE_GROUPS.flatMap((g) =>
  g.modules.map((m) => m.key),
);

export function useModules() {
  const { activeHoa } = useActiveHoa();

  const modules = computed<Record<string, boolean>>(() => {
    const raw = (activeHoa.value as any)?.modules;
    if (!raw || typeof raw !== "object") return {};
    return raw as Record<string, boolean>;
  });

  /**
   * Is a module enabled? Defaults to true for core apps and any key the org
   * hasn't explicitly set (missing key === enabled).
   */
  const isEnabled = (key: string): boolean => {
    if ((CORE_MODULE_KEYS as readonly string[]).includes(key)) return true;
    const v = modules.value[key];
    return v === undefined || v === null ? true : v !== false;
  };

  /**
   * Does ANY of these keys resolve to enabled? Used to gate a consolidated dock
   * "hub" slot (People, Records, Requests…) that fronts several modules — the
   * hub shows as long as at least one of its children is on. A key that isn't a
   * real module (e.g. "teams", "approvals") is always enabled via isEnabled, so
   * including one as a sentinel keeps a hub permanently visible.
   */
  const anyEnabled = (keys: string[]): boolean => keys.some((k) => isEnabled(k));

  return { modules, isEnabled, anyEnabled };
}
