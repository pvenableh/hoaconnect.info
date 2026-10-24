<script setup lang="ts">
import type { ComboboxTriggerProps } from "reka-ui"
import type { HTMLAttributes } from "vue"
import { reactiveOmit } from "@vueuse/core"
import { ComboboxTrigger, useForwardProps } from "reka-ui"
import { cn } from '~/lib/utils'

const props = defineProps<ComboboxTriggerProps & { class?: HTMLAttributes["class"] }>()
const delegatedProps = reactiveOmit(props, "class")
const forwarded = useForwardProps(delegatedProps)
</script>

<template>
  <ComboboxTrigger
    data-slot="combobox-trigger"
    v-bind="forwarded"
    :class="cn('text-muted-foreground hover:bg-muted hover:text-foreground grid size-8 shrink-0 place-items-center rounded-full transition-colors', props.class)"
    tabindex="-1"
  >
    <slot>
      <Icon name="lucide:chevrons-up-down" class="size-4" />
    </slot>
  </ComboboxTrigger>
</template>
