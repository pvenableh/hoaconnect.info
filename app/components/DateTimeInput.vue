<script setup lang="ts">
/**
 * DateTimeInput — `<DateInput time>` under the name the sweep reads naturally:
 * `<Input type="datetime-local" v-model>` → `<DateTimeInput v-model>`. The model
 * stays the raw input's "YYYY-MM-DDTHH:mm" (see ./value.ts).
 */
import DateInput from "./DateInput.vue";

defineOptions({ inheritAttrs: false });
defineProps<{ modelValue?: string | null }>();
const emit = defineEmits<{ "update:modelValue": [value: string] }>();
</script>

<template>
  <DateInput
    v-bind="$attrs"
    :model-value="modelValue"
    time
    @update:model-value="(v: string) => emit('update:modelValue', v)"
  />
</template>
