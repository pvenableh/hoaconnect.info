<script setup lang="ts">
/**
 * DateInput — the glass date field. Replaces `<Input type="date">` and, with
 * `time` (or through DateTimeInput), `<Input type="datetime-local">`.
 *
 * The v-model is the raw input's string, unchanged (see ./value.ts), so the
 * sweep is a tag swap:
 *
 *   <Input v-model="form.due_date" type="date" />   →   <DateInput v-model="form.due_date" />
 *
 * Why not the native control: it renders differently in every browser, cannot
 * wear the glass rim (Safari paints its own box inside it), has no calendar on
 * desktop Firefox, and its segments ignore the theme in dark mode.
 *
 * The typed segments are reka's DateField (keyboard-first: type 10 24 2026, or
 * arrow up/down per segment); the calendar is a glass Popover beside it. Both
 * edit the same value.
 */
import type { DateValue } from "reka-ui";
import type { HTMLAttributes } from "vue";
import { DateFieldInput, DateFieldRoot } from "reka-ui";
import { cn } from "~/lib/utils";
import { Calendar } from "~/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
import { fromDateTimeValue, fromDateValue, toCalendarDate, toCalendarDateTime } from "./value";

defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    modelValue?: string | null;
    /** Include hours and minutes (datetime-local). */
    time?: boolean;
    /** "YYYY-MM-DD", like the native attribute. */
    min?: string;
    max?: string;
    disabled?: boolean;
    required?: boolean;
    id?: string;
    /** Renders a hidden input so a native <form> submit still carries the value. */
    name?: string;
    class?: HTMLAttributes["class"];
  }>(),
  { modelValue: undefined, time: false },
);

const emit = defineEmits<{ "update:modelValue": [value: string] }>();

const open = ref(false);

const toValue = (v: string | null | undefined) =>
  props.time ? toCalendarDateTime(v) : toCalendarDate(v);
const fromValue = (v: DateValue | null | undefined) =>
  props.time ? fromDateTimeValue(v as any) : fromDateValue(v);

const fieldValue = computed({
  get: () => toValue(props.modelValue) as DateValue | undefined,
  set: (v) => {
    const next = fromValue(v);
    if (next !== (props.modelValue ?? "")) emit("update:modelValue", next);
  },
});

const minValue = computed(() => toCalendarDate(props.min));
const maxValue = computed(() => toCalendarDate(props.max));

// Picking a day keeps the time already typed — choosing the 14th should not
// reset 7:30 PM to midnight.
const onPick = (picked: DateValue | undefined) => {
  if (!picked) return;
  const current = fieldValue.value as any;
  fieldValue.value = props.time
    ? (toCalendarDateTime(fromDateValue(picked))!.set({
        hour: current?.hour ?? 0,
        minute: current?.minute ?? 0,
      }) as DateValue)
    : picked;
  open.value = false;
};

const calendarValue = computed(() => toCalendarDate(props.modelValue) as DateValue | undefined);
</script>

<template>
  <div
    data-slot="date-input"
    :data-disabled="disabled ? '' : undefined"
    :class="
      cn(
        'glass-field inline-flex h-10 w-full min-w-0 items-center gap-1 rounded-full pl-3.5 pr-1 text-base md:text-sm',
        disabled && 'cursor-not-allowed opacity-50',
        props.class,
      )
    "
    v-bind="$attrs"
  >
    <DateFieldRoot
      :id="id"
      v-slot="{ segments }"
      v-model="fieldValue"
      :granularity="time ? 'minute' : 'day'"
      :min-value="minValue"
      :max-value="maxValue"
      :disabled="disabled"
      :required="required"
      class="flex min-w-0 flex-1 items-center tabular-nums"
    >
      <template v-for="(item, i) in segments" :key="`${item.part}-${i}`">
        <DateFieldInput v-if="item.part === 'literal'" :part="item.part" class="text-muted-foreground">
          {{ item.value }}
        </DateFieldInput>
        <DateFieldInput
          v-else
          :part="item.part"
          class="rounded-sm px-0.5 outline-none focus:bg-primary/15 focus:text-foreground data-[placeholder]:text-muted-foreground"
        >
          {{ item.value }}
        </DateFieldInput>
      </template>
    </DateFieldRoot>

    <Popover v-model:open="open">
      <PopoverTrigger as-child>
        <button
          type="button"
          class="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none"
          :disabled="disabled"
          aria-label="Open calendar"
        >
          <Icon name="lucide:calendar" class="size-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent class="w-auto p-0" align="end">
        <!-- default-placeholder opens the grid on the bound month, not today's;
             the Calendar mounts fresh on every open, so this is read each time. -->
        <Calendar
          :model-value="calendarValue"
          :default-placeholder="calendarValue"
          :min-value="minValue"
          :max-value="maxValue"
          initial-focus
          @update:model-value="onPick"
        />
      </PopoverContent>
    </Popover>

    <input v-if="name" type="hidden" :name="name" :value="modelValue ?? ''" />
  </div>
</template>
