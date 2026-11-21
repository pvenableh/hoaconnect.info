/**
 * useSharedElement — a row or tile grows into its slide-over or sheet, and
 * shrinks back. Capture the source box when it is clicked; when the
 * destination is mounted, `grow` plays it from that box to its own (WAAPI,
 * transform only, so it runs on the compositor). `shrink` plays it back into
 * the source's current box and resolves, so a caller can unmount after it.
 * No-op under reduced motion (see `sharedElementPlan`).
 */
import { EASING, prefersReducedMotion, sharedElementPlan, type Rect } from "#core/shared/motion";

function rectOf(el: Element | null | undefined): Rect | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, width: r.width, height: r.height };
}

export function useSharedElement() {
  let source: Element | null = null;
  let sourceRect: Rect | null = null;

  function capture(el: Element | null | undefined) {
    source = el ?? null;
    sourceRect = rectOf(el);
  }

  async function grow(dest: HTMLElement | null | undefined): Promise<boolean> {
    if (!dest || typeof dest.animate !== "function") return false;
    const plan = sharedElementPlan(sourceRect, rectOf(dest), prefersReducedMotion());
    if (!plan.animate) return false;
    const { dx, dy, sx, sy } = plan.from;
    const a = dest.animate(
      [
        { transformOrigin: "top left", transform: `translate3d(${dx}px, ${dy}px, 0) scale(${sx}, ${sy})`, opacity: 0.6 },
        { transformOrigin: "top left", transform: "none", opacity: 1 },
      ],
      { duration: plan.duration * 1000, easing: EASING.springOut },
    );
    await a.finished.catch(() => undefined);
    return true;
  }

  async function shrink(dest: HTMLElement | null | undefined): Promise<boolean> {
    if (!dest || typeof dest.animate !== "function") return false;
    // Measure the source now: the list may have scrolled since capture.
    const plan = sharedElementPlan(rectOf(source) ?? sourceRect, rectOf(dest), prefersReducedMotion());
    if (!plan.animate) return false;
    const { dx, dy, sx, sy } = plan.from;
    const a = dest.animate(
      [
        { transformOrigin: "top left", transform: "none", opacity: 1 },
        { transformOrigin: "top left", transform: `translate3d(${dx}px, ${dy}px, 0) scale(${sx}, ${sy})`, opacity: 0 },
      ],
      { duration: plan.duration * 1000 * 0.75, easing: EASING.exit, fill: "forwards" },
    );
    await a.finished.catch(() => undefined);
    return true;
  }

  return { capture, grow, shrink };
}
