<!--
  AppBadge — HOA Connect's badge: the stock <Badge> (left as shipped in
  app/components/ui/, so it can be updated by re-pulling it) as a pill, the
  shape every chip, tab and button in the workspace shares.

  `rounded-full` replaces the stock `rounded-md` (tailwind-merge in `cn`).
  `variant` and every other attribute fall through to the stock component.

  Use <AppBadge> in the app; <Badge> only inside ui/.
-->
<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const props = defineProps<{
  class?: HTMLAttributes["class"];
}>();
</script>

<template>
  <Badge :class="cn('rounded-full', props.class)">
    <slot />
  </Badge>
</template>
