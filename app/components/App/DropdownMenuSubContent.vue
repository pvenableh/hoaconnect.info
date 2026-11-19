<!--
  AppDropdownMenuSubContent — a submenu: the same floating chrome as
  <AppDropdownMenuContent>, so a submenu reads as one more step of the menu
  that opened it.

  The stock shadcn-vue <DropdownMenuSubContent> (left as shipped in
  app/components/ui/, so it can be updated by re-pulling it) wearing the
  workspace material. `.glass-surface` paints its background, border and shadow
  unlayered, so it beats the stock `bg-popover`, `border` and `shadow-lg`
  utilities; its radius is layered, so the rounded-* here replaces the stock one
  (tailwind-merge).

  Use <AppDropdownMenuSubContent> inside a <DropdownMenuSub> in the app;
  <DropdownMenuSubContent> only inside ui/. Every other prop and listener falls
  through to the stock component.
-->
<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { DropdownMenuSubContent } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const props = defineProps<{
  class?: HTMLAttributes["class"];
}>();
</script>

<template>
  <DropdownMenuSubContent :class="cn('glass-surface glass-surface--strong chrome-float rounded-xl', props.class)">
    <slot />
  </DropdownMenuSubContent>
</template>
