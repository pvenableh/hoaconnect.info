/**
 * useFlipFromRow — pull-from-anywhere primitive (ported from Earnest).
 *
 * Captures a source element's bounding rect + outerHTML so a slide-over
 * shell can FLIP that row into its hero slot on open. The shell handles the
 * actual animation via inline-style transform + CSS transition — compositor
 * only, no GSAP ticker, so it survives throttled/headless environments.
 *
 * Usage from a row-click handler:
 *   const slide = useAppSlideOver("request");
 *   function openRow(item, ev) {
 *     slide.open(item.id, { flipFrom: flipPayloadFrom(ev.currentTarget as HTMLElement) });
 *   }
 */
export interface FlipFromPayload {
  rect: { x: number; y: number; width: number; height: number };
  html: string;
}

export function useFlipFromRow() {
  const flipFrom = ref<FlipFromPayload | null>(null);

  function captureFromEl(el: HTMLElement | null | undefined) {
    if (!el) {
      flipFrom.value = null;
      return;
    }
    flipFrom.value = flipPayloadFrom(el) ?? null;
  }

  function clear() {
    flipFrom.value = null;
  }

  return { flipFrom, captureFromEl, clear };
}

/**
 * One-shot helper: build a FlipFromPayload from an element without holding
 * any reactive state. The slide-over stack stashes the payload globally and
 * consumes it inside the shell's onMounted hook.
 */
export function flipPayloadFrom(el: HTMLElement | null | undefined): FlipFromPayload | undefined {
  if (!el) return undefined;
  const r = el.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return undefined;
  return {
    rect: { x: r.left, y: r.top, width: r.width, height: r.height },
    html: el.outerHTML,
  };
}
