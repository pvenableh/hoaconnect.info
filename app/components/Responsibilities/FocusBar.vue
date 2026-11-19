<!--
  ResponsibilitiesFocusBar — what the register is focused on (Session 18), the
  same line over the Grid and the Map: "Showing Ana Ruiz’s 6 · Show all" when a
  holder is picked, and the Unassigned switch, independent of the holder, with
  the number of jobs nobody holds beside it (and how many it is hiding), so
  hiding them never loses them. The page keeps both in the URL
  (useRegisterFocus); this only draws them.
-->
<script setup lang="ts">
import { Switch } from "@/components/ui/switch";

const props = defineProps<{
  /** "Ana Ruiz’s 6" (focusLabel), or null when nobody is picked. */
  holderLabel: string | null;
  /** Jobs nobody holds on the day; the switch shows only when there are some. */
  unassignedCount: number;
}>();
const unassigned = defineModel<boolean>("unassigned", { required: true });
const emit = defineEmits<{ clear: [] }>();

const switchId = useId();
const jobs = (n: number) => `${n} ${n === 1 ? "job" : "jobs"}`;
/** "14 jobs" while they show; "14 hidden", in the attention colour, while the switch hides them. */
const countText = computed(() => (unassigned.value ? jobs(props.unassignedCount) : `${props.unassignedCount} hidden`));
</script>

<template>
  <div
    v-if="holderLabel || unassignedCount"
    class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2"
    data-register-focus
  >
    <p v-if="holderLabel" class="type-meta t-text-secondary flex items-center gap-1" aria-live="polite">
      <span>Showing {{ holderLabel }}</span>
      <span aria-hidden="true">·</span>
      <AppButton variant="link" size="sm" class="h-auto px-1 py-0" data-register-focus-clear @click="emit('clear')">Show all</AppButton>
    </p>
    <span v-else aria-hidden="true" />

    <div v-if="unassignedCount" class="flex items-center gap-2">
      <Switch :id="switchId" v-model="unassigned" data-register-unassigned />
      <Label :for="switchId" class="type-meta t-text-secondary cursor-pointer">
        Unassigned
        <span class="tabular-nums" :class="{ 'text-warning': !unassigned }">· {{ countText }}</span>
      </Label>
    </div>
  </div>
</template>
