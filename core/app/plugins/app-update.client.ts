/**
 * Keep long-lived clients on the latest deploy.
 *
 * Detection runs on three independent signals (see useAppVersion for why), and
 * what we DO about it is one rule, stated once in
 * #core/shared/app/update-policy: hidden and clean → reload silently; hidden but
 * a form is dirty → defer; visible → ask.
 *
 * A chunk 404 is the one case with no choice — handled by
 * `emitRouteChunkError: 'automatic-immediate'` in nuxt.config, because by the
 * time we could ask, the app is already broken.
 *
 * Lives in a plugin rather than in <AppUpdatePrompt> so detection runs for the
 * whole session: a backgrounded PWA has to be able to update itself on a screen
 * where the banner was never mounted.
 */
import { decideUpdateAction } from "#core/shared/app/update-policy";

/** How long backgrounded before a resume is worth a freshness check. Short
 *  enough to catch "reopen from the Home Screen", long enough that an
 *  app-switcher glance doesn't cost a round-trip. */
const RESUME_THRESHOLD_MS = 60_000;
/** How often a VISIBLE, idle client re-checks. Nuxt only checks around
 *  navigations, so a page left open and untouched would otherwise never learn. */
const VISIBLE_POLL_MS = 5 * 60_000;

export default defineNuxtPlugin((nuxtApp) => {
  // Dev builds get a per-boot buildId and HMR owns reloading, so detection here
  // is noise. The escape hatch keeps the banner designable without a deploy.
  if (import.meta.dev) {
    if (window.location.search.includes("forceUpdatePrompt")) {
      useAppVersion().markUpdateAvailable("dev-forced");
    }
    return;
  }

  const { updateAvailable, bakedBuildId, markUpdateAvailable, applyUpdate } = useAppVersion();
  const { hasUnsavedWork } = useUnsavedWork();
  if (!bakedBuildId) return;

  let hiddenAt = 0;
  let checking = false;
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  function act() {
    const action = decideUpdateAction({
      visible: document.visibilityState === "visible",
      dirty: hasUnsavedWork(),
    });
    // "prompt" and "defer" are both no-ops here: the sticky `updateAvailable`
    // flag is what <AppUpdatePrompt> renders, and a deferred update retries on
    // the next clean background.
    if (action === "reload") applyUpdate();
  }

  function onUpdateFound(live?: string | null) {
    if (updateAvailable.value) return;
    markUpdateAvailable(live);
    stopPoll(); // The flag is sticky; no reason to keep asking.
    act();
  }

  /** Signal 2: explicit re-check against the live server. */
  async function checkLatest() {
    if (updateAvailable.value || checking) return;
    checking = true;
    try {
      const res = await $fetch<{ buildId?: string }>("/api/version", {
        // The endpoint is no-store, but belt and braces: this is precisely the
        // response that must never come from a cache.
        query: { t: Date.now() },
        headers: { "cache-control": "no-cache" },
      });
      if (res?.buildId && res.buildId !== bakedBuildId) onUpdateFound(res.buildId);
    } catch {
      /* offline or a blip — retry on the next tick */
    } finally {
      checking = false;
    }
  }

  function startPoll() {
    if (pollTimer) return;
    pollTimer = setInterval(checkLatest, VISIBLE_POLL_MS);
  }
  function stopPoll() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
  }

  // Signal 1: Nuxt's own build-manifest check, around navigations.
  nuxtApp.hook("app:manifest:update", () => onUpdateFound());

  // Signal 3: every same-origin response tells us the server's build. Cross-
  // origin responses (Directus, fonts) hide the header behind CORS; we skip them.
  if (typeof window.fetch === "function") {
    const nativeFetch = window.fetch.bind(window);
    window.fetch = async (...args: Parameters<typeof fetch>) => {
      const res = await nativeFetch(...args);
      try {
        const served = res.headers.get("x-app-build");
        if (served && served !== bakedBuildId) onUpdateFound(served);
      } catch {
        /* opaque response — header not readable */
      }
      return res;
    };
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      hiddenAt = Date.now();
      stopPoll();
      // They walked away with the banner up (or never saw it) — take the update
      // now rather than making them tap anything when they return.
      if (updateAvailable.value) act();
      return;
    }
    startPoll();
    if (Date.now() - hiddenAt > RESUME_THRESHOLD_MS) checkLatest();
  });

  if (document.visibilityState === "visible") startPoll();
});
