// useAppNav — the "Apps" model for the floating dock navigation, plus the
// Earnest-style appearance prefs (named color palettes, label visibility,
// dock position, glass chrome). State persists to localStorage.
//
// Color model (ported from Earnest's useAppAccent): each palette is a source
// HSL ramp; the apps in view get accents sampled across that ramp via pickGappy
// (gappy sampling = adjacent apps get contrasting hues). Accents drive
// --app-accent-* (earnest-ui.css) on the dock chips and the document default.

export interface HSL {
  h: number;
  s: number;
  l: number;
}

export interface AppDef {
  key: string;
  label: string;
  /** Short label shown under the dock icon (keeps chip spacing even) */
  shortName: string;
  icon: string; // lucide icon name (without the i-lucide- prefix)
  /** Path relative to the org root, e.g. "/admin/meetings" or "/meetings" */
  path: string;
  /** Route fragments that mark this app active ("__root__" = exact "/") */
  match: string[];
  /**
   * For a "hub" slot that fronts several modules (People, Records, Requests…):
   * the module keys it contains. The slot shows iff any child is enabled
   * (anyEnabled). Omit for a leaf slot whose own `key` is its module gate.
   */
  children?: string[];
}

export type DockPosition = "bottom" | "top";
export type PaletteId = "fresh" | "aurora" | "neutral" | "vivid";

interface Palette {
  label: string;
  hint: string;
  source: HSL[];
}

// Source ramps ported from Earnest (Sea Mist → "Fresh", Aurora, Neutral)
export const PALETTES: Record<PaletteId, Palette> = {
  fresh: {
    label: "Fresh",
    hint: "Aquamarine through bright sky blue",
    source: [
      { h: 163, s: 100, l: 75 },
      { h: 171, s: 80, l: 69 },
      { h: 180, s: 66, l: 63 },
      { h: 188, s: 70, l: 61 },
      { h: 194, s: 73, l: 59 },
      { h: 202, s: 69, l: 59 },
      { h: 213, s: 64, l: 56 },
      { h: 239, s: 53, l: 59 },
      { h: 261, s: 60, l: 56 },
      { h: 278, s: 70, l: 52 },
    ],
  },
  aurora: {
    label: "Aurora",
    hint: "Neon pink → ultrasonic blue → sky aqua",
    source: [
      { h: 333, s: 93, l: 60 },
      { h: 309, s: 70, l: 52 },
      { h: 292, s: 72, l: 52 },
      { h: 276, s: 78, l: 56 },
      { h: 248, s: 80, l: 62 },
      { h: 230, s: 83, l: 62 },
      { h: 221, s: 84, l: 60 },
      { h: 212, s: 84, l: 61 },
      { h: 194, s: 85, l: 58 },
    ],
  },
  neutral: {
    label: "Neutral",
    hint: "Sky → yale-blue chromatic ramp",
    source: [
      { h: 196, s: 90, l: 52 },
      { h: 193, s: 84, l: 48 },
      { h: 195, s: 78, l: 44 },
      { h: 199, s: 70, l: 41 },
      { h: 204, s: 62, l: 39 },
      { h: 210, s: 56, l: 38 },
      { h: 216, s: 50, l: 38 },
      { h: 222, s: 45, l: 38 },
    ],
  },
  // GreaterOps "glass" category colors — vivid multi-hue, high adjacent contrast
  vivid: {
    label: "Vivid",
    hint: "GreaterOps glass — cyan, magenta, lime, pink",
    source: [
      { h: 195, s: 100, l: 50 }, // #00bfff cyan pop
      { h: 286, s: 100, l: 49 }, // #c200fb magenta
      { h: 82, s: 78, l: 40 }, // #7cb518 lime
      { h: 330, s: 92, l: 48 }, // #ec0868 hot pink
      { h: 180, s: 92, l: 38 }, // #08bdbd teal
      { h: 59, s: 82, l: 43 }, // #c6c013 chartreuse
      { h: 187, s: 13, l: 47 }, // #688589 slate
    ],
  },
};
export const PALETTE_IDS = Object.keys(PALETTES) as PaletteId[];

// Gappy sampling: spread `count` picks across a ramp of `sourceLen` (Earnest)
export function pickGappy(sourceLen: number, count: number): number[] {
  if (count <= 1) return [0];
  if (count >= sourceLen)
    return Array.from({ length: count }, (_, i) => Math.min(i, sourceLen - 1));
  const step = (sourceLen - 1) / (count - 1);
  return Array.from({ length: count }, (_, i) => Math.round(i * step));
}

// Map unread notifications onto per-app badge counts, keyed by app `key`. A
// single notification type fans out to BOTH the admin hub key and the member
// leaf key (e.g. a meeting → "records" for the admin dock AND "meetings" for the
// member dock) — extra keys are harmless since each surface only reads
// counts[app.key] for the apps it actually renders. Keeping this in one place is
// what stops the dock and the sidebar badge maps from drifting apart.
const NOTIF_BADGE_KEYS: Record<string, string[]> = {
  announcement: ["comms"],
  email: ["comms"],
  meeting: ["records", "meetings"],
  document: ["records", "documents"],
  payment: ["payments"],
  membership: ["people"],
  request: ["requests"],
};

export function badgeCountsFor(
  notifications: readonly { readonly type?: string | null; readonly isRead?: boolean }[] | null | undefined
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const n of notifications || []) {
    if (n.isRead) continue;
    for (const key of NOTIF_BADGE_KEYS[n.type ?? ""] ?? []) {
      counts[key] = (counts[key] || 0) + 1;
    }
  }
  return counts;
}

const PALETTE_KEY = "app-nav-palette";
const POSITION_KEY = "app-nav-position";
const LABELS_KEY = "app-nav-labels";
const GLASS_KEY = "app-nav-glass";

// Module-level reactive state (shared across all callers)
const palette = ref<PaletteId>("fresh");
const dockPosition = ref<DockPosition>("bottom");
const showLabels = ref(false);
const glassChrome = ref(true);
let initialized = false;

function loadPrefs() {
  if (!import.meta.client || initialized) return;
  initialized = true;
  const p = localStorage.getItem(PALETTE_KEY);
  if (p && p in PALETTES) palette.value = p as PaletteId;
  const pos = localStorage.getItem(POSITION_KEY);
  if (pos === "bottom" || pos === "top") dockPosition.value = pos;
  showLabels.value = localStorage.getItem(LABELS_KEY) === "1";
  const g = localStorage.getItem(GLASS_KEY);
  if (g != null) glassChrome.value = g === "1";
}

export function useAppNav() {
  const route = useRoute();
  const { buildOrgPath, navigateToOrg } = useOrgNavigation();
  const { isEnabled, anyEnabled } = useModules();

  loadPrefs();

  // Admin dock — job-based sections rather than a flat tool list. Seven slots:
  // Home + five content sections (People, Communications, Records, Money,
  // Requests) + Settings. Each section fronts several modules and opens on the
  // first of them (see appsFor); AppSubNav discloses the rest as pills. A
  // section's `children` are its module keys; the slot shows iff any child is on
  // (anyEnabled). Leaf slots (dashboard, settings) gate on their own `key` and
  // are core (always shown). `match[]` covers every child route so the
  // longest-prefix activeKeyFor highlights the right section. Channels is still
  // reached via the top-nav chat button (deliberately off the dock).
  const ADMIN_APPS: AppDef[] = [
    { key: "dashboard", label: "Dashboard", shortName: "Home", icon: "layout-dashboard", path: "/", match: ["__root__", "/admin/activity", "/admin/ai-spend"] },
    {
      key: "people", label: "People", shortName: "People", icon: "users-round", path: "/admin/people",
      // Vendors is a People-area route (/admin/vendors). It used to live under
      // /admin/settings/property-management, which collided with the Settings hub
      // prefix and made the sidebar jump to Settings; the dedicated URL fixes that.
      match: ["/admin/people", "/admin/members", "/admin/units", "/admin/teams", "/board", "/admin/vendors"],
      children: ["directory", "board", "vendors", "teams"],
    },
    {
      key: "comms", label: "Communications", shortName: "Comms", icon: "mail", path: "/admin/communications",
      match: ["/admin/communications", "/admin/email", "/admin/announcements", "/admin/channels"],
      children: ["email", "channels"],
    },
    {
      key: "records", label: "Records", shortName: "Records", icon: "library", path: "/admin/reporting",
      match: ["/admin/reporting", "/admin/meetings", "/meetings", "/admin/documents", "/documents", "/admin/files", "/rules", "/admin/ledger"],
      children: ["meetings", "documents", "rules", "files"],
    },
    {
      key: "payments", label: "Money", shortName: "Money", icon: "wallet", path: "/admin/payments",
      match: ["/admin/payments", "/admin/expenses"],
      children: ["payments", "expenses"],
    },
    {
      key: "requests", label: "Requests", shortName: "Requests", icon: "clipboard-list", path: "/admin/more",
      match: ["/admin/more", "/admin/requests", "/admin/projects", "/admin/approvals", "/admin/moderation"],
      children: ["requests", "projects", "moderation", "approvals"],
    },
    // Settings is a core app (never module-toggled) — keep it last so the dock
    // always ends with a way into org configuration / public site / billing.
    { key: "settings", label: "Settings", shortName: "Setup", icon: "settings", path: "/admin/settings", match: ["/admin/settings", "/admin/users"] },
  ];

  const MEMBER_APPS: AppDef[] = [
    { key: "home", label: "Home", shortName: "Home", icon: "home", path: "/", match: ["__root__"] },
    { key: "meetings", label: "Meetings", shortName: "Meet", icon: "calendar-days", path: "/meetings", match: ["/meetings"] },
    { key: "documents", label: "Documents", shortName: "Docs", icon: "file-text", path: "/documents", match: ["/documents"] },
    { key: "rules", label: "Rules", shortName: "Rules", icon: "scale", path: "/rules", match: ["/rules"] },
    { key: "board", label: "Board", shortName: "Board", icon: "award", path: "/board", match: ["/board"] },
    // Ungated, like the admin link: Pillar B's promise is that an owner can see
    // what their board decided WITHOUT asking permission, and a ledger an org
    // can hide from its own owners is not that promise.
    { key: "ledger", label: "Ledger", shortName: "Ledger", icon: "history", path: "/ledger", match: ["/ledger"] },
    { key: "payments", label: "Payments", shortName: "Pay", icon: "credit-card", path: "/payments", match: ["/payments"] },
    { key: "requests", label: "Requests", shortName: "Requests", icon: "clipboard-list", path: "/requests", match: ["/requests"] },
    { key: "projects", label: "Projects", shortName: "Projects", icon: "kanban-square", path: "/projects", match: ["/projects"] },
  ];

  // Hide apps whose org module is toggled off (Track B). A hub slot shows iff
  // ANY of its children is enabled (anyEnabled); a leaf slot gates on its own
  // `key` (which doubles as its module key — core apps like dashboard/home/
  // settings aren't in any module map, so isEnabled() returns true for them).
  //
  // A hub's declared `path` is its section ROOT (/admin/people, /admin/more…),
  // which used to render a grid of cards listing exactly what AppSubNav already
  // shows as pills. The dock now opens the section's first enabled child
  // directly, so the click lands on content instead of on a menu. Resolving
  // here — rather than redirecting from the root page — means no navigation
  // flash and no history entry to back out of. `match` is deliberately left
  // alone: it still covers the root, so the slot highlights either way, and the
  // root route keeps a redirect shim for typed URLs and old links.
  const appsFor = (isAdmin: boolean): AppDef[] =>
    (isAdmin ? ADMIN_APPS : MEMBER_APPS)
      .filter((app) => (app.children ? anyEnabled(app.children) : isEnabled(app.key)))
      .map((app) =>
        app.children ? { ...app, path: sectionHomeFor(app.key, isEnabled) ?? app.path } : app
      );

  // Per-app accent sampled from the active palette ramp by the app's position
  const accentsForApps = (apps: AppDef[], paletteId: PaletteId = palette.value): HSL[] => {
    const source = PALETTES[paletteId].source;
    const idx = pickGappy(source.length, apps.length);
    return apps.map((_, i) => source[idx[i]]);
  };

  // Swatches for the palette picker (sampled across an example 7-app spread)
  const swatchesFor = (paletteId: PaletteId, count = 7): string[] => {
    const source = PALETTES[paletteId].source;
    const idx = pickGappy(source.length, count);
    return idx.map((i) => `hsl(${source[i].h} ${source[i].s}% ${source[i].l}%)`);
  };

  const activeKeyFor = (apps: AppDef[]): string | null => {
    const slug = route.params.slug as string | undefined;
    const rel = slug ? route.path.replace(new RegExp(`^/${slug}`), "") || "/" : route.path;
    let best: { key: string; len: number } | null = null;
    for (const app of apps) {
      for (const m of app.match) {
        const hit = m === "__root__" ? rel === "/" : rel.startsWith(m);
        if (hit && (!best || m.length > best.len)) best = { key: app.key, len: m.length };
      }
    }
    return best?.key ?? null;
  };

  const go = (app: AppDef) => navigateToOrg(app.path);

  // ---- Preference setters ----
  const setPalette = (p: PaletteId) => {
    palette.value = p;
    if (import.meta.client) localStorage.setItem(PALETTE_KEY, p);
  };
  const setPosition = (pos: DockPosition) => {
    dockPosition.value = pos;
    if (import.meta.client) localStorage.setItem(POSITION_KEY, pos);
  };
  const setShowLabels = (v: boolean) => {
    showLabels.value = v;
    if (import.meta.client) localStorage.setItem(LABELS_KEY, v ? "1" : "0");
  };
  const setGlassChrome = (v: boolean) => {
    glassChrome.value = v;
    if (import.meta.client) localStorage.setItem(GLASS_KEY, v ? "1" : "0");
  };

  // Drive the document default accent from an HSL (per-page .accent-* still wins)
  const applyDocumentAccent = (accent?: HSL) => {
    if (!import.meta.client) return;
    const el = document.documentElement;
    if (!accent) return;
    el.style.setProperty("--app-accent-h", String(accent.h));
    el.style.setProperty("--app-accent-s", `${accent.s}%`);
    el.style.setProperty("--app-accent-l", `${accent.l}%`);
  };

  return {
    palette,
    dockPosition,
    showLabels,
    glassChrome,
    appsFor,
    accentsForApps,
    swatchesFor,
    activeKeyFor,
    go,
    buildOrgPath,
    setPalette,
    setPosition,
    setShowLabels,
    setGlassChrome,
    applyDocumentAccent,
    PALETTES,
    PALETTE_IDS,
  };
}
