import { describe, it, expect } from "vitest";
import {
  hexToHsl,
  deriveAdminAccent,
  getAdminAccent,
  deriveInkAccent,
  accentCssVars,
  BRAND_ACCENT,
  BRAND_ACCENT_HEX,
} from "#core/shared/branding/accent";

describe("hexToHsl", () => {
  it("parses the brand cyan", () => {
    expect(hexToHsl("#00BFFF")).toEqual({ h: 195, s: 100, l: 50 });
  });

  it("accepts shorthand, a missing hash, and stray whitespace", () => {
    expect(hexToHsl("#fff")).toEqual({ h: 0, s: 0, l: 100 });
    expect(hexToHsl("00BFFF")).toEqual({ h: 195, s: 100, l: 50 });
    expect(hexToHsl("  #00BFFF  ")).toEqual({ h: 195, s: 100, l: 50 });
  });

  it("reports greys as zero-saturation rather than guessing a hue", () => {
    expect(hexToHsl("#808080")).toMatchObject({ h: 0, s: 0 });
  });

  it("returns null for anything unparseable", () => {
    for (const bad of ["", "#12", "#12345", "nope", "#gggggg", "rgb(0,0,0)"]) {
      expect(hexToHsl(bad)).toBeNull();
    }
    expect(hexToHsl(undefined as unknown as string)).toBeNull();
  });
});

describe("deriveAdminAccent", () => {
  it("keeps the hue and brightens/desaturates for dark ground", () => {
    const a = deriveAdminAccent({ h: 195, s: 100, l: 50 });
    expect(a.light).toEqual({ h: 195, s: 100, l: 50 });
    expect(a.dark.h).toBe(195);
    expect(a.dark.s).toBeLessThan(a.light.s);
    expect(a.dark.l).toBeGreaterThan(a.light.l);
  });

  it("lifts a washed-out colour into a usable accent range", () => {
    const a = deriveAdminAccent({ h: 30, s: 4, l: 96 });
    expect(a.light.s).toBe(45);
    expect(a.light.l).toBe(55);
    expect(a.dark.l).toBeLessThanOrEqual(66);
  });

  it("lifts a near-black colour off the floor so it can still read as an accent", () => {
    const a = deriveAdminAccent({ h: 210, s: 90, l: 3 });
    expect(a.light.l).toBe(38);
    expect(a.dark.l).toBe(48);
  });

  it("normalizes out-of-range hues", () => {
    expect(deriveAdminAccent({ h: 380, s: 50, l: 50 }).light.h).toBe(20);
    expect(deriveAdminAccent({ h: -20, s: 50, l: 50 }).light.h).toBe(340);
  });
});

describe("getAdminAccent", () => {
  it("returns the brand accent when no organization colour is given", () => {
    expect(getAdminAccent()).toEqual(BRAND_ACCENT);
    expect(getAdminAccent(null)).toEqual(BRAND_ACCENT);
    expect(getAdminAccent("")).toEqual(BRAND_ACCENT);
  });

  it("derives from an organization colour when one is supplied", () => {
    const a = getAdminAccent("#B8956C");
    expect(a).not.toEqual(BRAND_ACCENT);
    expect(a.light.h).toBe(hexToHsl("#B8956C")!.h);
  });

  it("falls back to the brand rather than throwing on a bad settings value", () => {
    expect(getAdminAccent("not-a-color")).toEqual(BRAND_ACCENT);
  });

  it("agrees with the hex baked into the CSS resting default", () => {
    expect(BRAND_ACCENT.light).toEqual(hexToHsl(BRAND_ACCENT_HEX));
  });
});

describe("deriveInkAccent", () => {
  // The ink tier exists so the brand can carry TEXT and button fills. If it
  // fails contrast it is not doing its job, and the failure is per-hue: yellow
  // and cyan read far lighter than blue at the same lightness, so a formula
  // tuned on one hue quietly fails on another. Assert across the wheel.
  const srgb = (v: number) =>
    v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;

  function hslToRgb({ h, s, l }: { h: number; s: number; l: number }) {
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
    return [r1 + m, g1 + m, b1 + m];
  }

  const lum = (hsl: { h: number; s: number; l: number }) => {
    const [r, g, b] = hslToRgb(hsl);
    return 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);
  };

  const hexLum = (hex: string) => {
    const h = hex.replace("#", "");
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
    return 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);
  };

  const ratio = (a: number, b: number) =>
    (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

  // The grounds defined in theme-app.css.
  const LIGHT_PAGE = hexLum("#f6f8fb");
  const LIGHT_CARD = hexLum("#ffffff");
  const DARK_PAGE = hexLum("#0b1015");
  const DARK_CARD = hexLum("#151d25");
  const WHITE = hexLum("#ffffff");

  const HUES = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330];

  it("carries accent TEXT at AA on every ground, for every hue", () => {
    const failures: string[] = [];
    for (const h of HUES) {
      const ink = deriveInkAccent({ h, s: 85, l: 50 });
      const checks: [string, number, number][] = [
        [`h${h} light/page`, lum(ink.light), LIGHT_PAGE],
        [`h${h} light/card`, lum(ink.light), LIGHT_CARD],
        [`h${h} dark/page`, lum(ink.dark), DARK_PAGE],
        [`h${h} dark/card`, lum(ink.dark), DARK_CARD],
      ];
      for (const [name, fg, bg] of checks) {
        const r = ratio(fg, bg);
        if (r < 4.5) failures.push(`${name}: ${r.toFixed(2)}:1`);
      }
    }
    expect(failures).toEqual([]);
  });

  it("takes white text on the light-mode fill at AA", () => {
    const failures: string[] = [];
    for (const h of HUES) {
      const ink = deriveInkAccent({ h, s: 85, l: 50 });
      const r = ratio(lum(ink.light), WHITE);
      if (r < 4.5) failures.push(`h${h}: ${r.toFixed(2)}:1`);
    }
    expect(failures).toEqual([]);
  });

  it("keeps the source hue so the brand is still recognisable", () => {
    for (const h of HUES) {
      const ink = deriveInkAccent({ h, s: 85, l: 50 });
      expect(ink.light.h).toBe(h);
      expect(ink.dark.h).toBe(h);
    }
  });

  it("survives greys and fully-saturated extremes without going out of range", () => {
    for (const base of [
      { h: 0, s: 0, l: 50 },
      { h: 200, s: 100, l: 0 },
      { h: 200, s: 100, l: 100 },
    ]) {
      const ink = deriveInkAccent(base);
      for (const v of [ink.light, ink.dark]) {
        expect(v.l).toBeGreaterThanOrEqual(0);
        expect(v.l).toBeLessThanOrEqual(100);
        expect(v.s).toBeGreaterThanOrEqual(0);
        expect(v.s).toBeLessThanOrEqual(100);
      }
    }
  });
});

describe("accentCssVars", () => {
  it("emits the --app-accent-* contract the glass layer reads", () => {
    expect(accentCssVars({ h: 195, s: 100, l: 50 })).toEqual({
      "--app-accent-h": "195",
      "--app-accent-s": "100%",
      "--app-accent-l": "50%",
    });
  });
});
