<!--
  AppInput — HOA Connect's single-line field: the stock shadcn-vue <Input>
  (left as shipped in app/components/ui/, so it can be updated by re-pulling it)
  wearing `.field-underline`, the workspace field material.

  `.field-underline` is unlayered (theme.css; the workspace glass pill is
  `html.theme-app .field-underline` in theme-app.css), so it beats the stock
  `border`, `rounded-md`, `shadow-xs`, `dark:bg-input/30`, `h-9` and
  focus-ring utilities with a class alone.

  ⚠️ Padding: theme-app.css supplies the field's inline padding only when the
  class list has no `pl-` / `px-` / `ps-` (and `pr-` / `pe-`); when it has one,
  `revert-layer` hands padding back to the utilities so a caller's `pl-9`
  clears its search icon. The stock `px-3` would trip that sniff on every
  input, so `p-0` replaces it (tailwind-merge drops `px-3` and the stock
  `py-1`) and `py-1` is put back after it. A caller's own padding still wins.

  Use <AppInput> in the app; <Input> only inside ui/. v-model (and its
  `.trim` / `.number` modifiers), `type`, listeners, template refs' `$el` and
  vee-validate's `componentField` fall through to the stock component.
-->
<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const props = defineProps<{
  class?: HTMLAttributes["class"];
}>();
</script>

<template>
  <Input :class="cn('field-underline p-0 py-1', props.class)" />
</template>
