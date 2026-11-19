<!--
  AppCalendar — HOA Connect's month grid: the stock shadcn-vue <Calendar>
  (new-york-v4, left as shipped in app/components/ui/, so it can be updated by
  re-pulling it) with the workspace's pill buttons.

  The stock calendar builds its nav and day buttons from `buttonVariants()`
  inside ui/, where no class from here can reach them, so `.app-calendar` in
  earnest-ui.css dresses them by their stock data-slots, scoped to this
  wrapper: the prev/next buttons are borderless pills with the quiet glass rim
  (no fill), and every day cell is a pill.

  Use <AppCalendar> in the app; <Calendar> only inside ui/. Every prop
  (`layout="month-and-year"` for the month/year dropdowns, `min-value`, …),
  listener and slot falls through to the stock component.
-->
<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

const props = defineProps<{
  class?: HTMLAttributes["class"];
}>();
</script>

<template>
  <Calendar :class="cn('app-calendar', props.class)">
    <template v-for="(_, name) in $slots" #[name]="slotProps">
      <slot :name="name" v-bind="slotProps ?? {}" />
    </template>
  </Calendar>
</template>
