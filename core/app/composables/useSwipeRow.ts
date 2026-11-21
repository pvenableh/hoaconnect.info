/**
 * useSwipeRow — swipe a row left for its one or two actions, on touch.
 * Mouse is ignored (a pointer has the row's menu). The row lets go as soon as
 * the gesture turns vertical, so scrolling a list is never stolen. Decisions
 * live in core/shared/motion/kit-b.ts.
 */
import { swipeIntent, swipeOffset, swipeSettle } from "#core/shared/motion";

export function useSwipeRow(opts: { actionWidth: number }) {
  const offset = ref(0);
  const open = ref(false);
  const dragging = ref(false);
  let startX = 0;
  let startY = 0;
  let base = 0;
  let lastX = 0;
  let lastT = 0;
  let prevX = 0;
  let prevT = 0;
  let intent: "swipe" | "scroll" | "undecided" = "undecided";

  function onPointerDown(e: PointerEvent) {
    if (e.pointerType === "mouse") return;
    startX = lastX = prevX = e.clientX;
    startY = e.clientY;
    lastT = prevT = e.timeStamp;
    base = open.value ? -opts.actionWidth : 0;
    intent = "undecided";
    dragging.value = true;
  }

  function onPointerMove(e: PointerEvent) {
    if (!dragging.value) return;
    const dx = e.clientX - startX;
    if (intent === "undecided") intent = swipeIntent(dx, e.clientY - startY);
    if (intent === "scroll") {
      dragging.value = false;
      return;
    }
    if (intent !== "swipe") return;
    try {
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    } catch {
      /* a pointer that already ended */
    }
    prevX = lastX;
    prevT = lastT;
    lastX = e.clientX;
    lastT = e.timeStamp;
    offset.value = swipeOffset(dx, base, opts.actionWidth);
  }

  function onPointerUp() {
    if (!dragging.value) return;
    dragging.value = false;
    if (intent !== "swipe") return;
    const velocity = (lastX - prevX) / Math.max(1, lastT - prevT);
    open.value = swipeSettle({ offset: offset.value, velocity, actionWidth: opts.actionWidth, wasOpen: base !== 0 });
    offset.value = open.value ? -opts.actionWidth : 0;
  }

  function close() {
    open.value = false;
    offset.value = 0;
  }

  return {
    offset,
    open,
    dragging,
    close,
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp },
  };
}
