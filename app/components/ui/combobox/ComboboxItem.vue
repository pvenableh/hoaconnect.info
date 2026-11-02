<script setup lang="ts">
import type { ComboboxItemEmits, ComboboxItemProps } from "reka-ui"
import type { HTMLAttributes } from "vue"
import { reactiveOmit } from "@vueuse/core"
import { ComboboxItem, useForwardPropsEmits } from "reka-ui"
import { cn } from '~/lib/utils'

const props = defineProps<ComboboxItemProps & { class?: HTMLAttributes["class"] }>()
const emits = defineEmits<ComboboxItemEmits>()
const delegatedProps = reactiveOmit(props, "class")
const forwarded = useForwardPropsEmits(delegatedProps, emits)
</script>

<template>
  <ComboboxItem
    data-slot="combobox-item"
    v-bind="forwarded"
    :class="cn(`data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground relative flex w-full cursor-default items-center gap-2 rounded-lg py-1.5 pr-8 pl-2 text-sm outline-none select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0`, props.class)"
  >
    <slot />
  </ComboboxItem>
</template>
