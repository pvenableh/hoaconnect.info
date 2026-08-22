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

import {
  getAdminAccent,
  accentCssVars,
  type AdminAccent,
} from "#core/shared/branding/accent";

export type AppearanceMode = "light" | "dark" | "system";
export type ResolvedAppearance = "light" | "dark";

/** The class that marks a surface as the workspace theme. */
export const APP_THEME_CLASS = "theme-app";

const STORAGE_KEY = "appearance";
/** Pre-consolidation key; read once so existing users keep their preference. */
const LEGACY_STORAGE_KEY = "design-theme";

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
});

export function useAppearance() {
  const { user } = useDirectusAuth();
  const { updateProfile } = useDirectusUser();

  const mode = computed(() => state.mode);
  const resolved = computed<ResolvedAppearance>(() =>
    state.mode === "system" ? (state.systemDark ? "dark" : "light") : state.mode,
  );
  const isDark = computed(() => resolved.value === "dark");

  /** The accent for this workspace. Today: always the brand. See accent.ts. */
  const accent = computed<AdminAccent>(() => getAdminAccent());

  /**
   * Write the resolved appearance to the document. This is the ONLY place the
   * `dark` class is set for workspace surfaces.
   */
  function apply() {
    if (!import.meta.client) return;
    const html = document.documentElement;
    html.classList.toggle("dark", resolved.value === "dark");

    // Both accent tiers. CSS carries matching resting defaults so the first
    // paint is already right; this keeps them correct if the resolver ever
    // starts returning a per-organization colour.
    const dark = resolved.value === "dark";
    const vars = accentCssVars(
      dark ? accent.value.dark : accent.value.light,
      dark ? accent.value.ink.dark : accent.value.ink.light,
    );
    for (const [k, v] of Object.entries(vars)) html.style.setProperty(k, v);
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

    state.hydrated = true;
    apply();
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
    accent,
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

  return appearance;
}
