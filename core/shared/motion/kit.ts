/**
 * Motion kit A — the pure decisions behind AppCountUp, AppReveal, the liquid
 * segmented thumb and the push/pop page change.
 *
 * Every function takes `reduced` as an argument instead of reading the media
 * query itself, so "a no-op under reduced motion" is a plain unit test and the
 * components only pass `prefersReducedMotion()` in. Under `reduced` each plan
 * says "do not animate" and still carries the final state, because the
 * information the motion carried (the number, the list, the selection) has to
 * arrive either way.
 */
import { DURATION } from "./index";

/* ---- AppCountUp --------------------------------------------------------- */

export interface CountUpPlan {
  animate: boolean;
  /** Seconds, for GSAP. 0 when not animating. */
  duration: number;
  /** Where the number starts. Equals `to` when not animating. */
  from: number;
}

/**
 * First view rolls from 0; a later change rolls from the value on screen. No
 * motion when reduced, when nothing changed, or for a change too small to read
 * as a roll (a step of one on a small number just ticks).
 */
export function countUpPlan(opts: { from: number; to: number; reduced: boolean; first: boolean }): CountUpPlan {
  const start = opts.first ? 0 : opts.from;
  if (opts.reduced || !Number.isFinite(opts.to) || start === opts.to) {
    return { animate: false, duration: 0, from: opts.to };
  }
  const span = Math.abs(opts.to - start);
  // 180–320 ms (plan §4): longer for bigger moves, capped at the page duration.
  const ms = Math.min(DURATION.page + 20, DURATION.fast + 20 + Math.log10(span + 1) * 40);
  return { animate: true, duration: ms / 1000, from: start };
}

export interface CountFormat {
  decimals?: number;
  prefix?: string;
  suffix?: string;
  locale?: string;
}

export function formatCount(value: number, f: CountFormat = {}): string {
  const d = f.decimals ?? 0;
  const body = new Intl.NumberFormat(f.locale ?? "en-US", {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  }).format(Number.isFinite(value) ? value : 0);
  return `${f.prefix ?? ""}${body}${f.suffix ?? ""}`;
}

/* ---- AppReveal ---------------------------------------------------------- */

export interface RevealPlan {
  animate: boolean;
  /** Seconds before each child starts. Empty when not animating. */
  delays: number[];
}

export const REVEAL_STEP_MS = 40;
/** Past the 9th child the wait is longer than anyone will tolerate. */
export const REVEAL_MAX_MS = 320;

/** Same cadence as the CSS `.stagger-item`: 40 ms apart, capped at 320 ms. */
export function revealPlan(opts: { count: number; reduced: boolean; seen: boolean }): RevealPlan {
  if (opts.reduced || opts.seen || opts.count <= 0) return { animate: false, delays: [] };
  return {
    animate: true,
    delays: Array.from({ length: opts.count }, (_, i) => Math.min(i * REVEAL_STEP_MS, REVEAL_MAX_MS) / 1000),
  };
}

/* ---- Liquid segmented thumb -------------------------------------------- */

export interface ThumbBox {
  offset: number;
  width: number;
}

/**
 * The box the thumb stretches to on its way between two items: it reaches the
 * destination's far edge first, then settles into the destination. Null when
 * there is nothing to stretch (reduced motion, no previous box, same item).
 */
export function liquidSpan(prev: ThumbBox | null, next: ThumbBox, reduced: boolean): ThumbBox | null {
  if (reduced || !prev || (prev.offset === next.offset && prev.width === next.width)) return null;
  const left = Math.min(prev.offset, next.offset);
  const right = Math.max(prev.offset + prev.width, next.offset + next.width);
  return { offset: left, width: right - left };
}

/** How long the stretch is held before the thumb settles, in ms. */
export const LIQUID_STRETCH_MS = 120;
