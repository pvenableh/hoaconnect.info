<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { computed } from "vue";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

export interface CustomInputProps {
  id?: string;
  defaultValue?: string | number;
  modelValue?: string | number;
  class?: HTMLAttributes["class"];
  variant?: "full" | "underline";
  errorMessage?: string;
  type?: string;
  placeholder?: string;
  disabled?: boolean;
  label?: string;
}

const props = withDefaults(defineProps<CustomInputProps>(), {
  variant: "full",
});

defineOptions({
  inheritAttrs: false,
});

const emits = defineEmits<{
  (e: "update:modelValue", payload: string | number): void;
}>();

const inputValue = computed({
  get: () => props.modelValue,
  set: (value) => emits("update:modelValue", value as string | number),
});

const variantClasses = computed(() => {
  if (props.variant === "underline") {
    return "border-0 border-b border-input rounded-none focus-visible:ring-0 focus-visible:border-ring";
  }
  return "";
});

const errorClasses = computed(() => {
  if (props.errorMessage) {
    if (props.variant === "underline") {
      return "border-destructive border-b-2 bg-destructive/5";
    }
    return "border-destructive border-2 bg-destructive/5";
  }
  return "";
});
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <div v-if="label || $slots.label" class="flex items-center justify-between">
      <label
        v-if="label"
        :for="id"
        class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
      >
        {{ label }}
      </label>
      <slot v-else name="label" />
      <slot name="label-end" />
    </div>
    <div :class="cn('relative', $slots.after ? 'pb-0' : 'pb-5')">
      <Input
        :id="id"
        v-model="inputValue"
        v-bind="$attrs"
        :type="type"
        :placeholder="placeholder"
        :disabled="disabled"
        :default-value="defaultValue"
        :aria-invalid="!!errorMessage || undefined"
        :class="cn(variantClasses, errorClasses, props.class)"
      />
      <Transition
        enter-active-class="transition-opacity duration-200 ease-out"
        leave-active-class="transition-opacity duration-150 ease-in"
        enter-from-class="opacity-0"
        enter-to-class="opacity-100"
        leave-from-class="opacity-100"
        leave-to-class="opacity-0"
      >
        <p
          v-if="errorMessage && !$slots.after"
          class="absolute bottom-0 right-0 text-[10px] font-medium uppercase tracking-wide text-destructive"
        >
          {{ errorMessage }}
        </p>
      </Transition>
    </div>
    <slot name="after" />
  </div>
</template>
