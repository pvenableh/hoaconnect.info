import { describe, it, expect } from "vitest";
import {
  WAVE_BANDS,
  ORB_DRIFT,
  waveY,
  wavePath,
  VB_W,
  VB_H,
} from "../../core/shared/home/waves";

describe("ambient wave geometry", () => {
  it("has five bands", () => {
    expect(WAVE_BANDS).toHaveLength(5);
  });

  // THE invariant. A fractional multiplier looks fine standing still and jumps
  // visibly on every wrap, which is the one failure mode this effect cannot
  // survive — so it is asserted rather than trusted.
  it("uses whole-number harmonic multipliers everywhere", () => {
    for (const band of WAVE_BANDS) {
      expect(band.harmonics.length).toBeGreaterThan(0);
      for (const h of band.harmonics) {
        expect(Number.isInteger(h.mult)).toBe(true);
        expect(h.mult).toBeGreaterThan(0);
      }
    }
  });

  it("repeats exactly every base period, which is what makes the loop seamless", () => {
    for (const band of WAVE_BANDS) {
      for (let i = 0; i <= 24; i++) {
        const x = (band.period * i) / 24;
        expect(waveY(band, x)).toBeCloseTo(waveY(band, x + band.period), 8);
        // And two periods out, so a band that drifts for an hour still lines up.
        expect(waveY(band, x)).toBeCloseTo(waveY(band, x + band.period * 2), 8);
      }
    }
  });

  it("keeps every sample inside the band's amplitude around its mid line", () => {
    for (const band of WAVE_BANDS) {
      for (let i = 0; i <= 100; i++) {
        const y = waveY(band, (band.period * i) / 100);
        expect(Math.abs(y - band.mid)).toBeLessThanOrEqual(band.amp + 1e-9);
      }
    }
  });

  it("draws a closed path with a full period of slack on the left", () => {
    for (const band of WAVE_BANDS) {
      const d = wavePath(band);
      expect(d.startsWith("M")).toBe(true);
      expect(d.endsWith("Z")).toBe(true);

      const xs = [...d.matchAll(/[ML](-?\d+\.\d+),(-?\d+\.\d+)/g)].map((m) => Number(m[1]));
      // Starts one whole period off-screen to the left...
      expect(Math.min(...xs)).toBeCloseTo(-band.period, 6);
      // ...and runs at least one period past the right edge, so a band drifting
      // either way never exposes its trailing edge.
      expect(Math.max(...xs)).toBeGreaterThanOrEqual(VB_W + band.period);
    }
  });

  it("closes the fill down to the bottom of the viewBox", () => {
    const d = wavePath(WAVE_BANDS[0]!);
    expect(d).toContain(`,${VB_H} `);
  });

  // Light and dark are two independent numbers, not one value with an opacity
  // multiplier over the top — the plan is explicit about this, and a dark alpha
  // that merely equalled the light one would mean the tuning never happened.
  it("tunes light and dark alphas separately", () => {
    for (const band of WAVE_BANDS) {
      expect(band.alphaLight).toBeGreaterThan(0);
      expect(band.alphaDark).toBeGreaterThan(0);
      expect(band.alphaDark).not.toBe(band.alphaLight);
    }
  });

  it("mixes drift directions so the field does not read as one conveyor", () => {
    const dirs = new Set(WAVE_BANDS.map((b) => b.dir));
    expect(dirs.has(1)).toBe(true);
    expect(dirs.has(-1)).toBe(true);
  });

  it("drifts orbs deterministically", () => {
    expect(ORB_DRIFT).toHaveLength(4);
    for (const d of ORB_DRIFT) {
      expect(Number.isFinite(d.x)).toBe(true);
      expect(Number.isFinite(d.y)).toBe(true);
      expect(d.dur).toBeGreaterThan(0);
    }
  });
});
