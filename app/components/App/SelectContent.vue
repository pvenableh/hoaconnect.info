<!--
  AppSelectContent — a select's option list: strong glass.
  Pair it with <AppSelectTrigger>.

  The stock shadcn-vue <SelectContent> (left as shipped in app/components/ui/, so it can
  be updated by re-pulling it) wearing the workspace material. `.glass-surface`
  paints its background, border and shadow unlayered, so it beats the stock
  `bg-*`, `border` and `shadow-*` utilities; its radius is layered, so the
  rounded-* here replaces the stock one (tailwind-merge).

  Use <AppSelectContent> in the app; <SelectContent> only inside ui/. Every other prop and
  listener (align, side-offset, …) falls through to the stock component.
-->
<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { SelectContent } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const props = defineProps<{
  class?: HTMLAttributes["class"];
}>();
</script>

<template>
  <SelectContent :class="cn('glass-surface glass-surface--strong rounded-xl', props.class)">
    <slot />
  </SelectContent>
</template>
