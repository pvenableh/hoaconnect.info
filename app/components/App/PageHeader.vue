<script setup lang="ts">
/**
 * The top of a workspace page.
 *
 * This block — eyebrow, title, description, actions — was copy-pasted into
 * roughly fifteen pages, each with slightly different type sizes and spacing, so
 * the app appeared to change its mind about how a page starts. One component
 * means the page title is the same size everywhere, and changing it is one edit.
 *
 * Titles use `type-display`, which is capped at one per page.
 */
withDefaults(
  defineProps<{
    title: string;
    /** Small uppercase line above the title — usually the section or org name. */
    eyebrow?: string;
    description?: string;
    /** Renders a back affordance. Use for drill-down pages, not section roots. */
    backTo?: string;
    backLabel?: string;
  }>(),
  { backLabel: "Back" },
);
</script>

<template>
  <header class="page-header">
    <NuxtLink v-if="backTo" :to="backTo" class="page-header__back type-meta">
      <Icon name="lucide:chevron-left" class="size-3.5" />
      {{ backLabel }}
    </NuxtLink>

    <div class="page-header__row">
      <div class="page-header__text">
        <p v-if="eyebrow" class="type-micro page-header__eyebrow">{{ eyebrow }}</p>
        <h1 class="type-display">{{ title }}</h1>
        <p v-if="description" class="type-body page-header__description">
          {{ description }}
        </p>
        <slot name="meta" />
      </div>

      <div v-if="$slots.actions" class="page-header__actions">
        <slot name="actions" />
      </div>
    </div>
  </header>
</template>

<style scoped>
.page-header {
  margin-bottom: 1.5rem;
}
.page-header__back {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  margin-bottom: 0.5rem;
  /* Sits on the same content column as the title. */
  padding-inline-start: var(--surface-inset, 1.25rem);
  color: var(--theme-text-muted);
  transition: color var(--motion-fast, 160ms) ease;
}
.page-header__back:hover {
  color: var(--theme-text-primary);
}
.page-header__row {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1rem;
}
.page-header__text {
  min-width: 0;
}
.page-header__eyebrow {
  padding-inline-start: var(--surface-inset, 1.25rem);
  margin-bottom: 0.25rem;
}
.page-header__description {
  /* `type-section`/`type-display` carry the inset; a following paragraph has to
     match it or the text column visibly steps in and out. */
  padding-inline-start: var(--surface-inset, 1.25rem);
  margin-top: 0.25rem;
  max-width: 60ch;
}
.page-header__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}
</style>
