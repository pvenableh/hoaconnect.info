// The workspace's light/dark state — one owner, one key, one writer.
//
// Before this, "is the app in dark mode?" was answered in five places: a
// reactive in useTheme, a `design-theme` localStorage blob, two Directus user
// fields, and an html class that BOTH useHead (in the layout) and a direct
// classList write (in useTheme.applyTheme) claimed. The two writers fought, and
// the resulting stale-class bug is documented at length in useOrgBranding.ts.
//
// The split now is by surface, and it is clean:
// - The WORKSPACE (admin + auth) is `theme-app` and uses this composable. The
//   `theme-app` class is static, so the layout can pin it via useHead; only the
//   `dark` class varies, and only this composable writes it.
// - The PUBLIC landing pages keep useTheme()/forceThemeStyle(), because there the
//   theme genuinely varies per organization and per page.
//
// `mode` may be 'system'; `resolved` is what actually gets rendered. Everything
// downstream — CSS, the accent, persistence — reads `resolved`.
//
// THE TINT (Phase 4; plan §2.4, decisions 4 and 8) lives here too, because it
// is appearance and because this is already the one writer of the accent. A
// person's choice ({ on, swatch }, core/shared/nav/app-prefs.ts) plus the mode
// plus the community's colour go through `resolveTint` (accent.ts, the one
// place a colour is resolved) and come out as the --app-accent-* glass tier,
// the ink tier, `data-tint` on <html> and `--glass-solid` (the tinted glass as
// a solid ground, for Reduce Transparency). The choice is stored with the
// person's app prefs (`/api/user/app-prefs`), so it follows them to another
// device; localStorage caches it for the first frame.
//
// THE DOCK'S APP NAMES (Session 18) live beside the tint, owned the same way:
// off by default, `{ dock: { names: true } }` in the app prefs when a person
// turns them on, cached on the device first and replaced by the account copy.
// So does whether the attention line is open (What needs you on the dashboard,
// Worth a look on the hubs; Session 18): `attentionOpen(surface)`.

import {
  accentCssVars,
  resolveTint,
  type ResolvedTint,
  type TintSwatchId,
} from "#core/shared/branding/accent";
import {
  DEFAULT_ATTENTION_OPEN,
  DEFAULT_DOCK_NAMES,
  type AttentionPrefs,
  type DockPrefs,
  type TintPrefs,
} from "#core/shared/nav/app-prefs";

export type AppearanceMode = "light" | "dark" | "system";
export type ResolvedAppearance = "light" | "dark";

/** The class that marks a surface as the workspace theme. */
export const APP_THEME_CLASS = "theme-app";

const STORAGE_KEY = "appearance";
/** Pre-consolidation key; read once so existing users keep their preference. */
const LEGACY_STORAGE_KEY = "design-theme";
/** This device's cache of the person's tint ({ on?, swatch? }). */
const TINT_STORAGE_KEY = "app-tint";
/** This device's cache of the person's dock prefs ({ names? }). */
const DOCK_STORAGE_KEY = "app-dock";
/** This device's cache of where the attention line is open ({ home?, hubs? }). */
const ATTENTION_STORAGE_KEY = "app-attention";
/** The six dock knobs' old cache keys: removed on first load (Phase 4). */
const RETIRED_KEYS = ["app-nav-palette", "app-nav-position", "app-nav-labels", "app-nav-glass"];

function isMode(v: unknown): v is AppearanceMode {
  return v === "light" || v === "dark" || v === "system";
}

/** Read the stored preference, migrating the legacy blob on first run. */
function readStoredMode(): AppearanceMode {
  if (!import.meta.client) return "system";

  const direct = localStorage.getItem(STORAGE_KEY);
  if (isMode(direct)) return direct;

  try {
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacy) {
      const parsed = JSON.parse(legacy) as { mode?: unknown };
      // The legacy blob only ever stored an explicit light/dark, never 'system'.
      if (parsed.mode === "dark" || parsed.mode === "light") return parsed.mode;
    }
  } catch {
    // Unparseable legacy value — fall through to the default.
  }
  return "system";
}

function systemPrefersDark(): boolean {
  if (!import.meta.client || !window.matchMedia) return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

// Module-level so every caller shares one state object, the same way useTheme
// does. `system` is the honest default: we do not know the user's preference
// until the client tells us.
const state = reactive({
  mode: "system" as AppearanceMode,
  systemDark: false,
  hydrated: false,
  tint: {} as TintPrefs,
  dock: {} as DockPrefs,
  attention: {} as AttentionPrefs,
});

function readStoredTint(): TintPrefs {
  if (!import.meta.client) return {};
  try {
    for (const k of RETIRED_KEYS) localStorage.removeItem(k);
    const raw = JSON.parse(localStorage.getItem(TINT_STORAGE_KEY) || "null") as TintPrefs | null;
    return raw && typeof raw === "object" ? raw : {};
  } catch {
    return {};
  }
}

function readStoredDock(): DockPrefs {
  if (!import.meta.client) return {};
  try {
    const raw = JSON.parse(localStorage.getItem(DOCK_STORAGE_KEY) || "null") as DockPrefs | null;
    return raw && typeof raw === "object" && typeof raw.names === "boolean" ? { names: raw.names } : {};
  } catch {
    return {};
  }
}

function cacheDock() {
  if (!import.meta.client) return;
  try {
    localStorage.setItem(DOCK_STORAGE_KEY, JSON.stringify(state.dock));
  } catch {
    // Storage full or blocked: the account copy still holds it.
  }
}

function readStoredAttention(): AttentionPrefs {
  if (!import.meta.client) return {};
  try {
    const raw = JSON.parse(localStorage.getItem(ATTENTION_STORAGE_KEY) || "null") as AttentionPrefs | null;
    if (!raw || typeof raw !== "object") return {};
    const out: AttentionPrefs = {};
    if (typeof raw.home === "boolean") out.home = raw.home;
    if (typeof raw.hubs === "boolean") out.hubs = raw.hubs;
    return out;
  } catch {
    return {};
  }
}

function cacheAttention() {
  if (!import.meta.client) return;
  try {
    localStorage.setItem(ATTENTION_STORAGE_KEY, JSON.stringify(state.attention));
  } catch {
    // Storage full or blocked: the account copy still holds it.
  }
}

function cacheTint() {
  if (!import.meta.client) return;
  try {
    localStorage.setItem(TINT_STORAGE_KEY, JSON.stringify(state.tint));
  } catch {
    // Storage full or blocked: the account copy still holds it.
  }
}

// ── The account copy of the tint and the dock ────────────────────────────
// Pulled once per signed-in user per page load; a stored key overrides the
// cache. Pushed on every change, debounced. Both best-effort: an unprovisioned
// field answers `available: false` / 503 and the cache stands.
let pulledFor: string | null = null;
let pushTimer: ReturnType<typeof setTimeout> | null = null;
// A choice made while the pull is in flight is newer than what it brings back.
let localEdits = 0;

async function pullTint(userId: string, onArrive: () => void) {
  if (pulledFor === userId) return;
  pulledFor = userId;
  const editsBefore = localEdits;
  try {
    const res = await $fetch<{ available: boolean; prefs: { tint?: TintPrefs; dock?: DockPrefs; attention?: AttentionPrefs } }>(
      "/api/user/app-prefs",
    );
    if (!res?.available || localEdits !== editsBefore) return;
    state.tint = { ...(res.prefs?.tint ?? {}) };
    state.dock = { ...(res.prefs?.dock ?? {}) };
    state.attention = { ...(res.prefs?.attention ?? {}) };
    cacheTint();
    cacheDock();
    cacheAttention();
    onArrive();
  } catch {
    // Signed out, offline, or the route is unavailable: the cache stands.
  }
}

function pushTint() {
  localEdits++;
  cacheTint();
  if (!import.meta.client || !pulledFor) return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    // The whole choice, defaults included: the route drops what is a default.
    const tint = { on: state.tint.on ?? true, swatch: state.tint.swatch ?? "community" };
    $fetch("/api/user/app-prefs", { method: "PATCH", body: { tint } }).catch(() => {});
  }, 400);
}

let dockTimer: ReturnType<typeof setTimeout> | null = null;
function pushDock() {
  localEdits++;
  cacheDock();
  if (!import.meta.client || !pulledFor) return;
  if (dockTimer) clearTimeout(dockTimer);
  dockTimer = setTimeout(() => {
    dockTimer = null;
    // The route drops the default (names off), so turning names off clears the key.
    const dock = { names: state.dock.names ?? DEFAULT_DOCK_NAMES };
    $fetch("/api/user/app-prefs", { method: "PATCH", body: { dock } }).catch(() => {});
  }, 400);
}

let attentionTimer: ReturnType<typeof setTimeout> | null = null;
function pushAttention() {
  localEdits++;
  cacheAttention();
  if (!import.meta.client || !pulledFor) return;
  if (attentionTimer) clearTimeout(attentionTimer);
  attentionTimer = setTimeout(() => {
    attentionTimer = null;
    // Both surfaces, defaults included: the route drops what is a default.
    const attention = { ...DEFAULT_ATTENTION_OPEN, ...state.attention };
    $fetch("/api/user/app-prefs", { method: "PATCH", body: { attention } }).catch(() => {});
  }, 400);
}

export function useAppearance() {
  const { user } = useDirectusAuth();
  const { updateProfile } = useDirectusUser();
  const { activeHoa } = useActiveHoa();

  const mode = computed(() => state.mode);
  const resolved = computed<ResolvedAppearance>(() =>
    state.mode === "system" ? (state.systemDark ? "dark" : "light") : state.mode,
  );
  const isDark = computed(() => resolved.value === "dark");

  /** The community's own colour: the first swatch, and the ink when Tint is off. */
  const communityColor = computed<string | null>(() => {
    const colors = (activeHoa.value as { settings?: { colors?: { primary?: string }[] | null } } | null)?.settings
      ?.colors;
    return (Array.isArray(colors) && colors[0]?.primary) || null;
  });

  /** What this person's tint paints in the mode on screen. */
  const tint = computed<ResolvedTint>(() => resolveTint(state.tint, resolved.value, communityColor.value));
  const tintOn = computed(() => tint.value.on);
  /** The chosen swatch (the community's when none is stored). Kept while Tint is off. */
  const tintSwatch = computed<TintSwatchId>(() => state.tint.swatch ?? "community");
  /** The dock names its apps under their icons. Off by default. */
  const dockNames = computed(() => state.dock.names ?? DEFAULT_DOCK_NAMES);
  /** Is the attention line open on this surface (dashboard or hubs)? */
  const attentionOpen = (surface: keyof AttentionPrefs) =>
    computed(() => state.attention[surface] ?? DEFAULT_ATTENTION_OPEN[surface]);

  /**
   * Write the resolved appearance to the document. This is the ONLY place the
   * `dark` class is set for workspace surfaces.
   */
  function apply() {
    if (!import.meta.client) return;
    const html = document.documentElement;
    html.classList.toggle("dark", resolved.value === "dark");

    // Both accent tiers and the hover, from the person's tint. CSS carries
    // HOA Connect cyan as the resting default for the first paint.
    const t = tint.value;
    const vars = accentCssVars(t.glass, t.ink, t.inkHover);
    for (const [k, v] of Object.entries(vars)) html.style.setProperty(k, v);
    html.dataset.tint = t.on ? "on" : "off";
    if (t.ground) html.style.setProperty("--glass-solid", t.ground);
    else html.style.removeProperty("--glass-solid");
  }

  /**
   * Load the preference (profile beats localStorage) and apply it. Safe to call
   * from several layouts — it is idempotent.
   */
  function hydrate() {
    if (!import.meta.client) return;

    state.systemDark = systemPrefersDark();

    const profile = user.value as
      | (typeof user.value & { appearance?: unknown })
      | null;
    if (isMode(profile?.appearance)) {
      state.mode = profile.appearance;
    } else if (!state.hydrated) {
      state.mode = readStoredMode();
    }

    if (!state.hydrated) {
      state.tint = readStoredTint();
      state.dock = readStoredDock();
      state.attention = readStoredAttention();
    }
    state.hydrated = true;
    apply();

    const userId = (user.value as { id?: string } | null)?.id;
    if (userId) void pullTint(userId, apply);
  }

  function setTintOn(on: boolean) {
    state.tint = { ...state.tint, on };
    apply();
    pushTint();
  }

  function setDockNames(names: boolean) {
    state.dock = { ...state.dock, names };
    pushDock();
  }

  function setAttentionOpen(surface: keyof AttentionPrefs, open: boolean) {
    state.attention = { ...state.attention, [surface]: open };
    pushAttention();
  }

  function setTintSwatch(swatch: TintSwatchId) {
    state.tint = { ...state.tint, swatch };
    apply();
    pushTint();
  }

  async function setMode(next: AppearanceMode, persist = true) {
    state.mode = next;
    if (import.meta.client) localStorage.setItem(STORAGE_KEY, next);
    apply();

    if (persist && user.value) {
      try {
        // `appearance` is this composable's field and nothing else writes it.
        // useTheme() persists `theme_light` — the PUBLIC landing style, a
        // separate and still-live preference — and the two no longer overlap.
        await updateProfile({ appearance: next });
      } catch (e) {
        console.warn("[appearance] failed to persist preference:", e);
      }
    }
  }

  /** Flip between light and dark, resolving 'system' to its opposite first. */
  function toggle() {
    return setMode(resolved.value === "dark" ? "light" : "dark");
  }

  /** Track the OS preference while the user is on 'system'. */
  function watchSystem(): () => void {
    if (!import.meta.client || !window.matchMedia) return () => {};
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) => {
      state.systemDark = e.matches;
      if (state.mode === "system") apply();
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }

  return {
    mode,
    resolved,
    isDark,
    tint,
    tintOn,
    tintSwatch,
    communityColor,
    setTintOn,
    setTintSwatch,
    dockNames,
    setDockNames,
    attentionOpen,
    setAttentionOpen,
    setMode,
    toggle,
    hydrate,
    apply,
    watchSystem,
    APP_THEME_CLASS,
  };
}

/**
 * Applies the workspace appearance before the first paint.
 *
 * SSR cannot know a user's stored preference, so without this a dark-mode user
 * gets a white flash on every cold load. This runs in the document head, before
 * the body renders, and only on pages whose layout asks for it — which is why
 * this is a layout-scoped snippet rather than a global plugin: the public
 * landing pages force their own theme per organization, and a `dark` class
 * applied to them from the workspace's preference would be simply wrong.
 *
 * Kept deliberately tiny and dependency-free; it is inlined into the HTML.
 */
export const APPEARANCE_PREPAINT_SCRIPT = `(function(){try{
var m=localStorage.getItem('${STORAGE_KEY}');
if(m!=='light'&&m!=='dark'&&m!=='system'){
  try{var l=JSON.parse(localStorage.getItem('${LEGACY_STORAGE_KEY}')||'null');m=(l&&(l.mode==='dark'||l.mode==='light'))?l.mode:'system';}catch(e){m='system';}
}
var d=m==='dark'||(m==='system'&&window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches);
document.documentElement.classList.toggle('dark',d);
try{var t=JSON.parse(localStorage.getItem('${TINT_STORAGE_KEY}')||'null');document.documentElement.dataset.tint=(t&&t.on===false)?'off':'on';}catch(e){}
}catch(e){}})();`;

/**
 * Everything a workspace layout needs: pin the theme class, kill the flash, load
 * the preference, and follow the OS while the user is on 'system'.
 *
 * Call this from `auth`, `auth-blank` and `channels` — the layouts that make up
 * the workspace. It is the workspace's half of the surface split described at
 * the top of this file.
 */
export function useWorkspaceAppearance() {
  const appearance = useAppearance();

  // `theme-app` never varies, so it can be server-rendered. Only the `dark`
  // class is user-specific, and the prepaint script handles that.
  useHead({
    htmlAttrs: { class: APP_THEME_CLASS },
    script: [{ innerHTML: APPEARANCE_PREPAINT_SCRIPT, tagPosition: "head" }],
  });

  onMounted(() => {
    appearance.hydrate();
    const stop = appearance.watchSystem();
    onUnmounted(stop);
  });
  // A different community (its colour is the first swatch) or the account copy
  // arriving repaints; so does a signed-in user appearing after mount.
  watch(appearance.tint, () => appearance.apply());
  const { user } = useDirectusAuth();
  watch(
    () => (user.value as { id?: string } | null)?.id,
    (id) => {
      if (id) appearance.hydrate();
    },
  );

  return appearance;
}
