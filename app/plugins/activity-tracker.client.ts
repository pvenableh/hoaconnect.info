// Wires the portal activity tracker: a session_start the first time tracking
// becomes enabled this browser session, a page_view on every route change, and
// a sendBeacon flush when the tab is hidden/closed so queued events aren't lost.
// All gating (logged in · org selected · not previewing-as-member) lives in
// useActivityTracker; this plugin just drives it.

export default defineNuxtPlugin(() => {
  const router = useRouter();
  const { enabled, trackPageView, trackSessionStart, flush } = useActivityTracker();

  // Fire session_start once per browser session, when tracking first turns on
  // (org + auth resolve slightly after cold load).
  watch(
    enabled,
    (on) => {
      if (!on) return;
      try {
        const key = "hoa_activity_session_started";
        if (!sessionStorage.getItem(key)) {
          trackSessionStart();
          sessionStorage.setItem(key, "1");
        }
      } catch {
        /* sessionStorage unavailable — skip the once-guard */
      }
    },
    { immediate: true }
  );

  router.afterEach((to) => {
    trackPageView(to.fullPath);
  });

  const flushBeacon = () => void flush(true);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushBeacon();
  });
  window.addEventListener("pagehide", flushBeacon);
});
