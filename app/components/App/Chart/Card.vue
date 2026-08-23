<script setup lang="ts">
/**
 * The frame every chart in the app sits in. Title, an optional one-line hint,
 * a slot for a control on the right, and — the part that matters — the three
 * states a chart actually has: loading, empty, and drawn.
 *
 * The charts written before this (dashboard/EmailActivityChart and friends)
 * each rolled their own `<Card>` with `text-muted-foreground`, which is the
 * shadcn palette rather than the workspace theme, so they didn't follow
 * light/dark with the rest of the app. This frame is `ios-card` and `t-*` like
 * every other surface.
 *
 * "Empty" is a real state, not an accident: a community with no dues history
 * should be told that, not shown an axis with nothing on it. Pass `empty` and
 * the frame handles it.
 */
withDefaults(
  defineProps<{
    title: string;
    /** One line under the title — what the chart is measuring, or over what window. */
    hint?: string;
    icon?: string;
    loading?: boolean;
    /** Nothing to plot. Say so rather than drawing empty axes. */
    empty?: boolean;
    emptyTitle?: string;
    emptyHint?: string;
    /** Reserved plot height. Must match the chart inside, or the card jumps on load. */
    height?: number;
  }>(),
  { height: 200, emptyTitle: "Nothing to chart yet" },
);
</script>

<template>
  <div class="ios-card p-5 flex flex-col">
    <div class="flex items-start gap-3 mb-4">
      <span v-if="icon" class="chart-card__icon" aria-hidden="true">
        <Icon :name="icon" class="w-4 h-4" />
      </span>
      <div class="min-w-0 flex-1">
        <h3 class="type-card truncate">{{ title }}</h3>
        <p v-if="hint" class="type-meta truncate">{{ hint }}</p>
      </div>
      <slot name="action" />
    </div>

    <div v-if="loading" class="river-skeleton rounded-xl" :style="{ height: `${height}px` }" />

    <div
      v-else-if="empty"
      class="flex flex-col items-center justify-center text-center gap-1.5"
      :style="{ height: `${height}px` }"
    >
      <Icon name="lucide:chart-no-axes-column" class="w-8 h-8 t-text-muted opacity-50" />
      <p class="type-meta">{{ emptyTitle }}</p>
      <p v-if="emptyHint" class="type-meta t-text-muted max-w-[34ch]">{{ emptyHint }}</p>
    </div>

    <!--
      unovis is not SSR-safe: rendered on the server it leaves an empty
      duplicate <svg> and the real chart stacks below it. Every chart in the kit
      is client-only, with a fallback of exactly the plot height so the card
      doesn't resize under the reader when hydration lands.
    -->
    <ClientOnly v-else>
      <slot />
      <template #fallback>
        <div :style="{ height: `${height}px` }" />
      </template>
    </ClientOnly>

    <slot name="footer" />
  </div>
</template>

<style scoped>
.chart-card__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border-radius: 999px;
  flex-shrink: 0;
  background: hsl(var(--app-accent-h) var(--app-accent-s) var(--app-accent-l) / 0.12);
  color: hsl(var(--app-accent-h) var(--app-accent-s) var(--app-accent-l));
}
</style>
