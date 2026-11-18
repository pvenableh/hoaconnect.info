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
  /**
   * The INK tier — the same hue pushed to a lightness that carries text and
   * fills at WCAG AA. See `deriveInkAccent`.
   */
  ink: { light: AccentHsl; dark: AccentHsl };
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
export function deriveAdminAccent(base: AccentHsl, opts: AccentOptions = {}): AdminAccent {
  const h = ((Math.round(base.h) % 360) + 360) % 360;
  const s = clamp(base.s, 0, 100);
  const l = clamp(base.l, 0, 100);
  // A neutral colour (the Slate swatch) keeps its low saturation: the floors
  // below exist to rescue a washed-out BRAND colour, and would turn grey blue.
  const n = !!opts.neutral;

  return {
    light: {
      h,
      s: round1(n ? s : clamp(s, 45, 100)),
      l: round1(clamp(l, 38, 55)),
    },
    dark: {
      h,
      s: round1(n ? s * 0.88 : clamp(s * 0.88, 40, 92)),
      l: round1(clamp(l + 6, 48, 66)),
    },
    ink: deriveInkAccent({ h, s, l }, opts),
  };
}

/** `neutral`: keep a deliberately low saturation instead of lifting it. */
export interface AccentOptions {
  neutral?: boolean;
}

// --- Contrast machinery ----------------------------------------------------
// The grounds the workspace actually paints, mirrored from theme-app.css. They
// live here because the ink tier is SOLVED against them rather than guessed.
// In each mode, solve against whichever ground is the HARDER one to read on:
// dark ink loses contrast against the darker ground, light ink loses it against
// the lighter one. So light mode is solved against the page (#f6f8fb, darker
// than a white card) and dark mode against the CARD (#151d25, lighter than the
// page). Getting this backwards is not theoretical — solving dark mode against
// the page first put six hues at ~4.1:1 on cards.
const GROUND_LIGHT = 0.937; // #f6f8fb — page
const GROUND_DARK = 0.0117; // #151d25 — elevated card
const WHITE_LUM = 1;

const srgb = (v: number) =>
  v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;

function hslLuminance(h: number, s: number, l: number): number {
  const S = s / 100;
  const L = l / 100;
  const c = (1 - Math.abs(2 * L - 1)) * S;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const [r1, g1, b1] =
    hp < 1 ? [c, x, 0]
    : hp < 2 ? [x, c, 0]
    : hp < 3 ? [0, c, x]
    : hp < 4 ? [0, x, c]
    : hp < 5 ? [x, 0, c]
    : [c, 0, x];
  const m = L - c / 2;
  return (
    0.2126 * srgb(r1 + m) + 0.7152 * srgb(g1 + m) + 0.0722 * srgb(b1 + m)
  );
}

const contrast = (a: number, b: number) =>
  (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

/** Does this lightness satisfy every requirement placed on it? */
type LightnessTest = (l: number) => boolean;

/**
 * Walk lightness in `step` increments from `from` and return the first value
 * that passes. A scan rather than a binary search because the predicate is a
 * conjunction of contrast requirements and is not guaranteed monotonic across
 * all of them; 0.5% steps over a 100-point range is trivial work either way.
 */
function findLightness(from: number, to: number, test: LightnessTest): number {
  const step = from <= to ? 0.5 : -0.5;
  for (let l = from; step > 0 ? l <= to : l >= to; l += step) {
    if (test(l)) return round1(l);
  }
  return round1(to);
}

/**
 * The INK tier: the same hue at a lightness that can carry TEXT and act as a
 * button fill without failing contrast.
 *
 * The decorative tier is tuned to look good as light ON glass, which for most
 * hues is far too pale to put white text on or to read as a link. So the brand
 * appears twice at different lightnesses rather than once at a compromise:
 * bright for rims, halos and thumbs; deep for ink and fills.
 *
 * The lightness is SOLVED, not guessed. An earlier version applied a hand-tuned
 * per-hue nudge, and a test across the hue wheel immediately found cyan failing
 * white-on-fill at 3.78:1 — hues differ far too much in luminance for a fudge
 * factor to hold. This walks the lightness until the real WCAG maths passes, so
 * any brand colour an organization picks will work rather than most of them.
 */
export function deriveInkAccent(
  base: AccentHsl,
  opts: AccentOptions = {},
): {
  light: AccentHsl;
  dark: AccentHsl;
} {
  const h = ((Math.round(base.h) % 360) + 360) % 360;
  // Hold saturation up so a deep colour still reads as the brand, not as mud —
  // unless the colour is neutral on purpose, where "mud" is the point.
  const s = opts.neutral
    ? round1(clamp(base.s, 0, 100))
    : round1(clamp(Math.max(clamp(base.s, 0, 100), 55), 30, 100));
  const sDark = opts.neutral ? round1(s * 0.92) : round1(clamp(s * 0.92, 30, 95));

  // Light mode: start light and darken until the colour both reads as text on
  // the page AND can take white text as a fill. Prefer the lightest that works,
  // so the accent stays as vivid as contrast allows.
  const lightL = findLightness(52, 8, (l) => {
    const lum = hslLuminance(h, s, l);
    return (
      contrast(lum, GROUND_LIGHT) >= 4.5 && contrast(lum, WHITE_LUM) >= 4.5
    );
  });

  // Dark mode: start at the lightness dark-mode accents conventionally sit at —
  // bright enough to pop off a near-black ground, still saturated enough to read
  // as the colour rather than as a pastel — and lighten only if that fails
  // against an elevated card, the harder of the two dark grounds. Searching up
  // from the contrast floor instead would return the DIMMEST passing value,
  // which is the wrong end: on dark, brighter is both safer and more vivid.
  const darkL = findLightness(62, 92, (l) => {
    const lum = hslLuminance(h, sDark, l);
    return contrast(lum, GROUND_DARK) >= 4.5;
  });

  return {
    light: { h, s, l: lightL },
    dark: { h, s: sDark, l: darkL },
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
 *
 * `--app-accent-*` is the decorative contract the glass layer reads. When an ink
 * tier is supplied it also writes the token that carries accent TEXT and fills,
 * so both halves of the brand move together — otherwise changing the accent
 * would re-tint the glass and leave every button and link the old colour.
 */
export function accentCssVars(
  accent: AccentHsl,
  ink?: AccentHsl,
  inkHover?: AccentHsl,
): Record<string, string> {
  const vars: Record<string, string> = {
    "--app-accent-h": String(accent.h),
    "--app-accent-s": `${accent.s}%`,
    "--app-accent-l": `${accent.l}%`,
  };
  if (ink) {
    const color = `hsl(${ink.h} ${ink.s}% ${ink.l}%)`;
    vars["--theme-accent-primary"] = color;
    vars["--theme-link-color"] = color;
    vars["--theme-button-bg"] = color;
    // --primary and --ring already point at --theme-accent-primary through the
    // shadcn bridge, so buttons, focus rings and links all follow from this.
  }
  if (inkHover) {
    // The hover moves with the ink, or a Rose button hovers cyan.
    const color = `hsl(${inkHover.h} ${inkHover.s}% ${inkHover.l}%)`;
    vars["--theme-button-hover-bg"] = color;
    vars["--theme-accent-hover"] = color;
    vars["--theme-link-hover"] = color;
  }
  return vars;
}

// --- The tint: one colour per person (Phase 4; plan §2.4, decisions 4 and 8) ---
//
// Appearance has a Tint switch. Off: the glass is clear and neutral, and the
// ink (buttons, links) is the community's accent. On: the glass carries a
// colour and is a little more opaque, and the ink is that colour. The colour is
// the person's pick from this FIXED row — fixed so that every swatch's pair can
// be graded by `audit:contrast-pairs` in light and dark (the `--tint-*` tokens
// in theme-app.css, which a test holds equal to what this file computes). The
// first swatch is the community's own colour and is the default; it is graded
// across the whole hue wheel by the deriveInkAccent tests instead, since any
// community can pick any colour.
//
// No red, amber or green: a tint must never read as destructive, warning or
// success.

export const TINT_SWATCH_IDS = ["community", "blue", "teal", "violet", "rose", "slate"] as const;
export type TintSwatchId = (typeof TINT_SWATCH_IDS)[number];
export const DEFAULT_TINT_SWATCH: TintSwatchId = "community";
/** Tint is on for someone who never touched the switch (decided 2026-11-18). */
export const DEFAULT_TINT_ON = true;

export interface TintSwatch {
  id: TintSwatchId;
  label: string;
  /** Null for the community's swatch: its colour is the community's. */
  hex: string | null;
  neutral?: boolean;
}

export const TINT_SWATCHES: readonly TintSwatch[] = [
  { id: "community", label: "Community", hex: null },
  { id: "blue", label: "Blue", hex: "#2563EB" },
  { id: "teal", label: "Teal", hex: "#0D9488" },
  { id: "violet", label: "Violet", hex: "#7C3AED" },
  { id: "rose", label: "Rose", hex: "#DB2777" },
  { id: "slate", label: "Slate", hex: "#64748B", neutral: true },
];

export const isTintSwatchId = (v: unknown): v is TintSwatchId =>
  typeof v === "string" && (TINT_SWATCH_IDS as readonly string[]).includes(v);

/** A swatch's accent, both modes. An unknown id is the community's. */
export function swatchAccent(id: string | null | undefined, communityHex?: string | null): AdminAccent {
  const sw = TINT_SWATCHES.find((s) => s.id === id) ?? TINT_SWATCHES[0]!;
  if (!sw.hex) return getAdminAccent(communityHex);
  return deriveAdminAccent(hexToHsl(sw.hex) as AccentHsl, { neutral: sw.neutral });
}

/**
 * The hover step of an ink fill: darker in light (white text only gains),
 * brighter in dark (the dark button text only gains). Mirrors the brand pair
 * in theme-app.css (#007aa3 → #00668a, #45cbf7 → #6fe0fa).
 */
export function inkHover(ink: AccentHsl, mode: "light" | "dark"): AccentHsl {
  return mode === "light"
    ? { ...ink, l: round1(clamp(ink.l - 5, 0, 100)) }
    : { ...ink, l: round1(clamp(ink.l + 9, 0, 92)) };
}

/**
 * How strongly tinted glass carries its colour, as an alpha over the card
 * ground. The same numbers as `.glass-surface--strong`'s first gradient stop in
 * earnest-ui.css (light 0.14 at 60% lightness, dark 0.14 at 65%): the strongest
 * the tint ever gets, so the ground graded here is the hardest one to read on.
 */
export const TINT_GLASS = {
  light: { alpha: 0.14, l: 60, card: "#ffffff" },
  dark: { alpha: 0.14, l: 65, card: "#151d25" },
} as const;

const hex2 = (n: number) => Math.round(clamp(n, 0, 255)).toString(16).padStart(2, "0");

/** HSL to `#rrggbb`. */
export function hslToHex({ h, s, l }: AccentHsl): string {
  const S = s / 100;
  const L = l / 100;
  const c = (1 - Math.abs(2 * L - 1)) * S;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const [r1, g1, b1] =
    hp < 1 ? [c, x, 0]
    : hp < 2 ? [x, c, 0]
    : hp < 3 ? [0, c, x]
    : hp < 4 ? [0, x, c]
    : hp < 5 ? [x, 0, c]
    : [c, 0, x];
  const m = L - c / 2;
  return `#${hex2((r1 + m) * 255)}${hex2((g1 + m) * 255)}${hex2((b1 + m) * 255)}`;
}

/** The tinted glass as a solid colour: the tint at its strongest over the card. */
export function tintedGround(glass: AccentHsl, mode: "light" | "dark"): string {
  const t = TINT_GLASS[mode];
  const tint = hslToHex({ h: glass.h, s: glass.s, l: t.l });
  const ch = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  let out = "#";
  for (let i = 0; i < 3; i += 1) out += hex2(ch(tint, i) * t.alpha + ch(t.card, i) * (1 - t.alpha));
  return out;
}

export interface ResolvedTint {
  on: boolean;
  swatch: TintSwatchId;
  /** The bright tier: rims, halos, the glass's colour. */
  glass: AccentHsl;
  /** The ink tier: buttons, links, accent text. */
  ink: AccentHsl;
  inkHover: AccentHsl;
  /** The tinted glass as a solid ground (null when Tint is off: clear glass is the card). */
  ground: string | null;
}

/**
 * The ONE place a person's tint becomes colours: their stored choice, the
 * mode, and the community's colour in; the accent out. Off means the
 * community's colour for the ink and clear glass; a stored swatch is ignored
 * (and kept, so switching Tint back on brings it back).
 */
export function resolveTint(
  tint: { on?: boolean; swatch?: string | null } | null | undefined,
  mode: "light" | "dark",
  communityHex?: string | null,
): ResolvedTint {
  const on = typeof tint?.on === "boolean" ? tint.on : DEFAULT_TINT_ON;
  const swatch: TintSwatchId = on && isTintSwatchId(tint?.swatch) ? tint!.swatch as TintSwatchId : DEFAULT_TINT_SWATCH;
  const a = swatchAccent(swatch, communityHex);
  const ink = a.ink[mode];
  return {
    on,
    swatch,
    glass: a[mode],
    ink,
    inkHover: inkHover(ink, mode),
    ground: on ? tintedGround(a[mode], mode) : null,
  };
}
