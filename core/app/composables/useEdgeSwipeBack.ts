// Drag from the left edge to go back.
//
// This completes the app's back story. The push/pop transition already makes
// "forward" slide left and "back" slide right (page-transition.global.ts), so
// the gesture is just the direct-manipulation way to do what the browser Back
// button does — and because it routes through router.back(), it unwinds the same
// visited-path stack and plays the same pop transition. One model, three ways in.
//
// TWO THINGS IT DELIBERATELY DOES NOT DO:
//
// 1. It does not run in an installed PWA. iOS already provides a native
//    edge-swipe there and it cannot be disabled, so ours would fire alongside it
//    and pop two entries for one gesture.
// 2. It does not run under reduced motion. The gesture IS the animation; a user
//    who asked for less movement still has the Back button.
//
// It also stays out of the way of horizontal content: the gesture must start
// within EDGE_PX of the left edge, and it aborts if the touch began inside
// something that scrolls sideways (a table, a carousel, the sub-nav).

/** How close to the left edge a drag must start, in px. */
const EDGE_PX = 24;
/** How far it must travel before we treat it as a back gesture. */
const COMMIT_PX = 70;
/** …or how fast, in px/ms, for a flick. */
const COMMIT_VELOCITY = 0.45;

function isStandalone(): boolean {
  if (!import.meta.client) return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // iOS Safari's non-standard flag, which is what actually reports installed
    // state on the platform this matters for.
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function prefersReduced(): boolean {
  return (
    import.meta.client &&
    !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
}

/** Did this gesture start inside something the user might be scrolling sideways? */
function startedInHorizontalScroller(target: EventTarget | null): boolean {
  let el = target as HTMLElement | null;
  while (el && el !== document.body) {
    if (el.scrollWidth > el.clientWidth + 4) {
      const overflow = getComputedStyle(el).overflowX;
      if (overflow === "auto" || overflow === "scroll") return true;
    }
    el = el.parentElement;
  }
  return false;
}

export function useEdgeSwipeBack() {
  if (!import.meta.client) return;

  const router = useRouter();

  let startX = 0;
  let startY = 0;
  let startTime = 0;
  let tracking = false;
  let committed = false;

  function onTouchStart(e: TouchEvent) {
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    if (t.clientX > EDGE_PX) return;
    if (startedInHorizontalScroller(e.target)) return;

    tracking = true;
    committed = false;
    startX = t.clientX;
    startY = t.clientY;
    startTime = e.timeStamp;
  }

  function onTouchMove(e: TouchEvent) {
    if (!tracking || committed) return;
    const t = e.touches[0];
    const dx = t.clientX - startX;
    const dy = t.clientY - startY;

    // Vertical intent wins — this should never steal a scroll.
    if (Math.abs(dy) > Math.abs(dx)) {
      tracking = false;
      return;
    }

    const velocity = dx / Math.max(1, e.timeStamp - startTime);
    if (dx > COMMIT_PX || velocity > COMMIT_VELOCITY) {
      committed = true;
      tracking = false;
      router.back();
    }
  }

  function onTouchEnd() {
    tracking = false;
  }

  onMounted(() => {
    if (isStandalone() || prefersReduced()) return;
    // Passive: we never preventDefault, so the browser keeps its fast path.
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    window.addEventListener("touchcancel", onTouchEnd, { passive: true });
  });

  onUnmounted(() => {
    window.removeEventListener("touchstart", onTouchStart);
    window.removeEventListener("touchmove", onTouchMove);
    window.removeEventListener("touchend", onTouchEnd);
    window.removeEventListener("touchcancel", onTouchEnd);
  });
}
