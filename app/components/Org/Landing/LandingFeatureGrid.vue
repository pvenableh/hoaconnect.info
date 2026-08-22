<!--
  Feature items for a landing content section — icon-able points that break into
  columns, faithful to 1033lenox.com. Four styles (set per block):
    • list    — icon + text rows (Design / Secure); at 1 column, bordered rhythm.
    • bullets — accent dot + text (Amenities / Investment).
    • cards   — icon + bold title + text in a soft card (Shape What's Next).
    • tiles   — centered icon over a label + sub-label (All New).
  Token-driven (t-* / --theme-*) so classic, luxury, and modern all render right.
-->
<template>
  <div class="my-8" :class="wrapClass">
    <!-- LIST -->
    <template v-if="featureStyle === 'list'">
      <div
        v-for="(f, i) in features"
        :key="i"
        class="reveal flex gap-4"
        :class="[
          f.wide ? 'sm:col-span-full' : '',
          columns === 1 ? 'py-4 border-b t-border-divider' : '',
          // A one-line row centres on its icon; a row with its own title is a
          // two-line block and has to hang from the top.
          f.title ? 'items-start' : 'items-center',
        ]"
      >
        <span v-if="f.icon" class="shrink-0 t-text-accent-tertiary"><Icon :name="f.icon" class="w-5 h-5" /></span>
        <div class="min-w-0">
          <p v-if="f.title" class="text-[0.95rem] font-medium t-text mb-0.5">{{ f.title }}</p>
          <p class="text-[0.9375rem] leading-relaxed t-text-secondary">{{ f.text }}</p>
        </div>
      </div>
    </template>

    <!-- BULLETS -->
    <template v-else-if="featureStyle === 'bullets'">
      <div
        v-for="(f, i) in features"
        :key="i"
        class="reveal flex items-center gap-4 py-2.5"
        :class="f.wide ? 'sm:col-span-full' : ''"
      >
        <span class="w-1.5 h-1.5 rounded-full t-bg-accent shrink-0" />
        <span class="text-[0.9375rem] t-text-secondary">{{ f.text }}</span>
      </div>
    </template>

    <!-- CARDS -->
    <template v-else-if="featureStyle === 'cards'">
      <div
        v-for="(f, i) in features"
        :key="i"
        class="reveal p-6 t-bg-subtle"
        :class="f.wide ? 'sm:col-span-full' : ''"
      >
        <div class="flex items-start gap-4">
          <span v-if="f.icon" class="shrink-0 t-text-accent-tertiary"><Icon :name="f.icon" class="w-8 h-8" /></span>
          <div class="min-w-0">
            <p v-if="f.title" class="text-sm font-medium t-text mb-2">{{ f.title }}</p>
            <p class="text-[0.875rem] leading-relaxed t-text-secondary">{{ f.text }}</p>
          </div>
        </div>
      </div>
    </template>

    <!-- TILES -->
    <template v-else>
      <div
        v-for="(f, i) in features"
        :key="i"
        class="reveal aspect-square t-bg-subtle flex flex-col items-center justify-center text-center p-3"
        :class="f.wide ? 'sm:col-span-full aspect-auto py-8' : ''"
      >
        <Icon v-if="f.icon" :name="f.icon" class="w-6 h-6 t-text-muted mb-2" />
        <p v-if="f.title" class="text-[10px] tracking-wide uppercase t-text-tertiary font-medium">{{ f.title }}</p>
        <p class="text-[9px] t-text-muted leading-snug">{{ f.text }}</p>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { LandingFeature, FeatureStyle } from "#core/shared/utils/landing";

const props = defineProps<{
  features: LandingFeature[];
  featureStyle: FeatureStyle;
  columns: number;
}>();

// Static column classes so Tailwind keeps them; gap varies by style.
const COLS: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-1 sm:grid-cols-2",
  3: "grid-cols-2 sm:grid-cols-3",
  4: "grid-cols-2 sm:grid-cols-4",
};
const GAP: Record<FeatureStyle, string> = {
  list: "gap-x-8 gap-y-6",
  bullets: "gap-x-8 gap-y-1",
  cards: "gap-6",
  tiles: "gap-4",
};
const wrapClass = computed(() => {
  const cols = props.featureStyle === "list" && props.columns === 1 ? "grid-cols-1" : COLS[props.columns] || COLS[2];
  return `grid ${cols} ${GAP[props.featureStyle] || "gap-6"}`;
});
</script>
