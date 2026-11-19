<!--
  AppTextarea — HOA Connect's multi-line field: the stock shadcn-vue <Textarea>
  (left as shipped in app/components/ui/, so it can be updated by re-pulling it)
  wearing `.field-underline`, the workspace field material.

  `.field-underline` is unlayered (theme.css; the workspace glass version is
  `html.theme-app .field-underline` in theme-app.css), so it beats the stock
  `border`, `rounded-md`, `shadow-xs`, `dark:bg-input/30` and focus-ring
  utilities with a class alone.

  ⚠️ Padding: theme-app.css supplies the field's inline padding only when the
  class list has no `pl-` / `px-` / `ps-` (and `pr-` / `pe-`); when it has one,
  `revert-layer` hands padding back to the utilities so a caller's `pl-10`
  clears its icon. The stock `px-3` would trip that sniff on every textarea, so
  `p-0` replaces it (tailwind-merge drops `px-3` and the stock `py-2`) and
  `py-2` is put back after it. A caller's own padding still wins.

  Use <AppTextarea> in the app; <Textarea> only inside ui/. v-model, `rows`,
  `maxlength`, listeners and vee-validate's `componentField` fall through to the
  stock component.
-->
<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const props = defineProps<{
  class?: HTMLAttributes["class"];
}>();
</script>

<template>
  <Textarea :class="cn('field-underline p-0 py-2', props.class)" />
</template>
