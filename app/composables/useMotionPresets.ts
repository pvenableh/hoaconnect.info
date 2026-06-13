// useMotionPresets — resident/admin shared entrance-motion helpers.
//
// Wraps the pure `shared/motion/presets.ts` builders with a one-shot
// prefers-reduced-motion read (matchMedia, client-only). Returns functions that
// produce `{ initial, enter }` objects to spread onto an element:
//
//   const { rise } = useMotionPresets();
//   <div v-motion v-bind="rise(i)"> … </div>
//
// `v-bind` sets `initial`/`enter` as props the v-motion directive consumes, so
// this stays consistent with the attribute form already used in SectionHub.
//
// The reduced-motion check is read synchronously at setup (during client
// hydration) — entrance animations don't need to react to mid-session changes,
// matching App/Sidebar's existing one-shot approach.

import { fadePreset, risePreset, type RiseOptions } from "~~/shared/motion/presets";

export function useMotionPresets() {
  const reduce =
    import.meta.client &&
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const rise = (i = 0, opts: RiseOptions = {}) => risePreset(!!reduce, i, opts);
  const fade = (opts: { base?: number; duration?: number } = {}) => fadePreset(!!reduce, opts);

  return { reduce: !!reduce, rise, fade };
}
