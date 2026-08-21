<script setup lang="ts">
/**
 * What a surface says when it has nothing to show.
 *
 * There were ~52 hand-rolled versions of this, which meant "no results" looked
 * like a different kind of event depending on where you hit it — sometimes a
 * heading, sometimes grey italics, sometimes nothing at all.
 *
 * An empty state should say what would be here and offer the action that puts
 * something here, so pass an action in the default slot whenever one exists.
 * The `variant` distinguishes the two cases that deserve different words:
 * nothing exists yet, versus a filter matched nothing.
 */
withDefaults(
  defineProps<{
    title: string;
    description?: string;
    /** lucide:* icon name. */
    icon?: string;
    /** `empty` = nothing here yet; `search` = a query or filter excluded it all. */
    variant?: "empty" | "search";
    /** Tightens padding for use inside a card or table body. */
    compact?: boolean;
  }>(),
  { icon: "lucide:inbox", variant: "empty", compact: false },
);
</script>

<template>
  <div class="empty-state" :class="{ 'empty-state--compact': compact }">
    <div class="empty-state__icon" aria-hidden="true">
      <Icon :name="variant === 'search' ? 'lucide:search-x' : icon" />
    </div>
    <h3 class="type-card empty-state__title">{{ title }}</h3>
    <p v-if="description" class="type-meta empty-state__description">
      {{ description }}
    </p>
    <div v-if="$slots.default" class="empty-state__actions">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 3rem 1.5rem;
}
.empty-state--compact {
  padding: 1.75rem 1rem;
}

.empty-state__icon {
  display: grid;
  place-items: center;
  width: 3rem;
  height: 3rem;
  margin-bottom: 0.875rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--theme-bg-secondary) 70%, transparent);
  color: var(--theme-text-muted);
}
.empty-state--compact .empty-state__icon {
  width: 2.25rem;
  height: 2.25rem;
  margin-bottom: 0.625rem;
}
/* Nuxt Icon runs in CSS mode here, so `<Icon>` renders a masked
   `<span class="iconify">` and NEVER an `<svg>`. The old `:deep(svg)` rule
   therefore matched nothing and every empty-state icon has been rendering at
   the inherited 1em — a 15px glyph adrift in a 48px circle. Size the wrapper's
   font-size (an iconify span is 1em square) and cover the svg case too, in case
   an icon ever resolves inline. Anchored on `.empty-state__icon`, which is in
   THIS template, so the scope attribute actually lands on it. */
.empty-state__icon {
  font-size: 1.375rem;
}
.empty-state--compact .empty-state__icon {
  font-size: 1.125rem;
}
.empty-state__icon :deep(svg),
.empty-state__icon :deep(.iconify) {
  width: 1.375rem;
  height: 1.375rem;
}
.empty-state--compact .empty-state__icon :deep(svg),
.empty-state--compact .empty-state__icon :deep(.iconify) {
  width: 1.125rem;
  height: 1.125rem;
}

.empty-state__description {
  margin-top: 0.25rem;
  max-width: 42ch;
}
.empty-state__actions {
  margin-top: 1.125rem;
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  justify-content: center;
}
</style>
