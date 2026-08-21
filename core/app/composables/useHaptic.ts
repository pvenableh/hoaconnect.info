// Small physical confirmations for actions that already happened.
//
// Fires on the CAUSING event — the toggle flipping, a sheet snapping to a
// detent, a swipe committing — not on release, so the feedback lands with the
// thing it is confirming.
//
// iOS Safari does not implement the Vibration API, so on the platform this
// design language comes from these are no-ops. That is fine and deliberate: the
// visual press state (scale 0.97, see earnest-ui.css) is the real feedback, and
// haptics are a bonus where the platform allows them. Never make a haptic the
// only signal that something worked.

const PATTERNS = {
  /** A tap landed. */
  light: 10,
  /** A selection changed. */
  medium: 25,
  /** Something significant committed. */
  heavy: 50,
  /** A detent/snap point was reached. */
  detent: 6,
  success: [10, 30, 10],
  warning: [20, 40, 20],
  error: [40, 30, 40, 30, 40],
} as const;

export type HapticPattern = keyof typeof PATTERNS;

export function useHaptic() {
  const supported = () =>
    import.meta.client &&
    typeof navigator !== "undefined" &&
    typeof navigator.vibrate === "function";

  /** Users who asked for less motion get less buzzing too. */
  const allowed = () => {
    if (!supported()) return false;
    return !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  };

  function fire(pattern: HapticPattern = "light") {
    if (!allowed()) return;
    try {
      navigator.vibrate(PATTERNS[pattern] as number | number[]);
    } catch {
      // A vibrate() that throws must never take an interaction down with it.
    }
  }

  return {
    fire,
    tap: () => fire("light"),
    selection: () => fire("medium"),
    detentSnap: () => fire("detent"),
    success: () => fire("success"),
    error: () => fire("error"),
  };
}
