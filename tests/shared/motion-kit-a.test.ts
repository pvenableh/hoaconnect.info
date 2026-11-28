import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  countUpPlan,
  formatCount,
  revealPlan,
  liquidSpan,
  REVEAL_MAX_MS,
} from "#core/shared/motion";
import { pickPageTransition, pushOrPopByDepth, type NavOrder } from "#core/shared/nav/page-transition";

describe("countUpPlan", () => {
  it("rolls from 0 on first view and from the shown value after", () => {
    const first = countUpPlan({ from: 0, to: 1000, reduced: false, first: true });
    expect(first).toMatchObject({ animate: true, from: 0 });
    expect(first.duration).toBeGreaterThanOrEqual(0.18);
    expect(first.duration).toBeLessThanOrEqual(0.32);
    expect(countUpPlan({ from: 400, to: 1000, reduced: false, first: false }).from).toBe(400);
  });
  it("is a no-op under reduced motion and lands on the final value", () => {
    expect(countUpPlan({ from: 0, to: 1000, reduced: true, first: true })).toEqual({
      animate: false,
      duration: 0,
      from: 1000,
    });
  });
  it("does nothing when the value did not change", () => {
    expect(countUpPlan({ from: 5, to: 5, reduced: false, first: false }).animate).toBe(false);
  });
});

describe("formatCount", () => {
  it("groups, rounds and wraps", () => {
    expect(formatCount(1284.5, { prefix: "$", decimals: 2 })).toBe("$1,284.50");
    expect(formatCount(Number.NaN)).toBe("0");
  });
});

describe("revealPlan", () => {
  it("staggers 40 ms apart and caps the wait", () => {
    const p = revealPlan({ count: 12, reduced: false, seen: false });
    expect(p.delays[1]).toBeCloseTo(0.04);
    expect(Math.max(...p.delays)).toBe(REVEAL_MAX_MS / 1000);
  });
  it("is a no-op under reduced motion, once seen, or with no children", () => {
    expect(revealPlan({ count: 5, reduced: true, seen: false })).toEqual({ animate: false, delays: [] });
    expect(revealPlan({ count: 5, reduced: false, seen: true }).animate).toBe(false);
    expect(revealPlan({ count: 0, reduced: false, seen: false }).animate).toBe(false);
  });
});

describe("liquidSpan", () => {
  const a = { offset: 0, width: 80 };
  const b = { offset: 200, width: 100 };
  it("spans both items, so the thumb stretches before it settles", () => {
    expect(liquidSpan(a, b, false)).toEqual({ offset: 0, width: 300 });
    expect(liquidSpan(b, a, false)).toEqual({ offset: 0, width: 300 });
  });
  it("is a no-op under reduced motion, on first measure, or when unmoved", () => {
    expect(liquidSpan(a, b, true)).toBeNull();
    expect(liquidSpan(null, b, false)).toBeNull();
    expect(liquidSpan(a, a, false)).toBeNull();
  });
});

describe("push/pop by route depth", () => {
  const ORDER: NavOrder = { adminApps: [], memberApps: [], sections: {} };
  it("a record under the page is a push, the way out a pop", () => {
    expect(pushOrPopByDepth("/admin/requests", "/admin/requests/42")).toBe("page-forward");
    expect(pushOrPopByDepth("/admin/requests/42", "/admin/requests")).toBe("page-back");
    expect(pushOrPopByDepth("/admin/requests", "/admin/members")).toBeNull();
  });
  it("beats the history direction when depth decides", () => {
    // Deep link then breadcrumb up: history says forward, depth says pop.
    expect(pickPageTransition("/x/y/1", "/x/y", ORDER, "forward")).toBe("page-back");
    expect(pickPageTransition("/x/y", "/x/z", ORDER, "back")).toBe("page-back");
  });
});

describe("reduced motion in CSS", () => {
  const css = readFileSync(resolve(process.cwd(), "core/app/assets/css/main.css"), "utf8");
  const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)", css.indexOf(".floor-back-enter-from")));
  // Apple swaps a slide for a short cross-fade (plan-apple-platform-direction
  // session 3): no transform, opacity only, over --motion-fade.
  it("page push/pop and floor slides become a --motion-fade cross-fade", () => {
    for (const cls of ["page-forward-enter-active", "page-back-leave-active", "page-forward-enter-from", "page-back-leave-to", "floor-forward-enter-from"]) {
      expect(reduced).toContain(`.${cls}`);
    }
    expect(reduced).toMatch(/transition:\s*opacity var\(--motion-fade, 150ms\) ease/);
    expect(reduced).toMatch(/transform:\s*none;\s*opacity:\s*0/);
  });
});
