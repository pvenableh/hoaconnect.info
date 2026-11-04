/**
 * Standalone-mode link trap (Phase 6).
 *
 * Installed to the iPhone Home Screen, a plain `<a href>` tap can open mobile
 * Safari and drop the member out of the app (NuxtLink and router navigation
 * stay in-app; raw anchors — HTML inside announcements and documents, embeds —
 * don't). In standalone mode this re-issues same-origin anchor taps through
 * `location.assign`, which iOS keeps in-app. External links and
 * `target="_blank"` are left alone.
 *
 * Also tags `<html data-standalone>` so CSS can opt into installed-app tweaks.
 */
export default defineNuxtPlugin(() => {
  if (!import.meta.client) return;

  const standalone =
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (!standalone) return;

  document.documentElement.dataset.standalone = "true";

  function shouldTrap(anchor: HTMLAnchorElement, event: MouseEvent): boolean {
    if (event.defaultPrevented) return false;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
    if (event.button !== 0) return false;
    const target = anchor.getAttribute("target");
    if (target && target !== "_self") return false;
    if (anchor.hasAttribute("download")) return false;
    const href = anchor.getAttribute("href");
    if (!href || href.startsWith("#") || /^(mailto|tel|sms):/.test(href)) return false;
    try {
      return new URL(anchor.href, window.location.href).origin === window.location.origin;
    } catch {
      return false;
    }
  }

  document.addEventListener(
    "click",
    (event) => {
      const anchor = event
        .composedPath()
        .find((n): n is HTMLAnchorElement => n instanceof HTMLAnchorElement && n.hasAttribute("href"));
      if (!anchor || !shouldTrap(anchor, event)) return;
      event.preventDefault();
      window.location.assign(anchor.href);
    },
    // BUBBLE phase, on purpose: RouterLink's own handler runs first and calls
    // preventDefault, so `shouldTrap` sees `defaultPrevented` and leaves router
    // navigation alone. In the capture phase this would turn every NuxtLink tap
    // into a full page load.
    false,
  );
});
