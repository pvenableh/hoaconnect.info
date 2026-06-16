<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { cn } from "@/lib/utils";

interface Props {
  class?: HTMLAttributes["class"];
  variant?: "default" | "secondary" | "destructive" | "outline";
}

const props = withDefaults(defineProps<Props>(), {
  variant: "default",
});

const variantClasses = {
  default:
    "bg-primary text-primary-foreground border-transparent shadow-sm hover:bg-primary/80",
  secondary:
    "bg-secondary text-secondary-foreground border-transparent hover:bg-secondary/80",
  destructive:
    "bg-destructive text-destructive-foreground border-transparent shadow-sm hover:bg-destructive/80",
  outline: "text-foreground border-border",
};
</script>

<template>
  <span
    :class="
      cn(
        'inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
        variantClasses[props.variant],
        props.class
      )
    "
  >
    <slot />
  </span>
</template>
