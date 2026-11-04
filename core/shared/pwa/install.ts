/**
 * Which install affordance, if any, this device gets (Phase 6) — pure.
 *
 *   installed → already running from the Home Screen / as an app: no card
 *   prompt    → the browser handed us `beforeinstallprompt` (Android Chrome,
 *               desktop Chrome/Edge): one button installs
 *   ios       → Safari on iPhone/iPad, not standalone: no prompt API exists, so
 *               the card shows Share → Add to Home Screen
 *   none      → nothing to offer (other browsers, or Chromium before it has
 *               decided the app is installable)
 *
 * `dismissed` is separate: the member can close the card, and it stays closed
 * for THIS build only — a deploy (new `buildId`) is a fair moment to ask again.
 */
export type InstallMode = "installed" | "prompt" | "ios" | "none";

export interface InstallEnv {
  userAgent: string;
  maxTouchPoints?: number;
  /** `(display-mode: standalone)` or the legacy `navigator.standalone`. */
  standalone: boolean;
  /** A `beforeinstallprompt` event has been captured and not yet used. */
  hasDeferredPrompt: boolean;
}

/** iPhone/iPod/iPad — plus iPadOS 13+, which reports a Mac user agent. */
export function isIosDevice(userAgent: string, maxTouchPoints = 0): boolean {
  return /iP(hone|od|ad)/.test(userAgent) || (maxTouchPoints > 1 && /Macintosh/.test(userAgent));
}

/** Safari proper, not Chrome/Firefox/Edge/Opera/in-app browsers wearing WebKit. */
export function isIosSafari(userAgent: string, maxTouchPoints = 0): boolean {
  if (!isIosDevice(userAgent, maxTouchPoints)) return false;
  if (/(CriOS|FxiOS|EdgiOS|OPiOS|GSA|FBAN|FBAV|Instagram|Line\/|MicroMessenger)/.test(userAgent)) return false;
  return /Safari/.test(userAgent) || /Macintosh/.test(userAgent);
}

export function installMode(env: InstallEnv): InstallMode {
  if (env.standalone) return "installed";
  if (env.hasDeferredPrompt) return "prompt";
  if (isIosSafari(env.userAgent, env.maxTouchPoints)) return "ios";
  return "none";
}

export const INSTALL_DISMISS_KEY = "hoa-install-dismissed";

/** The stored value is the buildId it was dismissed on. An unknown build never matches a stored one. */
export function installDismissed(stored: string | null | undefined, buildId: string | null | undefined): boolean {
  return !!stored && !!buildId && stored === buildId;
}

/** Should the card show? `ready` is false until the client has read the device (no SSR flash). */
export function showInstallCard(mode: InstallMode, dismissed: boolean, ready = true): boolean {
  return ready && !dismissed && (mode === "prompt" || mode === "ios");
}
