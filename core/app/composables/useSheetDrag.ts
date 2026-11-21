/**
 * useSheetDrag — drag a bottom sheet down to dismiss, with velocity and
 * rubber-band. Decisions live in core/shared/motion/kit-b.ts; this holds the
 * pointer state. Bind `handlers` to the grabber only, so scrolling a form or
 * selecting text never dismisses the sheet. Escape and the backdrop stay with
 * the sheet itself.
 */
import { sheetDragOffset, sheetRelease } from "#core/shared/motion";

export function useSheetDrag(opts: {
  enabled: () => boolean;
  height: () => number;
  onDismiss: () => void;
  onSnapBack?: () => void;
}) {
  const dragY = ref(0);
  const dragging = ref(false);
  const thrown = ref(false);
  let startY = 0;
  let startTime = 0;
  let lastY = 0;
  let lastTime = 0;

  function onPointerDown(e: PointerEvent) {
    if (!opts.enabled()) return;
    dragging.value = true;
    startY = lastY = e.clientY;
    startTime = lastTime = e.timeStamp;
    try {
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    } catch {
      /* a pointer that already ended */
    }
  }

  function onPointerMove(e: PointerEvent) {
    if (!dragging.value) return;
    dragY.value = sheetDragOffset(e.clientY - startY);
    lastY = e.clientY;
    lastTime = e.timeStamp;
  }

  function onPointerUp() {
    if (!dragging.value) return;
    dragging.value = false;
    const velocity = (lastY - startY) / Math.max(1, lastTime - startTime);
    const r = sheetRelease({ offset: dragY.value, velocity, height: opts.height() });
    dragY.value = r.to;
    if (r.dismiss) {
      thrown.value = true;
      opts.onDismiss();
    } else {
      opts.onSnapBack?.();
    }
  }

  function reset() {
    dragY.value = 0;
    thrown.value = false;
    dragging.value = false;
  }

  return {
    dragY,
    dragging,
    thrown,
    reset,
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp },
  };
}
