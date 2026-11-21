import { describe, it, expect } from "vitest";
import {
  sharedElementPlan,
  sheetDragOffset,
  sheetRelease,
  swipeIntent,
  swipeOffset,
  swipeSettle,
  largeTitleProgress,
} from "#core/shared/motion";

const a = { x: 10, y: 20, width: 100, height: 40 };
const b = { x: 50, y: 80, width: 300, height: 200 };

describe("sharedElementPlan", () => {
  it("starts the destination at the source's box", () => {
    const p = sharedElementPlan(a, b, false);
    expect(p.animate).toBe(true);
    expect(p.from).toEqual({ dx: -40, dy: -60, sx: 100 / 300, sy: 40 / 200 });
    expect(p.duration).toBeGreaterThanOrEqual(0.18);
    expect(p.duration).toBeLessThanOrEqual(0.32);
  });
  it("is a no-op under reduced motion, or with no box", () => {
    expect(sharedElementPlan(a, b, true).animate).toBe(false);
    expect(sharedElementPlan(null, b, false).animate).toBe(false);
    expect(sharedElementPlan(a, { ...b, width: 0 }, false).animate).toBe(false);
  });
});

describe("sheet drag", () => {
  it("tracks down 1:1 and rubber-bands up", () => {
    expect(sheetDragOffset(80)).toBe(80);
    expect(sheetDragOffset(-100)).toBeCloseTo(-30);
  });
  it("dismisses past the distance or the velocity, else springs back", () => {
    expect(sheetRelease({ offset: 140, velocity: 0, height: 400 })).toEqual({ dismiss: true, to: 440 });
    expect(sheetRelease({ offset: 30, velocity: 0.9, height: 400 }).dismiss).toBe(true);
    expect(sheetRelease({ offset: 60, velocity: 0.1, height: 400 })).toEqual({ dismiss: false, to: 0 });
  });
});

describe("swipe row", () => {
  it("locks to swipe or scroll by dominant axis", () => {
    expect(swipeIntent(3, 2)).toBe("undecided");
    expect(swipeIntent(-14, 3)).toBe("swipe");
    expect(swipeIntent(2, 16)).toBe("scroll");
  });
  it("follows the finger to the actions, resists beyond", () => {
    expect(swipeOffset(-40, 0, 88)).toBe(-40);
    expect(swipeOffset(-200, 0, 88)).toBeGreaterThan(-200);
    expect(swipeOffset(-200, 0, 88)).toBeLessThan(-88);
    expect(swipeOffset(60, 0, 88)).toBeLessThan(60 * 0.2);
  });
  it("opens past 40% or on a flick, closes on a flick back", () => {
    expect(swipeSettle({ offset: -50, velocity: 0, actionWidth: 88, wasOpen: false })).toBe(true);
    expect(swipeSettle({ offset: -20, velocity: 0, actionWidth: 88, wasOpen: false })).toBe(false);
    expect(swipeSettle({ offset: -20, velocity: -0.8, actionWidth: 88, wasOpen: false })).toBe(true);
    expect(swipeSettle({ offset: -60, velocity: 0.8, actionWidth: 88, wasOpen: true })).toBe(false);
  });
});

describe("largeTitleProgress", () => {
  it("scrubs 0..1 over the range", () => {
    expect(largeTitleProgress(0, 56, false)).toBe(0);
    expect(largeTitleProgress(28, 56, false)).toBe(0.5);
    expect(largeTitleProgress(500, 56, false)).toBe(1);
  });
  it("snaps instead of scrubbing under reduced motion", () => {
    expect(largeTitleProgress(20, 56, true)).toBe(0);
    expect(largeTitleProgress(30, 56, true)).toBe(1);
  });
});
