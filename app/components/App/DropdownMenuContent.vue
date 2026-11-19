<!--
  AppDropdownMenuContent — a menu: the same floating chrome as Popover
  and Combobox. (Submenus: the stock DropdownMenuSubContent has no app users yet;
  give it a wrapper like this one when it gets one.)

  The stock shadcn-vue <DropdownMenuContent> (left as shipped in app/components/ui/, so it can
  be updated by re-pulling it) wearing the workspace material. `.glass-surface`
  paints its background, border and shadow unlayered, so it beats the stock
  `bg-*`, `border` and `shadow-*` utilities; its radius is layered, so the
  rounded-* here replaces the stock one (tailwind-merge).

  Use <AppDropdownMenuContent> in the app; <DropdownMenuContent> only inside ui/. Every other prop and
  listener (align, side-offset, …) falls through to the stock component.
-->
<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { DropdownMenuContent } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const props = defineProps<{
  class?: HTMLAttributes["class"];
}>();
</script>

<template>
  <DropdownMenuContent :class="cn('glass-surface glass-surface--strong chrome-float rounded-xl', props.class)">
    <slot />
  </DropdownMenuContent>
</template>
