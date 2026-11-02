<script setup lang="ts">
import type { ComboboxAnchorProps } from "reka-ui"
import type { HTMLAttributes } from "vue"
import { reactiveOmit } from "@vueuse/core"
import { ComboboxAnchor, useForwardProps } from "reka-ui"
import { cn } from '~/lib/utils'

const props = defineProps<ComboboxAnchorProps & { class?: HTMLAttributes["class"] }>()
const delegatedProps = reactiveOmit(props, "class")
const forwarded = useForwardProps(delegatedProps)
</script>

<template>
  <ComboboxAnchor
    data-slot="combobox-anchor"
    v-bind="forwarded"
    :class="cn('glass-field relative flex h-10 w-[200px] items-center gap-1 rounded-full pl-3.5 pr-1', props.class)"
  >
    <slot />
  </ComboboxAnchor>
</template>
