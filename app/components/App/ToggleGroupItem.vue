<!--
  AppToggleGroupItem — an item of <AppToggleGroup>: the stock shadcn-vue
  <ToggleGroupItem> as a pill. OFF is quiet muted text; ON wears the same
  `glass-active-thumb` the segmented control slides and ActionButton's `pressed`
  state wears, so a filter row mixing them reads as one family. The ON material
  is keyed on the stock data-slot in earnest-ui.css (a Tailwind `data-[state=on]:`
  variant cannot apply a component class).

  The classes below replace the stock ones they conflict with (tailwind-merge):
  pill radius, roomier padding, muted→foreground hover instead of a hover fill.
-->
<script setup lang="ts">
import type { ToggleGroupItemProps } from "reka-ui";
import type { HTMLAttributes } from "vue";
import { reactiveOmit } from "@vueuse/core";
import { useForwardProps } from "reka-ui";
import { ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";

const props = defineProps<ToggleGroupItemProps & { class?: HTMLAttributes["class"] }>();

const forwarded = useForwardProps(reactiveOmit(props, "class"));
</script>

<template>
  <ToggleGroupItem
    v-slot="slotProps"
    v-bind="forwarded"
    :class="cn(
      'rounded-full text-muted-foreground transition-[color,background-color,box-shadow]',
      'hover:bg-transparent hover:text-foreground data-[state=on]:text-foreground',
      'focus-visible:ring-[3px] focus-visible:ring-ring/50',
      'data-[size=default]:px-3 data-[size=sm]:px-2.5 data-[size=lg]:px-3.5',
      props.class,
    )"
  >
    <slot v-bind="slotProps" />
  </ToggleGroupItem>
</template>
