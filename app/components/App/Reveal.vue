<script setup lang="ts">
/**
 * Staggered entry for a list or grid, once per visit. Children are the direct
 * children of the root, so it wraps a `v-for` without adding markup between
 * them. Same cadence as the CSS `.stagger-item` (40 ms apart, capped), but
 * remembers `id` so returning to the page does not replay it. Nothing happens
 * under reduced motion: `useGsap` skips the build, so children are never hidden.
 *
 *   <AppReveal id="payments-rows" class="grid gap-3"> <Row v-for … /> </AppReveal>
 */
import { revealPlan } from "#core/shared/motion";

const seen = useState<string[]>("app-reveal-seen", () => []);

const props = withDefaults(defineProps<{ id?: string; tag?: string }>(), { tag: "div" });

const root = ref<HTMLElement | null>(null);

useGsap(root, ({ gsap, scope }) => {
  const kids = Array.from(scope.children) as HTMLElement[];
  const plan = revealPlan({
    count: kids.length,
    reduced: false, // useGsap already skipped this build when reduced
    seen: !!props.id && seen.value.includes(props.id),
  });
  if (props.id && !seen.value.includes(props.id)) seen.value.push(props.id);
  if (!plan.animate) return;
  kids.forEach((el, i) => {
    gsap.from(el, {
      y: 8,
      opacity: 0,
      duration: 0.24,
      delay: plan.delays[i],
      ease: "power3.out",
      clearProps: "transform,opacity",
    });
  });
});
</script>

<template>
  <component :is="tag" ref="root"><slot /></component>
</template>
