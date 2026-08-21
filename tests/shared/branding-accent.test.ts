import { describe, it, expect } from "vitest";
import {
  hexToHsl,
  deriveAdminAccent,
  getAdminAccent,
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

describe("accentCssVars", () => {
  it("emits the --app-accent-* contract the glass layer reads", () => {
    expect(accentCssVars({ h: 195, s: 100, l: 50 })).toEqual({
      "--app-accent-h": "195",
      "--app-accent-s": "100%",
      "--app-accent-l": "50%",
    });
  });
});
