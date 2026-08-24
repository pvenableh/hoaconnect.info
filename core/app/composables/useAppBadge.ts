/**
 * useAppBadge — keep the number on the installed app icon honest.
 *
 * Two halves have to agree, and until now only one existed. The service worker
 * (`core/public/sw.js`) raises the badge when a push lands with no page open; it
 * counts blind, because it cannot see what the member has already read, and it
 * persists that guess in a cache entry so it survives a restart. An open page
 * CAN see the real unread count — so whenever one is open it is the authority
 * and overwrites the worker's guess.
 *
 * That correction is the whole reason this exists. Before Phase 2c the app had
 * no counterpart to the worker's `bumpBadge`, so a member who read three
 * notifications on their laptop still saw "3" on their phone's home screen until
 * the next push happened to carry an authoritative count.
 *
 * We write twice on purpose:
 *
 *   1. From this window — instant, and it works even before the worker has
 *      claimed this client (the very first load after registration).
 *   2. Via postMessage to the worker — so its PERSISTED counter is corrected
 *      too. Skipping this would leave it to resume bumping from a stale number
 *      the next time a push arrives, which is the bug in slow motion.
 *
 * A progressive enhancement everywhere, never a dependency: the Badging API is
 * absent on most desktop browsers and every call here no-ops when it is.
 */

export function useAppBadge() {
  type BadgeNavigator = Navigator & {
    setAppBadge?: (n?: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  };

  const supported = () =>
    import.meta.client && typeof (navigator as BadgeNavigator).setAppBadge === "function";

  /** Apply the count to this window's OS badge. */
  function applyLocally(count: number) {
    const nav = navigator as BadgeNavigator;
    if (typeof nav.setAppBadge !== "function") return;
    if (count > 0) nav.setAppBadge(count).catch(() => {});
    else nav.clearAppBadge?.().catch(() => {});
  }

  /** Tell the worker the true count so its persisted counter stops drifting. */
  async function applyInWorker(count: number) {
    if (!import.meta.client || !("serviceWorker" in navigator)) return;
    try {
      // `ready` rather than `controller`: on the first load after registration
      // the worker is active but has not yet claimed this client, so
      // `controller` is still null and the message would go nowhere.
      const reg = await navigator.serviceWorker.ready;
      reg.active?.postMessage({ type: "badge", count });
    } catch {
      // Worker unavailable (private mode, unsupported) — the local badge above
      // already covers this session.
    }
  }

  /**
   * Set the badge to an absolute unread count. Safe to call on every change:
   * cheap, idempotent, and absolute rather than relative by design — a delta
   * would drift the moment one write was dropped.
   */
  function setBadge(count: number) {
    if (!import.meta.client) return;
    const n = Math.max(0, Math.floor(Number(count) || 0));
    applyLocally(n);
    void applyInWorker(n);
  }

  /**
   * Mirror the bell's unread count onto the icon for as long as this scope
   * lives. Call once, high up (the authenticated layout) — not per component,
   * which would just write the same number several times per change.
   */
  function trackUnread() {
    if (!import.meta.client) return;
    const { unreadCount } = useDirectusNotifications();
    watch(unreadCount, (n) => setBadge(n), { immediate: true });
  }

  return { setBadge, trackUnread, supported };
}
