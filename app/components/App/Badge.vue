<!--
  AppBadge — HOA Connect's badge: the stock shadcn-vue <Badge> (new-york-v4,
  left as shipped in app/components/ui/, so it can be updated by re-pulling it)
  as the workspace has always drawn it.

  Stock is already a pill. The classes below replace the stock ones they
  conflict with (tailwind-merge), so the badge keeps its look:
  - an inline <span> (stock renders a <div>, invalid inside <p> or a heading);
  - semibold, px-2.5, no gap (a caller's icon carries its own margin);
  - it wraps, shrinks and does not clip, like any inline text (stock is
    nowrap, shrink-0, w-fit and overflow-hidden);
  - default / destructive keep their small lift, destructive keeps
    `text-destructive-foreground` and its full fill in the dark (stock is
    `text-white` and `dark:bg-destructive/60`); outline keeps the border token.
  Stock darkens a badge on hover only when it is a link; that is kept.

  Use <AppBadge> in the app; <Badge> only inside ui/. `variant`, `as` and the
  rest fall through to the stock component.
-->
<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import type { BadgeVariants } from "@/components/ui/badge";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const props = withDefaults(
  defineProps<{
    variant?: BadgeVariants["variant"];
    as?: string;
    class?: HTMLAttributes["class"];
  }>(),
  { variant: "default", as: "span" },
);

const variantClasses: Record<NonNullable<BadgeVariants["variant"]>, string> = {
  default: "shadow-sm",
  secondary: "",
  destructive: "shadow-sm text-destructive-foreground dark:bg-destructive",
  outline: "border-border",
};
</script>

<template>
  <Badge
    :as="props.as"
    :variant="props.variant"
    :class="cn(
      'px-2.5 font-semibold gap-0 justify-start w-auto whitespace-normal shrink overflow-visible',
      variantClasses[props.variant ?? 'default'],
      props.class,
    )"
  >
    <slot />
  </Badge>
</template>
