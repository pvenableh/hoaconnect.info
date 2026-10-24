<script setup lang="ts">
import type { ComboboxContentEmits, ComboboxContentProps } from "reka-ui"
import type { HTMLAttributes } from "vue"
import { reactiveOmit } from "@vueuse/core"
import { ComboboxContent, ComboboxPortal, ComboboxViewport, useForwardPropsEmits } from "reka-ui"
import { cn } from '~/lib/utils'

const props = withDefaults(defineProps<ComboboxContentProps & { class?: HTMLAttributes["class"] }>(), {
  position: "popper",
  align: "start",
  sideOffset: 6,
})
const emits = defineEmits<ComboboxContentEmits>()
const delegatedProps = reactiveOmit(props, "class")
const forwarded = useForwardPropsEmits(delegatedProps, emits)
</script>

<template>
  <ComboboxPortal>
    <!-- Same floating-chrome material as Popover / DropdownMenu. -->
    <ComboboxContent
      data-slot="combobox-list"
      v-bind="forwarded"
      :class="cn('glass-surface glass-surface--strong chrome-float text-popover-foreground z-50 w-(--reka-combobox-trigger-width) min-w-[8rem] overflow-hidden rounded-xl p-1 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2', props.class)"
    >
      <ComboboxViewport class="max-h-72 scroll-py-1 overflow-y-auto">
        <slot />
      </ComboboxViewport>
    </ComboboxContent>
  </ComboboxPortal>
</template>
