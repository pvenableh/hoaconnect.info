/**
 * Motion kit B — the pure decisions behind useSharedElement, useSheetDrag,
 * useSwipeRow and AppLargeTitle.
 *
 * Same rule as kit A: every function takes `reduced` (or has no motion at all),
 * so "a no-op under reduced motion" is a plain unit test. Under `reduced` a plan
 * says "do not animate" and still carries the end state.
 */
import { DURATION } from "./index";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/* ---- useSharedElement --------------------------------------------------- */

export interface SharedElementPlan {
  animate: boolean;
  /** Seconds. */
  duration: number;
  /** Transform that puts the destination where the source is (apply, then release to none). */
  from: { dx: number; dy: number; sx: number; sy: number };
}

/** A row grows into its panel: the destination starts as the source's box. */
export function sharedElementPlan(source: Rect | null, dest: Rect | null, reduced: boolean): SharedElementPlan {
  const none = { animate: false, duration: 0, from: { dx: 0, dy: 0, sx: 1, sy: 1 } };
  if (reduced || !source || !dest) return none;
  if (source.width <= 0 || source.height <= 0 || dest.width <= 0 || dest.height <= 0) return none;
  return {
    animate: true,
    duration: DURATION.page / 1000,
    from: {
      dx: source.x - dest.x,
      dy: source.y - dest.y,
      sx: source.width / dest.width,
      sy: source.height / dest.height,
    },
  };
}

/* ---- useSheetDrag ------------------------------------------------------- */

/** Past either of these on release, the sheet goes rather than springs back. */
export const SHEET_DISMISS_DISTANCE = 100;
export const SHEET_DISMISS_VELOCITY = 0.5; // px per ms
export const SHEET_RUBBER_BAND = 0.3;

/** Downward tracks the finger 1:1; upward rubber-bands. */
export function sheetDragOffset(delta: number): number {
  return delta >= 0 ? delta : delta * SHEET_RUBBER_BAND;
}

export interface SheetRelease {
  dismiss: boolean;
  /** Where the panel should end up, in px from its open position. */
  to: number;
}

export function sheetRelease(opts: { offset: number; velocity: number; height: number }): SheetRelease {
  const go = opts.offset > SHEET_DISMISS_DISTANCE || opts.velocity > SHEET_DISMISS_VELOCITY;
  return go ? { dismiss: true, to: opts.height + 40 } : { dismiss: false, to: 0 };
}

/* ---- useSwipeRow -------------------------------------------------------- */

/** Travel before the gesture decides between swiping and scrolling. */
export const SWIPE_LOCK_PX = 8;
export const SWIPE_OPEN_FRACTION = 0.4;
export const SWIPE_OPEN_VELOCITY = 0.4;

/**
 * Which way a pointer move is going: `swipe` once horizontal travel wins,
 * `scroll` once vertical does (the row then lets go), `undecided` until then.
 */
export function swipeIntent(dx: number, dy: number): "swipe" | "scroll" | "undecided" {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (Math.max(ax, ay) < SWIPE_LOCK_PX) return "undecided";
  return ax > ay ? "swipe" : "scroll";
}

/**
 * Row offset for a drag: the row follows the finger toward the actions
 * (negative x), up to the actions' width, then rubber-bands past it. Dragging
 * the other way from closed barely moves.
 */
export function swipeOffset(delta: number, base: number, actionWidth: number): number {
  const raw = base + delta;
  if (raw > 0) return raw * SHEET_RUBBER_BAND * 0.5;
  if (raw < -actionWidth) return -actionWidth + (raw + actionWidth) * SHEET_RUBBER_BAND;
  return raw;
}

export function swipeSettle(opts: { offset: number; velocity: number; actionWidth: number; wasOpen: boolean }): boolean {
  // velocity is signed px/ms; negative is toward the actions.
  if (opts.velocity < -SWIPE_OPEN_VELOCITY) return true;
  if (opts.velocity > SWIPE_OPEN_VELOCITY) return false;
  return Math.abs(opts.offset) > opts.actionWidth * SWIPE_OPEN_FRACTION && (opts.wasOpen || opts.offset < 0);
}

/* ---- AppLargeTitle ------------------------------------------------------ */

/**
 * 0 while the large title is fully in view, 1 once it has collapsed into the
 * bar. Reduced motion snaps at the halfway point instead of scrubbing.
 */
export function largeTitleProgress(scrollY: number, range: number, reduced: boolean): number {
  if (!(range > 0)) return scrollY > 0 ? 1 : 0;
  const p = Math.min(1, Math.max(0, scrollY / range));
  return reduced ? (p >= 0.5 ? 1 : 0) : p;
}
