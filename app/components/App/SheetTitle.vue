<!--
  AppSheetTitle — the title of an <AppSheetContent>: the stock shadcn-vue
  <SheetTitle> (left as shipped in app/components/ui/, so it can be updated by
  re-pulling it) at the workspace's sheet-title size, `text-lg` (stock is the
  body size). A caller's `text-*` size replaces it (tailwind-merge).

  Use <AppSheetTitle> in the app; <SheetTitle> only inside ui/.
-->
<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const props = defineProps<{
  class?: HTMLAttributes["class"];
}>();
</script>

<template>
  <SheetTitle :class="cn('text-lg', props.class)">
    <slot />
  </SheetTitle>
</template>
