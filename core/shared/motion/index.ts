/**
 * The workspace's motion vocabulary — one source for every curve and duration.
 *
 * The CSS twin is `core/app/assets/css/variables.css` (`--spring`, `--motion-*`,
 * …). The two must agree; `tests/shared/motion-tokens.test.ts` reads the CSS and
 * fails on any drift. Reach for the CSS custom property in a stylesheet and for
 * this module only where motion is driven from script (an inline `transition`
 * string, a Web Animations call, a timer that has to outlast an animation).
 *
 *   spring       — iOS view-controller push (Framework7's spring). Positional moves.
 *   springOut    — sheet settle: fast out, long soft landing. Things arriving.
 *   springBounce — a small overshoot. Badges, a toggle knob — never a panel.
 *   easeOutExpo  — hovers and rims: immediate, then settles.
 *   exit         — leaving. Quicker than an enter and accelerating, because
 *                  the user has already decided to go.
 *
 * Overlay motion policy (ported from Earnest): a hand-rolled overlay mounts in
 * its CLOSED pose, then flips its inline transform after one frame
 * (`afterFirstFrame`), and the compositor transition does the rest. No Vue
 * `<Transition>` for overlays — it swaps its enter classes inside a
 * requestAnimationFrame callback, which stalls in a background tab and leaves
 * the panel parked half-open. Reka-backed overlays (Dialog, Sheet, Popover…)
 * animate with tw-animate-css keyframes instead and are already compliant.
 */

export const EASING = {
  spring: "cubic-bezier(0.36, 0.66, 0.04, 1)",
  springOut: "cubic-bezier(0.32, 0.72, 0, 1)",
  springBounce: "cubic-bezier(0.34, 1.56, 0.64, 1)",
  easeOutExpo: "cubic-bezier(0.16, 1, 0.3, 1)",
  exit: "cubic-bezier(0.4, 0, 1, 1)",
} as const;

/** Milliseconds. */
export const DURATION = {
  fast: 160,
  base: 240,
  page: 300,
  panel: 460,
} as const;

export type EasingName = keyof typeof EASING;
export type DurationName = keyof typeof DURATION;

/** The CSS custom property each token is published as. */
export const EASING_VARS: Record<EasingName, string> = {
  spring: "--spring",
  springOut: "--spring-out",
  springBounce: "--spring-bounce",
  easeOutExpo: "--ease-out-expo",
  exit: "--ease-exit",
};

export const DURATION_VARS: Record<DurationName, string> = {
  fast: "--motion-fast",
  base: "--motion-base",
  page: "--motion-page",
  panel: "--motion-panel",
};

/** True when the user asked the OS for less motion. SSR-safe (false). */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * A `transition` value for script-driven motion, e.g.
 * `transition("transform", "panel", "spring")` →
 * `"transform 460ms var(--spring, cubic-bezier(...))"`. Under reduced motion it
 * returns `"none"`, so an inline style cannot sneak a spring past the media
 * query the stylesheets honour.
 */
export function transition(
  property: string,
  duration: DurationName | number = "base",
  easing: EasingName = "spring",
): string {
  if (prefersReducedMotion()) return "none";
  const ms = typeof duration === "number" ? duration : DURATION[duration];
  return `${property} ${ms}ms var(${EASING_VARS[easing]}, ${EASING[easing]})`;
}

/**
 * Run `fn` once the closed pose has painted — the second half of the overlay
 * policy above. requestAnimationFrame alone is not enough: it does not fire in
 * a background tab, so a timeout races it and whichever lands first wins.
 * Returns a cancel function.
 */
export function afterFirstFrame(fn: () => void): () => void {
  let done = false;
  const run = () => {
    if (done) return;
    done = true;
    fn();
  };
  const raf =
    typeof requestAnimationFrame === "function"
      ? requestAnimationFrame(() => requestAnimationFrame(run))
      : null;
  const timer = setTimeout(run, 50);
  return () => {
    done = true;
    if (raf !== null && typeof cancelAnimationFrame === "function") cancelAnimationFrame(raf);
    clearTimeout(timer);
  };
}
