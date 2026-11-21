<script setup lang="ts">
/**
 * A large page title that collapses into a compact bar title as the page
 * scrolls (iOS large-title). The big title fades and rises; the bar title
 * fades in. Opacity and transform only. Under reduced motion it switches at
 * the halfway point instead of scrubbing (`largeTitleProgress`). The full
 * title stays in the DOM as the one <h1>, so the page keeps its heading.
 */
import { largeTitleProgress, prefersReducedMotion } from "#core/shared/motion";

defineProps<{ title: string; subtitle?: string }>();

const RANGE = 56; // px of scroll over which the title collapses
const progress = ref(0);

// Written straight from the scroll event, not a requestAnimationFrame: rAF
// stalls in a background tab and would leave the title parked half-collapsed.
function update() {
  progress.value = largeTitleProgress(window.scrollY, RANGE, prefersReducedMotion());
}
const onScroll = update;

onMounted(() => {
  update();
  window.addEventListener("scroll", onScroll, { passive: true });
});
onBeforeUnmount(() => {
  window.removeEventListener("scroll", onScroll);
});

const largeStyle = computed(() => ({
  opacity: 1 - progress.value,
  transform: `translate3d(0, ${-progress.value * 8}px, 0)`,
}));
const barStyle = computed(() => ({ opacity: progress.value }));
</script>

<template>
  <div class="large-title" :data-collapsed="progress >= 1 ? '' : null">
    <div class="large-title__bar mat-blur-chrome" aria-hidden="true">
      <span class="large-title__bar-text type-body" :style="barStyle">{{ title }}</span>
    </div>
    <div class="large-title__big" :style="largeStyle">
      <h1 class="type-display">{{ title }}</h1>
      <p v-if="subtitle" class="type-body large-title__sub">{{ subtitle }}</p>
    </div>
  </div>
</template>

<style scoped>
.large-title__bar {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 2.75rem;
  margin-bottom: -2.75rem;
  pointer-events: none;
}
.large-title__bar-text {
  font-weight: 600;
}
.large-title__big {
  padding-top: 3.25rem;
  margin-bottom: 1rem;
  will-change: transform, opacity;
}
.large-title__sub {
  margin-top: 0.25rem;
  max-width: 60ch;
}
</style>
