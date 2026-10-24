<script setup lang="ts">
import type { ComboboxInputEmits, ComboboxInputProps } from "reka-ui"
import type { HTMLAttributes } from "vue"
import { reactiveOmit } from "@vueuse/core"
import { ComboboxInput, useForwardPropsEmits } from "reka-ui"
import { cn } from '~/lib/utils'

defineOptions({
  inheritAttrs: false,
})

const props = defineProps<ComboboxInputProps & { class?: HTMLAttributes["class"] }>()
const emits = defineEmits<ComboboxInputEmits>()
const delegatedProps = reactiveOmit(props, "class")
const forwarded = useForwardPropsEmits(delegatedProps, emits)
</script>

<template>
  <!-- Bare: the rim belongs to ComboboxAnchor, so focus-within lights the
       whole control, trigger included. -->
  <ComboboxInput
    data-slot="combobox-input"
    v-bind="{ ...$attrs, ...forwarded }"
    :class="cn('placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent text-base outline-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm', props.class)"
  />
</template>
