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
  | "announcements"
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

  return { modules, isEnabled };
}
