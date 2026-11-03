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
  longestTransitionMs,
  settleTransition,
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

describe("longestTransitionMs()", () => {
  it("takes the longest duration + delay pair, in ms", () => {
    expect(longestTransitionMs({ transitionDuration: "0.3s, 240ms", transitionDelay: "0s, 100ms" })).toBe(340);
  });
  it("is 0 with no transition", () => {
    expect(longestTransitionMs({ transitionDuration: "0s", transitionDelay: "0s" })).toBe(0);
    expect(longestTransitionMs({ transitionDuration: "", transitionDelay: "" })).toBe(0);
  });
});

// The page swap must never wait on transitionend alone: a headless or hidden
// tab may not deliver it, and an out-in swap that never ends strands the old
// page on screen with the new one never mounted.
describe("settleTransition()", () => {
  afterEach(() => vi.useRealTimers());

  it("ends at once when there is nothing to animate (reduced motion)", () => {
    const el = document.createElement("div");
    const done = vi.fn();
    settleTransition()(el, done);
    expect(done).toHaveBeenCalledTimes(1);
  });

  it("ends at once, without throwing, for a comment node (an empty page root)", () => {
    const done = vi.fn();
    expect(() => settleTransition()(document.createComment("") as unknown as Element, done)).not.toThrow();
    expect(done).toHaveBeenCalledTimes(1);
  });

  it("ends on the element's own transitionend, once", () => {
    vi.useFakeTimers();
    const el = document.createElement("div");
    el.style.transitionProperty = "opacity";
    el.style.transitionDuration = "300ms";
    document.body.appendChild(el);
    const done = vi.fn();
    settleTransition()(el, done);
    const child = document.createElement("span");
    el.appendChild(child);
    child.dispatchEvent(new Event("transitionend", { bubbles: true }));
    expect(done).not.toHaveBeenCalled();
    el.dispatchEvent(new Event("transitionend"));
    vi.advanceTimersByTime(1000);
    expect(done).toHaveBeenCalledTimes(1);
    el.remove();
  });

  it("ends anyway when transitionend never comes", () => {
    vi.useFakeTimers();
    const el = document.createElement("div");
    el.style.transitionProperty = "opacity";
    el.style.transitionDuration = "300ms";
    document.body.appendChild(el);
    const done = vi.fn();
    settleTransition(100)(el, done);
    vi.advanceTimersByTime(399);
    expect(done).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2);
    expect(done).toHaveBeenCalledTimes(1);
    el.remove();
  });
});
