// Make a list REARRANGE instead of blink.
//
// When a sort, filter or reorder changes a list, the naive result is that the
// old rows vanish and new ones appear in place. The reader has no way to tell
// whether a row moved, was removed, or was replaced, so they re-read the whole
// list. FLIP (First, Last, Invert, Play) fixes that: measure where things were,
// let the DOM change, then animate from the old positions to the new ones. Rows
// visibly travel to where they went, and the reader can follow them.
//
// This is one of the few places a JS ticker earns its keep — the browser cannot
// transition a change of DOM order on its own.
//
// Usage: call `capture()` immediately BEFORE mutating the list, then `play()`
// after the DOM has updated.
//
//   const list = ref<HTMLElement | null>(null);
//   const flip = useFlipList(list);
//   async function sortBy(key) {
//     flip.capture();
//     rows.value = sorted(rows.value, key);
//     await flip.play();
//   }

import type { Ref } from "vue";

export interface FlipListOptions {
  /** CSS selector for the animating children, relative to the container. */
  itemSelector?: string;
  /** Seconds. Kept short: this is orientation, not decoration. */
  duration?: number;
  /** Per-item offset, seconds. */
  stagger?: number;
  /** Animate items entering and leaving as well as moving. */
  animateEnterLeave?: boolean;
}

export function useFlipList(
  container: Ref<HTMLElement | null>,
  options: FlipListOptions = {},
) {
  const {
    itemSelector = "[data-flip-id]",
    duration = 0.4,
    stagger = 0.015,
    animateEnterLeave = true,
  } = options;

  let state: unknown = null;

  const reduced = () =>
    import.meta.client &&
    !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  function items(): Element[] {
    const el = container.value;
    return el ? Array.from(el.querySelectorAll(itemSelector)) : [];
  }

  /** Record current positions. Call immediately before changing the list. */
  function capture() {
    if (!import.meta.client || reduced()) return;
    const { $Flip } = useNuxtApp() as unknown as {
      $Flip?: typeof import("gsap/Flip").Flip;
    };
    if (!$Flip) return;
    state = $Flip.getState(items());
  }

  /** Animate from the recorded positions to wherever things are now. */
  async function play() {
    if (!import.meta.client || !state) return;
    const { $Flip } = useNuxtApp() as unknown as {
      $Flip?: typeof import("gsap/Flip").Flip;
    };
    if (!$Flip) return;

    // The DOM has to have settled, or we measure the old layout as the new one.
    await nextTick();

    $Flip.from(state as never, {
      duration,
      stagger,
      // Matches the house spring's feel without the overshoot — a row
      // overshooting its slot reads as sloppy rather than lively.
      ease: "power3.out",
      absolute: true,
      ...(animateEnterLeave
        ? { onEnter: (els: Element[]) => enter(els), onLeave: (els: Element[]) => leave(els) }
        : {}),
    });
    state = null;
  }

  function enter(els: Element[]) {
    const { $gsap } = useNuxtApp() as unknown as {
      $gsap?: typeof import("gsap").gsap;
    };
    return $gsap?.fromTo(
      els,
      { opacity: 0, scale: 0.96 },
      { opacity: 1, scale: 1, duration: 0.3, ease: "power2.out" },
    );
  }

  function leave(els: Element[]) {
    const { $gsap } = useNuxtApp() as unknown as {
      $gsap?: typeof import("gsap").gsap;
    };
    return $gsap?.to(els, {
      opacity: 0,
      scale: 0.96,
      duration: 0.2,
      ease: "power2.in",
    });
  }

  /** capture() + mutate + play(), for the common case. */
  async function transition(mutate: () => void | Promise<void>) {
    capture();
    await mutate();
    await play();
  }

  return { capture, play, transition };
}
