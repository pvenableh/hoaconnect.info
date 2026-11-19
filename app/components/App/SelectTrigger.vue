<!--
  AppSelectTrigger — a select's closed state: the stock shadcn-vue
  <SelectTrigger> (left as shipped in app/components/ui/, so it can be updated by
  re-pulling it) as a field pill, the same `glass-field` rim and focus ring as
  every input in the workspace.

  `glass-field` lives in @layer components, and the stock trigger's
  `bg-transparent`, `border`, `shadow-xs` and focus-ring utilities are in the
  utilities layer, which wins; so the material is restated below, unlayered,
  from the same tokens (earnest-ui.css, `.glass-field` and its focus rule) — the
  way <AppCard> restates `ios-card`. `rounded-full` replaces the stock radius.

  Use <AppSelectTrigger> with <AppSelectContent> in the app; the stock pair only
  inside ui/. `size`, `id`, `aria-*` and the rest fall through.
-->
<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { SelectTrigger } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const props = defineProps<{
  class?: HTMLAttributes["class"];
}>();
</script>

<template>
  <SelectTrigger :class="cn('glass-field app-select-trigger rounded-full', props.class)">
    <slot />
  </SelectTrigger>
</template>

<style scoped>
.app-select-trigger {
  background: color-mix(in srgb, var(--theme-bg-elevated) 55%, transparent);
  border: 0;
  box-shadow:
    var(--glass-rim-shadow),
    inset 0 1px 3px -1px hsl(var(--glass-shadow-h) var(--glass-shadow-s) var(--glass-shadow-l) / 0.1);
}
:global(.dark .app-select-trigger) {
  background: color-mix(in srgb, var(--theme-bg-elevated) 45%, transparent);
}
.app-select-trigger:focus,
.app-select-trigger:focus-visible {
  outline: none;
  box-shadow:
    var(--glass-rim-shadow),
    inset 0 0 0 1px hsl(var(--app-accent-h, 220) var(--glass-focus-s) var(--glass-focus-l) / var(--glass-focus-edge)),
    0 0 0 3px hsl(var(--app-accent-h, 220) var(--glass-focus-s) var(--glass-focus-l) / var(--glass-focus-halo));
}
.app-select-trigger[aria-invalid="true"] {
  box-shadow: var(--glass-rim-shadow), 0 0 0 3px hsl(var(--theme-error) / 0.28);
}
</style>
