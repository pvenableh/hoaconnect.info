<!--
  AppSheetContent — HOA Connect's side sheet: the stock shadcn-vue <SheetContent>
  (left as shipped in app/components/ui/, so it can be updated by re-pulling it)
  wearing the strong glass pane, with the edge it slides from left square.

  `.glass-surface` paints its background, border and shadow unlayered, so it
  beats the stock `bg-background`, `border-*` and `shadow-lg` utilities; its
  1rem radius is layered, so the `rounded-*-none` below squares the screen edge.
  The overlay's glass comes from its stock data-slot (earnest-ui.css).

  The stock new-york-v4 pane is an unpadded flex column whose header and footer
  pad themselves. The workspace's sheets are written as a padded block (body
  content follows the header with its own `mt-*`), so `block p-6` restores that;
  <AppSheetHeader> drops the header's own padding to match.

  Use <AppSheetContent> in the app; <SheetContent> only inside ui/. Sheet,
  SheetHeader, SheetTitle and the rest are used as they are, around and inside it.
-->
<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { SheetContent } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

type SheetSide = "top" | "right" | "bottom" | "left";

const props = withDefaults(
  defineProps<{
    side?: SheetSide;
    class?: HTMLAttributes["class"];
  }>(),
  { side: "right" },
);

const flatEdge: Record<SheetSide, string> = {
  top: "rounded-t-none",
  right: "rounded-r-none",
  bottom: "rounded-b-none",
  left: "rounded-l-none",
};
</script>

<template>
  <SheetContent
    :side="props.side"
    :class="cn('glass-surface glass-surface--strong block p-6', flatEdge[props.side], props.class)"
  >
    <slot />
  </SheetContent>
</template>
