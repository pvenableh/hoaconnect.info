// The admin workspace's accent colour — one seam, one resolver.
//
// The workspace (admin + auth) is deliberately ONE branded surface: unlike the
// public landing pages, it does not change shape per organization. But the
// accent hue is the one part we may want organizations to own later ("their"
// community colour on the glass), so every consumer goes through
// `getAdminAccent()` and nothing else hardcodes cyan.
//
// TO LET ORGANIZATIONS BRAND THE WORKSPACE, this is the whole change:
//   1. add a colour field to org settings (e.g. `settings.admin_accent`), and
//   2. pass it at the single call site:
//        getAdminAccent(org?.settings?.admin_accent)
// The derivation below already accepts any hex and tunes a light/dark pair from
// it, so no CSS and no component has to change.

/** A hue/saturation/lightness triple, in CSS units (h: deg, s/l: percent). */
export interface AccentHsl {
  h: number;
  s: number;
  l: number;
}

/** The resolved accent, tuned separately for each appearance mode. */
export interface AdminAccent {
  light: AccentHsl;
  dark: AccentHsl;
}

/**
 * HOA Connect's own cyan. This is the resting default and the value baked into
 * `theme-app.css`, so the CSS and the runtime agree before any JS runs.
 */
export const BRAND_ACCENT_HEX = "#00BFFF";

const clamp = (n: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, n));

const round1 = (n: number): number => Math.round(n * 10) / 10;

/**
 * Parse a CSS hex colour (`#rgb`, `#rrggbb`, with or without `#`) into HSL.
 * Returns null for anything unparseable, so callers can fall back to the brand.
 */
export function hexToHsl(hex: string): AccentHsl | null {
  if (typeof hex !== "string") return null;
  let value = hex.trim().replace(/^#/, "");
  if (value.length === 3) {
    value = value
      .split("")
      .map((c) => c + c)
      .join("");
  }
  if (!/^[0-9a-fA-F]{6}$/.test(value)) return null;

  const r = parseInt(value.slice(0, 2), 16) / 255;
  const g = parseInt(value.slice(2, 4), 16) / 255;
  const b = parseInt(value.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const l = (max + min) / 2;

  if (delta === 0) return { h: 0, s: 0, l: round1(l * 100) };

  const s = delta / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === r) h = ((g - b) / delta) % 6;
  else if (max === g) h = (b - r) / delta + 2;
  else h = (r - g) / delta + 4;
  h = h * 60;
  if (h < 0) h += 360;

  return { h: Math.round(h), s: round1(s * 100), l: round1(l * 100) };
}

/**
 * Tune one source colour into a light-mode and a dark-mode accent.
 *
 * The accent is decoration on glass — rims, focus halos, active thumbs, glows —
 * not body text, so this optimises for "reads as the brand against the ground"
 * rather than for text contrast. Text-weight colours live in the `--theme-*`
 * tokens and are chosen for contrast separately.
 *
 * Light ground wants a saturated mid-lightness colour; dark ground wants it a
 * little brighter and a little less saturated, or it glares.
 */
export function deriveAdminAccent(base: AccentHsl): AdminAccent {
  const h = ((Math.round(base.h) % 360) + 360) % 360;
  const s = clamp(base.s, 0, 100);
  const l = clamp(base.l, 0, 100);

  return {
    light: {
      h,
      s: round1(clamp(s, 45, 100)),
      l: round1(clamp(l, 38, 55)),
    },
    dark: {
      h,
      s: round1(clamp(s * 0.88, 40, 92)),
      l: round1(clamp(l + 6, 48, 66)),
    },
  };
}

/** The brand accent, pre-derived. */
export const BRAND_ACCENT: AdminAccent = deriveAdminAccent(
  hexToHsl(BRAND_ACCENT_HEX) as AccentHsl,
);

/**
 * The accent for the admin workspace.
 *
 * Pass a colour to brand the workspace per organization (see the note at the
 * top of this file); pass nothing — today's behaviour — for HOA Connect cyan.
 * Anything unparseable falls back to the brand rather than throwing, because a
 * bad settings value must never leave the workspace without an accent.
 */
export function getAdminAccent(brandColor?: string | null): AdminAccent {
  if (!brandColor) return BRAND_ACCENT;
  const parsed = hexToHsl(brandColor);
  return parsed ? deriveAdminAccent(parsed) : BRAND_ACCENT;
}

/**
 * The accent as CSS custom properties, ready to write onto an element.
 * Keys match the `--app-accent-*` contract that the glass layer reads.
 */
export function accentCssVars(accent: AccentHsl): Record<string, string> {
  return {
    "--app-accent-h": String(accent.h),
    "--app-accent-s": `${accent.s}%`,
    "--app-accent-l": `${accent.l}%`,
  };
}
