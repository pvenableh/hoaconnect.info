<!--
  AppSheetHeader — the header of an <AppSheetContent>: the stock shadcn-vue
  <SheetHeader> (left as shipped in app/components/ui/, so it can be updated by
  re-pulling it) laid out the way the workspace's sheets are written.

  The stock new-york-v4 header pads itself (`p-4`) because the stock pane does
  not; <AppSheetContent> pads the pane (`p-6`), so the header's own padding
  goes. Its title and description sit 0.5rem apart, centred on phones and
  left-aligned from `sm` up. A caller's `gap-*` replaces the gap (tailwind-merge).

  Use <AppSheetHeader> in the app; <SheetHeader> only inside ui/.
-->
<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { SheetHeader } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const props = defineProps<{
  class?: HTMLAttributes["class"];
}>();
</script>

<template>
  <SheetHeader :class="cn('gap-2 p-0 text-center sm:text-left', props.class)">
    <slot />
  </SheetHeader>
</template>
