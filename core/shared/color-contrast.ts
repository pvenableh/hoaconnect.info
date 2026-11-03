/**
 * WCAG 2 contrast for a colour we didn't choose (an org's brand colour), and
 * the legible text colour to put on it. Used by the email templates (Phase 4:
 * `brandOnColor`, the label on the brand band and pill) — pure, so the UI can
 * use the same rule.
 */

const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function rgbOf(hex: string): [number, number, number] | null {
  if (!HEX_RE.test(hex.trim())) return null;
  let h = hex.trim().slice(1);
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** Relative luminance (WCAG 2.x), 0–1; null for anything that isn't a hex colour. */
export function relativeLuminance(hex: string): number | null {
  const rgb = rgbOf(hex);
  if (!rgb) return null;
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contrast ratio between two hex colours, 1–21; null if either isn't one. */
export function contrastRatio(a: string, b: string): number | null {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  if (la == null || lb == null) return null;
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

export const ON_LIGHT_TEXT = "#1f2937";
export const ON_DARK_TEXT = "#ffffff";

/**
 * The text colour that reads best on `bg`: white or the app's ink, whichever
 * has the higher contrast. Unparseable input gets white (every platform
 * default band is dark).
 */
export function onColor(bg: string, light = ON_DARK_TEXT, dark = ON_LIGHT_TEXT): string {
  const withLight = contrastRatio(bg, light);
  const withDark = contrastRatio(bg, dark);
  if (withLight == null || withDark == null) return light;
  return withLight >= withDark ? light : dark;
}

/** Does white text read better than ink on this colour? */
export function prefersLightText(bg: string): boolean {
  return onColor(bg) === ON_DARK_TEXT;
}
