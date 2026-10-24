<script setup lang="ts">
import type { HTMLAttributes } from "vue"
import { cn } from "@/lib/utils"

const props = defineProps<{
  class?: HTMLAttributes["class"]
}>()
</script>

<template>
  <div
    data-slot="card"
    :class="
      cn(
        // The refracted rim replaces the flat 1px border + shadow-sm, the same
        // material `.ios-card` wears. See `.glass-edge` / `.glass-refract` in
        // earnest-ui.css.
        'bg-card text-card-foreground flex flex-col gap-6 rounded-xl py-6 glass-edge glass-refract',
        props.class,
      )
    "
  >
    <slot />
  </div>
</template>
