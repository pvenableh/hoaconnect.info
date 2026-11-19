<!--
  AppDialogContent — a dialog pane: the strong glass. The overlay
  behind it gets its glass from the stock data-slot (earnest-ui.css), since the
  stock DialogContent renders it inside itself.

  The stock shadcn-vue <DialogContent> (left as shipped in app/components/ui/, so it can
  be updated by re-pulling it) wearing the workspace material. `.glass-surface`
  paints its background, border and shadow unlayered, so it beats the stock
  `bg-*`, `border` and `shadow-*` utilities; its radius is layered, so the
  rounded-* here replaces the stock one (tailwind-merge).

  Use <AppDialogContent> in the app; <DialogContent> only inside ui/. Every other prop and
  listener (align, side-offset, …) falls through to the stock component.
-->
<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const props = defineProps<{
  class?: HTMLAttributes["class"];
}>();
</script>

<template>
  <DialogContent :class="cn('glass-surface glass-surface--strong rounded-2xl', props.class)">
    <slot />
  </DialogContent>
</template>
