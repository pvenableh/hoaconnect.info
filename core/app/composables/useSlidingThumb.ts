// Measures where the "selected" capsule should sit in a row of items.
//
// Segmented controls, tab bars and the section sub-nav all show the same thing:
// a floating thumb that slides to whichever item is active. Sharing the geometry
// means they slide identically — same measurement, same easing — which is what
// makes the control feel like one learned object rather than three lookalikes.
//
// Equal-width items could be done with a `translateX(index * 100%)` and no JS at
// all, but real tab labels are not equal width ("Overview" vs "AI spend"), so the
// thumb has to be measured. A ResizeObserver keeps it correct through font
// loading, container resizes, and label changes.

import type { Ref, CSSProperties } from "vue";

export interface SlidingThumbOptions {
  /**
   * Reflow when this changes — pass anything that alters item widths (the item
   * list itself, a density setting, a label-collapse breakpoint).
   */
  watchSource?: () => unknown;
}

export function useSlidingThumb(
  activeIndex: Ref<number>,
  options: SlidingThumbOptions = {},
) {
  const trackEl = ref<HTMLElement | null>(null);
  // Index-for-index with the items. Deliberately NOT filtered/compacted: a
  // sparse array whose holes line up with skipped items is far easier to reason
  // about than one whose indices have silently shifted.
  const itemEls = ref<(HTMLElement | null)[]>([]);
  const offset = ref(0);
  const width = ref(0);
  const measured = ref(false);

  /**
   * Template refs hand back an Element for a plain tag but a component INSTANCE
   * for a component, and the items here are both: buttons in the segmented
   * control, NuxtLinks in the section sub-nav. Unwrap to the underlying element,
   * or ResizeObserver.observe() throws on the instance.
   */
  function toElement(
    el: Element | ComponentPublicInstance | null,
  ): HTMLElement | null {
    if (!el) return null;
    const candidate = "$el" in el ? (el as ComponentPublicInstance).$el : el;
    return candidate instanceof HTMLElement ? candidate : null;
  }

  function setItemRef(index: number) {
    return (el: Element | ComponentPublicInstance | null) => {
      itemEls.value[index] = toElement(el);
    };
  }

  function measure() {
    const el = itemEls.value[activeIndex.value];
    if (!el || !trackEl.value) {
      // No active item (index -1, or a filtered-out tab): leave the thumb where
      // it is and let the caller fade it out. Snapping it to 0 would read as
      // "the first tab is selected", which is a lie.
      measured.value = false;
      return;
    }
    offset.value = el.offsetLeft;
    width.value = el.offsetWidth;
    measured.value = true;
  }

  /** Bind to the thumb element. Transform-only, so it animates on the compositor. */
  const thumbStyle = computed<CSSProperties>(() => ({
    transform: `translate3d(${offset.value}px, 0, 0)`,
    width: `${width.value}px`,
    opacity: measured.value ? 1 : 0,
  }));

  let ro: ResizeObserver | null = null;

  onMounted(async () => {
    await nextTick();
    measure();
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => measure());
      const observe = (el: unknown) => {
        if (el instanceof Element) ro?.observe(el);
      };
      observe(trackEl.value);
      for (const el of itemEls.value) observe(el);
    }
    // Web fonts land after first paint and change every label's width.
    if (import.meta.client && "fonts" in document) {
      document.fonts.ready.then(() => measure()).catch(() => {});
    }
  });

  onUnmounted(() => {
    ro?.disconnect();
    ro = null;
  });

  watch(activeIndex, async () => {
    await nextTick();
    measure();
  });

  if (options.watchSource) {
    watch(options.watchSource, async () => {
      await nextTick();
      measure();
    });
  }

  return { trackEl, setItemRef, thumbStyle, measure, measured };
}
