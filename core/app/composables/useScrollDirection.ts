// useScrollDirection — shared scroll state for auto-hiding chrome (e.g. the
// public landing header that retracts on scroll-down, reveals on scroll-up).
// One listener, shared module-level state across all callers. SSR-safe.
//
// Ported from the 1033lenox.com header pattern (the reference for the editorial
// landing). 10px dead-zone debounces jitter; throttled to ~50ms.

import { useThrottleFn } from "@vueuse/core";

const isScrollingDown = ref(false);
const scrollY = ref(0);
const previousScrollY = ref(0);
const isScrolled = ref(false);

let isInitialized = false;

export function useScrollDirection() {
  const handleScroll = useThrottleFn(() => {
    const currentScrollY = window.scrollY;
    // Only flip direction past a 10px dead-zone (ignore tiny movements).
    if (Math.abs(currentScrollY - previousScrollY.value) > 10) {
      isScrollingDown.value = currentScrollY > previousScrollY.value && currentScrollY > 10;
      previousScrollY.value = currentScrollY;
    }
    scrollY.value = currentScrollY;
    isScrolled.value = currentScrollY > 10;
  }, 50);

  onMounted(() => {
    if (isInitialized) return;
    window.addEventListener("scroll", handleScroll, { passive: true });
    isInitialized = true;
  });
  // The listener is shared; intentionally left attached across unmounts.

  return {
    isScrollingDown: readonly(isScrollingDown),
    scrollY: readonly(scrollY),
    isScrolled: readonly(isScrolled),
  };
}
