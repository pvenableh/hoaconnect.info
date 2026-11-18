<!--
  ResponsibilitiesMapSlider — the map's "As of" (plan §3.4 "Map view"): a
  native range over the days the register changes (`changeDays`), with the date
  field beside it as the same state. Dragging emits each snap day it crosses;
  the page sets the as-of day from it without a request. A typed date is the
  page's to place (it may refetch once). Glass: it floats over the page, never
  over another glass surface.

  Keyboard is the native range's: arrows step one change, Home and End jump to
  the ends; `aria-valuetext` reads "As of 12 October 2026".
-->
<script setup lang="ts">
import { longDay } from "#core/shared/responsibilities/map";

const props = defineProps<{
  /** The snap days, sorted, once each; `modelValue` is one of them. */
  days: readonly string[];
  modelValue: string;
  today: string;
}>();
const emit = defineEmits<{ "update:modelValue": [day: string]; type: [day: string] }>();

const index = computed(() => Math.max(0, props.days.indexOf(props.modelValue)));
const canSlide = computed(() => props.days.length > 1);
const isToday = computed(() => props.modelValue === props.today);

function onInput(e: Event) {
  const i = Number((e.target as HTMLInputElement).value);
  const d = props.days[i];
  if (d && d !== props.modelValue) emit("update:modelValue", d);
}

// A date half typed into the field is not a date yet.
function onType(v: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(v) && v !== props.modelValue) emit("type", v);
}

const short = (d: string) => {
  const [y, m, dd] = d.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, dd!)).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
};
</script>

<template>
  <div class="rmap-slider glass-surface">
    <div class="rmap-slider__head">
      <Label for="rmap-slider-range" class="type-label">As of</Label>
      <span class="type-body font-semibold t-text tabular-nums">{{ longDay(modelValue) }}</span>
      <span v-if="!isToday" class="type-meta text-warning">Not today</span>
    </div>

    <div class="rmap-slider__row">
      <div class="rmap-slider__track">
        <input
          id="rmap-slider-range"
          type="range"
          class="rmap-slider__range"
          min="0"
          :max="Math.max(0, days.length - 1)"
          step="1"
          :value="index"
          :disabled="!canSlide"
          :aria-valuetext="`As of ${longDay(modelValue)}`"
          @input="onInput"
        />
        <div v-if="canSlide" class="rmap-slider__ends type-meta t-text-muted" aria-hidden="true">
          <span>{{ short(days[0]!) }}</span>
          <span>{{ short(days[days.length - 1]!) }}</span>
        </div>
      </div>

      <div class="rmap-slider__date">
        <Label for="rmap-slider-date" class="sr-only">As of date</Label>
        <DateInput id="rmap-slider-date" :model-value="modelValue" class="w-40" @update:model-value="onType" />
        <Button v-if="!isToday" variant="ghost" size="sm" class="min-h-11" @click="emit('type', today)">Today</Button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.rmap-slider {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  border-radius: 1.25rem;
}
.rmap-slider__head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.25rem 0.75rem;
}
.rmap-slider__row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 1rem;
}
.rmap-slider__track {
  flex: 1 1 16rem;
  min-width: 0;
}
.rmap-slider__range {
  width: 100%;
  min-height: 44px;
  accent-color: var(--primary);
  cursor: pointer;
}
.rmap-slider__range:disabled {
  cursor: default;
  opacity: 0.5;
}
.rmap-slider__ends {
  display: flex;
  justify-content: space-between;
  margin-top: -0.375rem;
}
.rmap-slider__date {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}
</style>
