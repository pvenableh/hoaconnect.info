// The one way to run GSAP inside a component.
//
// Three things go wrong when components call gsap directly, and this fixes all
// three in one place:
//
// 1. LEAKS. A tween, ScrollTrigger or Draggable created in a component outlives
//    the component unless something kills it. `gsap.context()` records
//    everything created inside it; reverting on unmount undoes the lot,
//    including the inline styles GSAP wrote.
// 2. SELECTOR BLEED. Scoping the context to the component's root element means
//    a selector string like ".row" matches this component's rows and not the
//    identical markup somewhere else on the page.
// 3. REDUCED MOTION IGNORED. It is easy to remember for CSS and easy to forget
//    in JS. Here the callback simply does not run when the user has asked for
//    less motion — the `reduced` branch runs instead, so the component still
//    reaches its final state, just without the movement.
//
// SSR: the callback never runs on the server. GSAP is client-only, and anything
// it animates must already be rendered.

import type { Ref } from "vue";

export interface GsapContextOptions {
  /**
   * Runs instead of the animation when the user prefers reduced motion. Use it
   * to jump to the end state — the information the animation was carrying still
   * has to arrive.
   */
  reduced?: (ctx: { gsap: typeof import("gsap").gsap }) => void;
  /** Skip the reduced-motion gate. Only for motion that conveys state and has no static equivalent. */
  alwaysAnimate?: boolean;
}

/**
 * Run GSAP scoped to `scope`, cleaned up automatically.
 *
 * ```ts
 * const root = ref<HTMLElement | null>(null);
 * useGsap(root, ({ gsap }) => {
 *   gsap.from(".row", { y: 12, opacity: 0, stagger: 0.04 });
 * });
 * ```
 */
export function useGsap(
  scope: Ref<HTMLElement | null>,
  build: (ctx: { gsap: typeof import("gsap").gsap; scope: HTMLElement }) => void,
  options: GsapContextOptions = {},
) {
  const prefersReduced = () =>
    import.meta.client &&
    !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  let ctx: ReturnType<typeof import("gsap").gsap.context> | null = null;

  onMounted(async () => {
    if (!import.meta.client) return;
    const { $gsap } = useNuxtApp() as unknown as {
      $gsap: typeof import("gsap").gsap;
    };
    if (!$gsap) return;

    // Wait a tick so v-if/v-for children the callback may target exist.
    await nextTick();
    const el = scope.value;
    if (!el) return;

    if (prefersReduced() && !options.alwaysAnimate) {
      options.reduced?.({ gsap: $gsap });
      return;
    }

    ctx = $gsap.context(() => build({ gsap: $gsap, scope: el }), el);
  });

  onUnmounted(() => {
    ctx?.revert();
    ctx = null;
  });

  return {
    /** Re-run the build after the DOM changes shape (new rows, a filter applied). */
    async refresh() {
      if (!ctx) return;
      ctx.revert();
      await nextTick();
      const el = scope.value;
      const { $gsap } = useNuxtApp() as unknown as {
        $gsap: typeof import("gsap").gsap;
      };
      if (!el || !$gsap) return;
      ctx = $gsap.context(() => build({ gsap: $gsap, scope: el }), el);
    },
  };
}
