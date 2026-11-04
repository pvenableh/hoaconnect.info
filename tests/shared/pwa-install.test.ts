import { describe, expect, it } from "vitest";
import { installDismissed, installMode, isIosSafari, showInstallCard } from "#core/shared/pwa/install";

const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";
const IPHONE_CHROME =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/124.0 Mobile/15E148 Safari/604.1";
const IPAD_DESKTOP_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15";
const ANDROID_CHROME = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36";

describe("installMode", () => {
  it("iOS Safari, not standalone → the Share → Add to Home Screen steps", () => {
    expect(installMode({ userAgent: IPHONE_SAFARI, standalone: false, hasDeferredPrompt: false })).toBe("ios");
  });

  it("iPadOS reporting a Mac user agent still counts (touch points)", () => {
    expect(installMode({ userAgent: IPAD_DESKTOP_UA, maxTouchPoints: 5, standalone: false, hasDeferredPrompt: false })).toBe("ios");
    expect(installMode({ userAgent: IPAD_DESKTOP_UA, maxTouchPoints: 0, standalone: false, hasDeferredPrompt: false })).toBe("none");
  });

  it("iOS Chrome is not Safari — no steps", () => {
    expect(isIosSafari(IPHONE_CHROME)).toBe(false);
    expect(installMode({ userAgent: IPHONE_CHROME, standalone: false, hasDeferredPrompt: false })).toBe("none");
  });

  it("a captured beforeinstallprompt → one-button install", () => {
    expect(installMode({ userAgent: ANDROID_CHROME, standalone: false, hasDeferredPrompt: true })).toBe("prompt");
  });

  it("Chromium before the browser has offered anything → nothing to show", () => {
    expect(installMode({ userAgent: ANDROID_CHROME, standalone: false, hasDeferredPrompt: false })).toBe("none");
  });

  it("already installed wins over everything", () => {
    expect(installMode({ userAgent: IPHONE_SAFARI, standalone: true, hasDeferredPrompt: false })).toBe("installed");
    expect(installMode({ userAgent: ANDROID_CHROME, standalone: true, hasDeferredPrompt: true })).toBe("installed");
  });
});

describe("dismissal and visibility", () => {
  it("a dismissal holds for the build it was made on, and lapses on the next", () => {
    expect(installDismissed("build-1", "build-1")).toBe(true);
    expect(installDismissed("build-1", "build-2")).toBe(false);
    expect(installDismissed(null, "build-1")).toBe(false);
    expect(installDismissed("build-1", "")).toBe(false);
  });

  it("the card shows for prompt and ios only, never when dismissed or before the client has read the device", () => {
    expect(showInstallCard("ios", false)).toBe(true);
    expect(showInstallCard("prompt", false)).toBe(true);
    expect(showInstallCard("ios", true)).toBe(false);
    expect(showInstallCard("installed", false)).toBe(false);
    expect(showInstallCard("none", false)).toBe(false);
    expect(showInstallCard("ios", false, false)).toBe(false);
  });
});
