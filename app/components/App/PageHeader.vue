<script setup lang="ts">
/**
 * The top of a workspace page.
 *
 * This block — eyebrow, title, description, actions — was copy-pasted into
 * roughly fifteen pages, each with slightly different type sizes and spacing, so
 * the app appeared to change its mind about how a page starts. One component
 * means the page title is the same size everywhere, and changing it is one edit.
 *
 * In the workspace it REGISTERS rather than renders (usePageTitle): it hands
 * {title, eyebrow → kicker, description → blurb, backTo} to the shell's
 * `<AppHeaderOutlet>` and teleports `#actions` / `#meta` into it. The outlet
 * outlives navigation, so the title changes in place while the page slides, and
 * hands itself to the Nav when you scroll past it. The props are unchanged, so
 * no caller had to.
 *
 * It still renders itself inline (a) where no outlet is listening — a layout
 * without one — and (b) on the server and through hydration, because the
 * outlet renders before the page in SSR and cannot know the title (see the
 * docblock in usePageTitle). At mount it hands off, in the same place.
 *
 * Titles use `type-display`, which is capped at one per page.
 */
const props = withDefaults(
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

const { setPageTitle, hasOutlet } = usePageTitle();

// Inline until mounted ONLY when this render is part of hydration: then the
// server's inline markup has to be matched first. A client-side navigation
// hands off from the first render, so the page never draws a header that is
// about to jump into the outlet.
const nuxtApp = useNuxtApp();
const handedOff = ref(import.meta.client && !nuxtApp.isHydrating);
// The slots teleport only once mounted: on a navigation INTO the workspace the
// layout (and the outlet's targets) mount in the same pass as this page, and a
// Teleport that looks for its target before that pass is attached finds none.
const mounted = ref(false);
onMounted(() => {
  handedOff.value = true;
  mounted.value = true;
});
const inOutlet = computed(() => hasOutlet.value && handedOff.value);

watchEffect(() => {
  if (!inOutlet.value) return;
  setPageTitle({
    title: props.title,
    blurb: props.description ?? null,
    kicker: props.eyebrow ?? null,
    backTo: props.backTo ?? null,
    backLabel: props.backTo ? props.backLabel : null,
  });
});
</script>

<template>
  <template v-if="inOutlet">
    <Teleport v-if="mounted && $slots.actions" to="#app-header-actions">
      <slot name="actions" />
    </Teleport>
    <Teleport v-if="mounted && $slots.meta" to="#app-header-meta">
      <slot name="meta" />
    </Teleport>
  </template>

  <header v-else class="page-header">
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
