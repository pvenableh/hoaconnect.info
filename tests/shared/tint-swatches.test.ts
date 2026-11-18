/**
 * The tint (Phase 4; plan §2.4, decisions 4 and 8): a fixed row of swatches,
 * one resolver from a person's choice and a mode to the accent, and the
 * `--tint-*` tokens in theme-app.css that `audit:contrast-pairs` grades. What
 * these pin:
 *
 *   · the CSS tokens are exactly what accent.ts computes — so the audit grades
 *     the colours the app actually paints, not a copy that drifted;
 *   · Tint off is the community's ink and clear glass, whatever swatch is kept;
 *   · the community's swatch follows the community's colour, and falls back to
 *     HOA Connect cyan;
 *   · Slate stays slate (the brand floors would turn it blue).
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  BRAND_ACCENT,
  TINT_SWATCHES,
  TINT_SWATCH_IDS,
  getAdminAccent,
  hexToHsl,
  hslToHex,
  inkHover,
  isTintSwatchId,
  resolveTint,
  swatchAccent,
  tintedGround,
} from "#core/shared/branding/accent";

const css = readFileSync(resolve(__dirname, "../../core/app/assets/css/theme-app.css"), "utf8");
const token = (name: string): [string, string] | null => {
  const m = new RegExp(`${name}:\\s*light-dark\\((#[0-9a-f]{6}),\\s*(#[0-9a-f]{6})\\)`, "i").exec(css);
  return m ? [m[1]!.toLowerCase(), m[2]!.toLowerCase()] : null;
};

const FIXED = TINT_SWATCHES.filter((s) => s.hex);

describe("the swatch row", () => {
  it("is the community's colour first, then five fixed hues", () => {
    expect(TINT_SWATCH_IDS).toEqual(["community", "blue", "teal", "violet", "rose", "slate"]);
    expect(TINT_SWATCHES[0]).toMatchObject({ id: "community", hex: null });
    expect(FIXED).toHaveLength(5);
  });

  it("holds no red, amber or green, so a tint never reads as a status", () => {
    for (const sw of FIXED) {
      const h = hexToHsl(sw.hex!)!.h;
      const status = (h >= 0 && h < 20) || (h >= 25 && h < 65) || (h >= 85 && h < 160);
      expect({ id: sw.id, status }).toEqual({ id: sw.id, status: false });
    }
  });

  it.each([
    ["community", true],
    ["slate", true],
    ["vivid", false],
    ["", false],
    [null, false],
    [3, false],
  ])("isTintSwatchId(%j) is %s", (v, ok) => {
    expect(isTintSwatchId(v)).toBe(ok);
  });
});

describe("theme-app.css carries exactly what accent.ts computes", () => {
  it.each(FIXED.map((s) => [s.id]))("%s: ink, its hover and its glass, light and dark", (id) => {
    const L = resolveTint({ on: true, swatch: id }, "light");
    const D = resolveTint({ on: true, swatch: id }, "dark");
    expect(token(`--tint-${id}-ink`)).toEqual([hslToHex(L.ink), hslToHex(D.ink)]);
    expect(token(`--tint-${id}-ink-hover`)).toEqual([hslToHex(L.inkHover), hslToHex(D.inkHover)]);
    expect(token(`--tint-${id}-glass`)).toEqual([L.ground, D.ground]);
  });

  it("has no row for a swatch that does not exist", () => {
    const rows = [...css.matchAll(/--tint-([a-z]+)-ink:/g)].map((m) => m[1]);
    expect(rows.sort()).toEqual(FIXED.map((s) => s.id).sort());
  });
});

describe("resolveTint", () => {
  const COMMUNITY = "#B8956C";
  const community = getAdminAccent(COMMUNITY);

  it.each([
    ["nothing stored: Tint on, the community's colour", undefined, "light", { on: true, swatch: "community" }],
    ["an empty object: the same", {}, "dark", { on: true, swatch: "community" }],
    ["a swatch", { swatch: "violet" }, "light", { on: true, swatch: "violet" }],
    ["Tint off keeps the swatch out of the paint", { on: false, swatch: "violet" }, "light", { on: false, swatch: "community" }],
    ["an unknown swatch is the community's", { swatch: "vivid" }, "dark", { on: true, swatch: "community" }],
  ] as const)("%s", (_name, stored, mode, out) => {
    expect(resolveTint(stored as any, mode, COMMUNITY)).toMatchObject(out);
  });

  it("paints the community's ink and clear glass when Tint is off", () => {
    const r = resolveTint({ on: false, swatch: "rose" }, "light", COMMUNITY);
    expect(r.ink).toEqual(community.ink.light);
    expect(r.glass).toEqual(community.light);
    expect(r.ground).toBeNull();
  });

  it("paints the chosen swatch's ink, hover and tinted ground when Tint is on", () => {
    const r = resolveTint({ swatch: "teal" }, "dark", COMMUNITY);
    const teal = swatchAccent("teal");
    expect(r.ink).toEqual(teal.ink.dark);
    expect(r.inkHover).toEqual(inkHover(teal.ink.dark, "dark"));
    expect(r.ground).toBe(tintedGround(teal.dark, "dark"));
  });

  it("falls back to HOA Connect cyan when the community has no colour", () => {
    expect(resolveTint({}, "light").ink).toEqual(BRAND_ACCENT.ink.light);
    expect(resolveTint({}, "light", "not-a-colour").ink).toEqual(BRAND_ACCENT.ink.light);
  });
});

describe("swatchAccent", () => {
  it("keeps Slate's low saturation in every tier", () => {
    const slate = swatchAccent("slate");
    for (const v of [slate.light, slate.dark, slate.ink.light, slate.ink.dark]) {
      expect(v.s).toBeLessThan(25);
    }
  });

  it("lifts a washed-out brand colour as before (the floors still apply)", () => {
    expect(swatchAccent("community", "#F5F0EB").light.s).toBe(45);
  });
});

describe("inkHover", () => {
  it("darkens in light and brightens in dark", () => {
    const ink = { h: 200, s: 80, l: 40 };
    expect(inkHover(ink, "light").l).toBe(35);
    expect(inkHover(ink, "dark").l).toBe(49);
    expect(inkHover({ h: 200, s: 80, l: 88 }, "dark").l).toBe(92);
  });
});
