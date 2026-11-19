<!--
  AppToggleGroup — HOA Connect's toggle group: the stock shadcn-vue <ToggleGroup>
  (left as shipped in app/components/ui/, so it can be updated by re-pulling it)
  sitting in the same recessed glass well as the segmented control.

  For INDEPENDENT on/off choices (bold + italic, a set of visible columns) or a
  compact single choice inside a toolbar. Switching between sibling VIEWS is
  AppSegmentedControl's job, not this one's.

  Use <AppToggleGroup> with <AppToggleGroupItem> in the app; the stock pair only
  inside ui/. Only the default variant is dressed: the stock `outline` variant
  keeps its stock border.
-->
<script setup lang="ts">
import type { ToggleGroupRootEmits, ToggleGroupRootProps } from "reka-ui";
import type { HTMLAttributes } from "vue";
import type { ToggleVariants } from "@/components/ui/toggle";
import { reactiveOmit } from "@vueuse/core";
import { useForwardPropsEmits } from "reka-ui";
import { ToggleGroup } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";

const props = defineProps<ToggleGroupRootProps & {
  class?: HTMLAttributes["class"];
  size?: ToggleVariants["size"];
}>();
const emits = defineEmits<ToggleGroupRootEmits>();

const forwarded = useForwardPropsEmits(reactiveOmit(props, "class"), emits);
</script>

<template>
  <!-- spacing 1: separate pills in the well. At the stock 0 the items fuse into
       one bar with squared inner corners. The well's own gap replaces it. -->
  <ToggleGroup
    v-slot="slotProps"
    v-bind="forwarded"
    :spacing="1"
    :class="cn('glass-field inline-flex gap-0.5 rounded-full p-0.5', props.class)"
  >
    <slot v-bind="slotProps" />
  </ToggleGroup>
</template>
