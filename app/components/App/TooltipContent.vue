<!--
  AppTooltipContent — a tooltip: the stock shadcn-vue <TooltipContent> (left as
  shipped in app/components/ui/, so it can be updated by re-pulling it) as a
  small strong-glass pane instead of the stock inverse chip.

  `.glass-surface` paints its background, border and shadow unlayered, so it
  beats the stock `bg-foreground`; `text-foreground` and `rounded-lg` replace the
  stock colour and radius (tailwind-merge).

  The stock arrow is hidden: a solid arrow on a translucent glass pane reads as
  a stray chip (Earnest drops it for the same reason). reka renders it as a
  <span><svg/></span> directly inside the pane, hence the selector; tooltip
  content is text, so nothing else matches it.

  Use <AppTooltipContent> in the app; <TooltipContent> only inside ui/.
-->
<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { TooltipContent } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const props = defineProps<{
  class?: HTMLAttributes["class"];
}>();
</script>

<template>
  <TooltipContent
    :class="cn('glass-surface glass-surface--strong text-foreground rounded-lg [&>span:has(>svg)]:hidden', props.class)"
  >
    <slot />
  </TooltipContent>
</template>
