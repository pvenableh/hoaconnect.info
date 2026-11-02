import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  EASING,
  EASING_VARS,
  DURATION,
  DURATION_VARS,
  transition,
  afterFirstFrame,
} from "#core/shared/motion";

const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), "utf8");

// The first `:root { … }` block in variables.css is the token sheet; the
// reduced-motion override further down redeclares the same names, so only the
// first declaration of each is the real value.
const css = read("core/app/assets/css/variables.css");
const firstDecl = (name: string) => {
  const m = css.match(new RegExp(`${name}:\\s*([^;]+);`));
  return m?.[1].trim();
};

describe("motion tokens — TS module and CSS twin agree", () => {
  it.each(Object.entries(EASING_VARS))("%s ↔ %s", (key, cssVar) => {
    expect(firstDecl(cssVar)).toBe(EASING[key as keyof typeof EASING]);
  });

  it.each(Object.entries(DURATION_VARS))("%s ↔ %s", (key, cssVar) => {
    expect(firstDecl(cssVar)).toBe(`${DURATION[key as keyof typeof DURATION]}ms`);
  });

  it("reduced motion flattens every curve and collapses every duration", () => {
    const block = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    for (const v of Object.values(EASING_VARS)) expect(block).toMatch(new RegExp(`${v}:\\s*linear`));
    for (const v of Object.values(DURATION_VARS)) expect(block).toMatch(new RegExp(`${v}:\\s*1ms`));
  });
});

describe("transition()", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reads the token with the literal as its fallback", () => {
    expect(transition("transform", "panel")).toBe(
      `transform 460ms var(--spring, ${EASING.spring})`,
    );
    expect(transition("opacity", 120, "exit")).toBe(`opacity 120ms var(--ease-exit, ${EASING.exit})`);
  });

  it("is `none` under prefers-reduced-motion", () => {
    vi.stubGlobal("window", { matchMedia: () => ({ matches: true }) });
    expect(transition("transform")).toBe("none");
  });
});

describe("afterFirstFrame()", () => {
  it("still runs when requestAnimationFrame never fires (background tab)", () => {
    vi.useFakeTimers();
    vi.stubGlobal("requestAnimationFrame", () => 1);
    const fn = vi.fn();
    afterFirstFrame(fn);
    vi.advanceTimersByTime(60);
    expect(fn).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("can be cancelled", () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const cancel = afterFirstFrame(fn);
    cancel();
    vi.advanceTimersByTime(100);
    expect(fn).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
