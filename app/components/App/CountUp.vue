<script setup lang="ts">
/**
 * A number that rolls to its value: on first view, and again whenever it
 * changes. Server and no-JS render the final figure, so nothing is ever blank.
 * Under reduced motion the figure just updates (the plan lives in
 * `countUpPlan`, core/shared/motion/kit.ts). Tabular figures keep the width
 * steady while it rolls.
 */
import { countUpPlan, formatCount, prefersReducedMotion } from "#core/shared/motion";

const props = withDefaults(
  defineProps<{
    value: number;
    decimals?: number;
    prefix?: string;
    suffix?: string;
  }>(),
  { decimals: 0, prefix: "", suffix: "" },
);

const fmt = () => ({ decimals: props.decimals, prefix: props.prefix, suffix: props.suffix });
const shown = ref(props.value);
const text = computed(() => formatCount(shown.value, fmt()));
const root = ref<HTMLElement | null>(null);

let tween: { kill: () => void } | null = null;
let first = true;

function run(to: number) {
  tween?.kill();
  const plan = countUpPlan({ from: shown.value, to, reduced: prefersReducedMotion(), first });
  first = false;
  const gsap = (useNuxtApp() as unknown as { $gsap?: typeof import("gsap").gsap }).$gsap;
  if (!plan.animate || !gsap) {
    shown.value = to;
    return;
  }
  const proxy = { v: plan.from };
  shown.value = plan.from;
  tween = gsap.to(proxy, {
    v: to,
    duration: plan.duration,
    ease: "power3.out",
    onUpdate: () => {
      shown.value = proxy.v;
    },
    onComplete: () => {
      shown.value = to;
    },
  });
}

onMounted(() => {
  if (typeof IntersectionObserver === "undefined" || !root.value) return run(props.value);
  const io = new IntersectionObserver((entries) => {
    if (!entries.some((e) => e.isIntersecting)) return;
    io.disconnect();
    run(props.value);
  });
  io.observe(root.value);
  onBeforeUnmount(() => io.disconnect());
});

watch(
  () => props.value,
  (to) => {
    if (first) return; // not yet seen: the observer will roll it in
    run(to);
  },
);
onBeforeUnmount(() => tween?.kill());
</script>

<template>
  <span ref="root" class="tabular-nums" :aria-label="formatCount(value, fmt())">
    <span aria-hidden="true">{{ text }}</span>
  </span>
</template>
