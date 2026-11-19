<!--
  AppPopoverContent — a popover pane: floating chrome, the opaque
  elevation step (`chrome-float`) on the strong glass, so it reads over whatever
  it opens above.

  The stock shadcn-vue <PopoverContent> (left as shipped in app/components/ui/, so it can
  be updated by re-pulling it) wearing the workspace material. `.glass-surface`
  paints its background, border and shadow unlayered, so it beats the stock
  `bg-*`, `border` and `shadow-*` utilities; its radius is layered, so the
  rounded-* here replaces the stock one (tailwind-merge).

  Use <AppPopoverContent> in the app; <PopoverContent> only inside ui/. Every other prop and
  listener (align, side-offset, …) falls through to the stock component.
-->
<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { PopoverContent } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const props = defineProps<{
  class?: HTMLAttributes["class"];
}>();
</script>

<template>
  <PopoverContent :class="cn('glass-surface glass-surface--strong chrome-float rounded-xl', props.class)">
    <slot />
  </PopoverContent>
</template>
