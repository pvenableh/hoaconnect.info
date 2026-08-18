import { describe, it, expect } from "vitest";
import { risePreset, fadePreset, RISE_SPRING } from "#core/shared/motion/presets";

describe("risePreset", () => {
  it("builds a staggered spring rise when motion is allowed", () => {
    const p = risePreset(false, 2, { stagger: 40 });
    expect(p.initial).toEqual({ opacity: 0, y: 14 });
    expect(p.enter.opacity).toBe(1);
    expect(p.enter.y).toBe(0);
    expect(p.enter.transition).toMatchObject({ ...RISE_SPRING, delay: 80 });
  });

  it("respects custom y / base / stagger", () => {
    const p = risePreset(false, 1, { y: 20, base: 100, stagger: 50 });
    expect(p.initial.y).toBe(20);
    expect((p.enter.transition as any).delay).toBe(150);
  });

  it("never produces a negative delay", () => {
    const p = risePreset(false, 0, { base: -100 });
    expect((p.enter.transition as any).delay).toBe(0);
  });

  it("collapses to an instant opacity reveal under reduced motion", () => {
    const p = risePreset(true, 5);
    expect(p.initial).toEqual({ opacity: 1 });
    expect(p.enter).toEqual({ opacity: 1 });
  });
});

describe("fadePreset", () => {
  it("fades in with a duration when motion is allowed", () => {
    const p = fadePreset(false, { duration: 200 });
    expect(p.initial).toEqual({ opacity: 0 });
    expect((p.enter.transition as any).duration).toBe(200);
  });
  it("collapses under reduced motion", () => {
    const p = fadePreset(true);
    expect(p.initial).toEqual({ opacity: 1 });
    expect(p.enter).toEqual({ opacity: 1 });
  });
});
