// useAppNav — the "Apps" model for the floating dock navigation, plus the
// Earnest-style appearance prefs (named color palettes, label visibility,
// dock position, glass chrome). The prefs belong to the USER
// (`directus_users.app_prefs`, core/shared/nav/app-prefs.ts) so they follow
// them across devices; localStorage is the SSR-safe cache that paints the
// right dock on the first frame, until the account copy arrives and wins.
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
  /** For a hub gated on a list of modules: those module keys. Informational. */
  children?: string[];
}

import { NAV_LAYOUTS, isHub, navEntry, type NavEntry } from "#core/shared/nav/registry";

export const DOCK_PALETTE_IDS = ["fresh", "aurora", "neutral", "vivid"] as const;
export type PaletteId = (typeof DOCK_PALETTE_IDS)[number];
export type DockPosition = "bottom" | "top";

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
  payment: ["payments", "pay"],
  membership: ["people"],
  request: ["requests", "my-requests"],
};

export function badgeCountsFor(
  notifications: readonly { readonly type?: string | null; readonly isRead?: boolean }[] | null | undefined,
  // Unread channel messages. Channels are deliberately off the dock (they open
  // as a slide-over from the top nav), but they live UNDER Communications, so
  // their unread rolls into that section's badge — otherwise the one surface
  // that counts unread messages is the one place the dock stays silent about.
  // Passed in rather than read here so this stays a pure mapping function.
  channelUnread = 0,
  // Emails of this org mid-send (the send queue, Phase 3b): Communications
  // shows them until they finish, so a send running in the background is
  // visible from anywhere.
  sendingEmails = 0
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const n of notifications || []) {
    if (n.isRead) continue;
    for (const key of NOTIF_BADGE_KEYS[n.type ?? ""] ?? []) {
      counts[key] = (counts[key] || 0) + 1;
    }
  }
  const channels = Math.max(0, Math.floor(Number(channelUnread) || 0));
  if (channels) counts.comms = (counts.comms || 0) + channels;
  const sending = Math.max(0, Math.floor(Number(sendingEmails) || 0));
  if (sending) counts.comms = (counts.comms || 0) + sending;
  return counts;
}

// The dock's apps come from the nav registry (core/shared/nav/registry.ts), the
// only source of nav entries; see docs/spec-capability-nav.md. An AppDef is the
// dock's view of one entry. These derived lists keep the shape the page
// transitions and Breadcrumbs read: the admin sections in dock order, the
// member apps, and the manager's areas.
export function toAppDef(e: NavEntry): AppDef {
  const modules = e.needs.flatMap((n) => ("module" in n && typeof n.module !== "string" ? [...n.module] : []));
  return {
    key: e.id,
    label: e.label,
    shortName: e.shortName,
    icon: e.icon,
    path: e.path,
    match: [...(e.match ?? (e.path === "/" ? ["__root__"] : [e.path.split("?")[0]]))],
    ...(modules.length ? { children: modules } : {}),
  };
}

const layoutApps = (ids: readonly string[]): AppDef[] =>
  ids.flatMap((id) => {
    const e = navEntry(id);
    return e ? [toAppDef(e)] : [];
  });

/** The admin dock's sections, in dock order (the queue aside: it is the hat's). */
export const ADMIN_APPS: readonly AppDef[] = layoutApps(NAV_LAYOUTS.admin.filter((id) => id !== "queue"));
/** The member dock's apps (Money is a hub, so it lives with the admin sections). */
export const MEMBER_APPS: readonly AppDef[] = layoutApps(NAV_LAYOUTS.member.filter((id) => !isHub(id)));
/** The manager dock: the queue and one slot per area. */
export const MANAGER_APPS: readonly AppDef[] = layoutApps(NAV_LAYOUTS.manager);

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

// Cache a value on this device. The account copy is the source of truth; this
// is what the next cold load paints before it arrives.
function cachePrefs() {
  if (!import.meta.client) return;
  localStorage.setItem(PALETTE_KEY, palette.value);
  localStorage.setItem(POSITION_KEY, dockPosition.value);
  localStorage.setItem(LABELS_KEY, showLabels.value ? "1" : "0");
  localStorage.setItem(GLASS_KEY, glassChrome.value ? "1" : "0");
}

// The dock knobs are this device's only (app_prefs now holds the tint).
function pushUserPrefs() {}

export function useAppNav() {
  const route = useRoute();
  const { buildOrgPath, navigateToOrg } = useOrgNavigation();
  loadPrefs();

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
  // Each writes the cache now and the account copy shortly after.
  const setPalette = (p: PaletteId) => {
    palette.value = p;
    cachePrefs();
    pushUserPrefs();
  };
  const setPosition = (pos: DockPosition) => {
    dockPosition.value = pos;
    cachePrefs();
    pushUserPrefs();
  };
  const setShowLabels = (v: boolean) => {
    showLabels.value = v;
    cachePrefs();
    pushUserPrefs();
  };
  const setGlassChrome = (v: boolean) => {
    glassChrome.value = v;
    cachePrefs();
    pushUserPrefs();
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
