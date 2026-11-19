<!--
  AppButton — HOA Connect's button: the stock shadcn-vue <Button> (left as
  shipped in app/components/ui/, so it can be updated by re-pulling it) as a
  pill wearing the workspace's glass tiers. The classes per variant, and why
  outline / secondary need an unlayered restatement, are in ./button-variants.ts.

  Use <AppButton> in the app; <Button> only inside ui/. `variant` and `size`
  are read here and passed on; `as`, `as-child`, `type`, `disabled`, listeners
  and the rest fall through to the stock component. For an element that is not
  a button component, use `appButtonVariants()` from ./button-variants.
-->
<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import type { ButtonVariants } from "@/components/ui/button";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { appButtonClasses } from "./button-variants";

const props = defineProps<{
  variant?: ButtonVariants["variant"];
  size?: ButtonVariants["size"];
  class?: HTMLAttributes["class"];
}>();
</script>

<template>
  <Button
    :variant="props.variant"
    :size="props.size"
    :class="cn(appButtonClasses({ variant: props.variant }), props.class)"
  >
    <slot />
  </Button>
</template>
