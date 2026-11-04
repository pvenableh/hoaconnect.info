/**
 * The service worker, app-wide (Phase 6).
 *
 * Registration used to happen only inside usePush, i.e. after someone opened the
 * account page and opted in — so a device whose registration was lost (a
 * reinstall, cleared site data) stopped receiving push until they went back and
 * toggled it. It now happens once, early, on every route. Subscribing to push
 * is still opt-in (usePush); this only makes sure a registration EXISTS.
 *
 *  - `updateViaCache: 'none'` — never take sw.js from the HTTP cache. It is the
 *    one file whose staleness we can't recover from. (nuxt.config also sends it
 *    no-cache.)
 *  - `update()` whenever the app returns to the foreground: an installed PWA is
 *    never "reloaded" the way a tab is, so this is its only freshness check.
 *  - The worker has no fetch handler and caches nothing — see public/sw.js.
 *
 * Also: a notification tapped while the app is open asks the page to navigate
 * (`push-navigate`) instead of reloading it, and the browser's install prompt
 * is captured here because it fires before any card has mounted.
 */
import { captureInstallPrompt, markInstalled } from "../composables/useInstallPrompt";

export default defineNuxtPlugin(() => {
  if (!import.meta.client) return;

  window.addEventListener("beforeinstallprompt", captureInstallPrompt);
  window.addEventListener("appinstalled", markInstalled);

  if (!("serviceWorker" in navigator)) return;

  const register = () => {
    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .catch((err) => console.warn("[pwa] service worker registration failed", err));
  };
  // Hydration usually runs after `load`, in which case the event never fires
  // again; otherwise wait so registration doesn't contend with first paint.
  if (document.readyState === "complete") register();
  else window.addEventListener("load", register, { once: true });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    navigator.serviceWorker.getRegistration().then((reg) => reg?.update().catch(() => {}));
  });

  navigator.serviceWorker.addEventListener("message", (event) => {
    const msg = event.data as { type?: string; url?: string } | null;
    if (msg?.type !== "push-navigate" || typeof msg.url !== "string") return;
    try {
      const target = new URL(msg.url, window.location.origin);
      if (target.origin === window.location.origin) {
        void navigateTo(`${target.pathname}${target.search}${target.hash}`);
      } else {
        window.location.assign(target.href);
      }
    } catch {
      /* a malformed url from the worker — stay where we are */
    }
  });
});
