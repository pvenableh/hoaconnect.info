// useAppVersion — Earnest-style "a new version is available" detection.
//
// The client bundle bakes the build identity it was compiled with
// (runtimeConfig.public.buildId). This composable periodically asks the live server
// what build it's running (GET /api/version); when the live id differs from the baked
// id, a newer deployment has shipped and `updateAvailable` flips true so the UI can
// offer a refresh.
//
// Singleton state (module-level) so every consumer shares one poller and one flag —
// mounting <AppUpdatePrompt> doesn't spin up a second interval.
//
// Polls: on an interval, AND opportunistically when the tab regains focus/visibility
// (a backgrounded tab is the classic stale-version case). Disabled during SSR and in
// dev (where buildId is a stable boot stamp and HMR already handles reloads).

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 min — quiet background cadence
const MIN_FOCUS_RECHECK_MS = 30 * 1000; // throttle focus-driven rechecks

const updateAvailable = ref(false);
const liveBuildId = ref<string | null>(null);
let started = false;
let timer: ReturnType<typeof setInterval> | null = null;
let lastCheck = 0;

export function useAppVersion() {
  const config = useRuntimeConfig();
  const bakedBuildId = config.public.buildId;
  const version = config.public.appVersion;

  async function check() {
    // Once we know an update is waiting, stop hammering — the flag is sticky until reload.
    if (updateAvailable.value) return;
    lastCheck = Date.now();
    try {
      const res = await $fetch<{ buildId?: string; version?: string }>("/api/version", {
        // Defeat any intermediate cache; the endpoint is no-store but be belt-and-braces.
        query: { t: Date.now() },
      });
      liveBuildId.value = res?.buildId ?? null;
      if (res?.buildId && bakedBuildId && res.buildId !== bakedBuildId) {
        updateAvailable.value = true;
        stop();
      }
    } catch {
      // Network blip / offline — ignore and retry on the next tick.
    }
  }

  function onVisible() {
    if (document.visibilityState !== "visible") return;
    if (Date.now() - lastCheck < MIN_FOCUS_RECHECK_MS) return;
    check();
  }

  function start() {
    if (started || !import.meta.client) return;
    // No meaningful detection in dev: buildId is a stable per-boot stamp, and HMR owns reloads.
    if (import.meta.dev) {
      // Dev-only escape hatch for designing/QA-ing the update banner without a real
      // deploy: visit any page with ?forceUpdatePrompt. Stripped from prod by the guard.
      if (window.location.search.includes("forceUpdatePrompt")) updateAvailable.value = true;
      return;
    }
    started = true;
    timer = setInterval(check, POLL_INTERVAL_MS);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
    if (import.meta.client) {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    }
  }

  function reloadForUpdate() {
    if (import.meta.client) window.location.reload();
  }

  return {
    updateAvailable: readonly(updateAvailable),
    liveBuildId: readonly(liveBuildId),
    bakedBuildId,
    version,
    start,
    check,
    reloadForUpdate,
  };
}
