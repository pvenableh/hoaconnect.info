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
 *
 * TEACHING form (Earnest's EEmptyState): a first-run screen should not be a
 * dead end that says "No units yet". Give it the 1-2-3 and a CTA that DOES the
 * thing — the steps are the onboarding, the CTA is the door:
 *
 *   <AppEmptyState
 *     icon="lucide:door-closed"
 *     title="Add your community's units"
 *     :steps="['Add each unit or import a CSV', 'Link owners to their units', 'Invite residents to sign in']"
 *     footnote="You can rename units later."
 *   >
 *     <template #actions>
 *       <Button @click="add">Add Unit</Button>
 *     </template>
 *   </AppEmptyState>
 *
 * Copy rules (docs/button-type-case-system.md): title, description, steps and
 * footnote are prose → sentence case; CTA labels are actions → Title Case.
 * The default slot still renders as the action row, so existing call sites are
 * unchanged; `#actions` is the explicit name for new ones.
 */
const props = withDefaults(
  defineProps<{
    title: string;
    description?: string;
    /** lucide:* icon name. */
    icon?: string;
    /** `empty` = nothing here yet; `search` = a query or filter excluded it all. */
    variant?: "empty" | "search";
    /** The 1-2-3. Two to four entries, each one imperative action. */
    steps?: string[];
    /** A quiet pointer under the CTA — not a step. */
    footnote?: string;
    /** `md` for a whole-surface blank; `sm` inside a card, panel or table body. */
    size?: "sm" | "md";
    /** @deprecated Same as `size="sm"`; kept so existing call sites read unchanged. */
    compact?: boolean;
  }>(),
  { icon: "lucide:inbox", variant: "empty", size: "md", compact: false },
);

const small = computed(() => props.compact || props.size === "sm");
</script>

<template>
  <div class="empty-state" :class="{ 'empty-state--compact': small }">
    <div class="empty-state__icon" aria-hidden="true">
      <Icon :name="variant === 'search' ? 'lucide:search-x' : icon" />
    </div>
    <h3 class="type-card empty-state__title">{{ title }}</h3>
    <p v-if="description" class="type-meta empty-state__description">
      {{ description }}
    </p>
    <ol v-if="steps?.length" class="empty-state__steps">
      <li v-for="(step, i) in steps" :key="i">
        <span class="empty-state__step-num" aria-hidden="true">{{ i + 1 }}</span>
        <span>{{ step }}</span>
      </li>
    </ol>
    <div v-if="$slots.actions || $slots.default" class="empty-state__actions">
      <slot name="actions" />
      <slot />
    </div>
    <p v-if="footnote" class="helper-text empty-state__footnote">{{ footnote }}</p>
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
/* Full-strength muted text, never an alpha of it: these are the lines that do
   the teaching, and an alpha dropped them under 4.5:1 in Earnest's light theme. */
.empty-state__steps {
  margin-top: 1rem;
  max-width: 24rem;
  list-style: none;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  font-size: 0.875rem;
  color: var(--theme-text-muted);
}
.empty-state--compact .empty-state__steps {
  margin-top: 0.75rem;
  gap: 0.375rem;
}
.empty-state__steps li {
  display: flex;
  align-items: flex-start;
  gap: 0.625rem;
  text-align: left;
}
.empty-state__step-num {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 1.25rem;
  height: 1.25rem;
  margin-top: 0.0625rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--theme-bg-secondary) 85%, transparent);
  color: var(--theme-text-secondary);
  font-size: 0.625rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.empty-state__footnote {
  margin-top: 0.75rem;
}
.empty-state__actions {
  margin-top: 1.125rem;
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  justify-content: center;
}
</style>
