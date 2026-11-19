<!--
  AppCard — HOA Connect's card: the stock shadcn-vue <Card> (left as shipped in
  app/components/ui/, so it can be updated by re-pulling it) wearing the
  workspace's solid content material, `ios-card` (plan §2.4: cards are content,
  and content is solid, not glass).

  `ios-card` lives in `@layer components`, and the stock card's own utilities
  (`border`, `rounded-xl`, `shadow-sm`, `bg-card`) are in the utilities layer,
  which wins; so the material's radius, ring and lift are restated
  below, unlayered, from the same tokens (earnest-ui.css, `.ios-card`).

  Use <AppCard> in the app; <Card> only inside ui/. CardHeader, CardTitle,
  CardContent and the rest are used as they are, inside it.
-->
<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const props = defineProps<{
  class?: HTMLAttributes["class"];
}>();
</script>

<template>
  <Card :class="cn('ios-card app-card', props.class)">
    <slot />
  </Card>
</template>

<style scoped>
/* The ground stays the stock `bg-card` utility, so a caller's tint
   (`bg-info/10`) still replaces it. */
.app-card {
  border: 0;
  border-radius: 1rem;
  box-shadow:
    inset 0 0 0 1px hsl(var(--card-ring)),
    0 1px 2px -1px hsl(var(--card-shadow) / var(--card-shadow-near)),
    0 10px 28px -18px hsl(var(--card-shadow) / var(--card-shadow-far));
}
.app-card:hover {
  box-shadow:
    inset 0 0 0 1px hsl(var(--card-ring)),
    0 1px 2px -1px hsl(var(--card-shadow) / var(--card-shadow-near)),
    0 18px 40px -18px hsl(var(--card-shadow) / var(--card-shadow-far));
}
</style>
