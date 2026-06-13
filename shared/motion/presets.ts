// Shared, framework-free motion presets for @vueuse/motion `v-motion`.
//
// These build the `{ initial, enter }` variant objects used across the app's
// staggered entrances. The canonical idiom (Admin/SectionHub.vue + dashboard
// widgets) is a spring rise: opacity 0 → 1 with a small upward translate and a
// per-item delay. Keeping the math here (pure, `reduce`-parameterised) lets the
// resident-facing surfaces share ONE motion language with admin, and lets the
// reduced-motion behaviour be unit-tested without a DOM.
//
// `reduce` (prefers-reduced-motion) collapses every preset to an instant,
// transform-free reveal so nothing moves for users who asked it not to.

export interface MotionPreset {
  initial: Record<string, number>;
  enter: Record<string, unknown>;
}

/** Spring matching Admin/SectionHub + the admin dashboard widgets. */
export const RISE_SPRING = { type: "spring", stiffness: 220, damping: 28 } as const;

export interface RiseOptions {
  /** Upward offset (px) the element rises from. */
  y?: number;
  /** Per-item stagger step (ms). */
  stagger?: number;
  /** Base delay (ms) added before the staggered offset. */
  base?: number;
}

/**
 * Staggered spring rise. `i` is the item index; later items enter later.
 * Reduced motion → instant opacity-only reveal (no transform, no delay).
 */
export function risePreset(reduce: boolean, i = 0, opts: RiseOptions = {}): MotionPreset {
  if (reduce) return { initial: { opacity: 1 }, enter: { opacity: 1 } };
  const { y = 14, stagger = 40, base = 0 } = opts;
  return {
    initial: { opacity: 0, y },
    enter: {
      opacity: 1,
      y: 0,
      transition: { ...RISE_SPRING, delay: Math.max(0, base + i * stagger) },
    },
  };
}

/**
 * Simple fade-in (no translate) — for hero/banner blocks that shouldn't shift.
 * Reduced motion → instant reveal.
 */
export function fadePreset(reduce: boolean, opts: { base?: number; duration?: number } = {}): MotionPreset {
  if (reduce) return { initial: { opacity: 1 }, enter: { opacity: 1 } };
  const { base = 0, duration = 300 } = opts;
  return {
    initial: { opacity: 0 },
    enter: { opacity: 1, transition: { duration, delay: Math.max(0, base) } },
  };
}
