<!--
  StaggerList — app-wide staggered entrance for any list.

  Each item gets `.stagger-item` (earnest-ui.css), the CSS entrance the rest of
  the app uses, so directories, requests, documents, payments, etc. all share ONE
  motion language. The delay comes from `:nth-child`, which is why the items are
  direct children of the container and nothing else may sit between them.

    <StaggerList :items="rows" v-slot="{ item }">
      <RequestRow :request="item" />
    </StaggerList>

  Reduced motion is handled by the class itself (instant, transform-free reveal)
  — nothing here branches on it.

  The outer container + per-item element tags/classes are overridable so the
  wrapper fits flex stacks, CSS grids, or plain blocks without breaking layout.
-->
<script setup lang="ts" generic="T">
const props = withDefaults(
  defineProps<{
    /** Items to render; each gets a staggered entrance by index. */
    items: T[];
    /** Container element tag. */
    tag?: string;
    /** Per-item wrapper element tag (use `li` inside a `ul`, etc.). */
    itemTag?: string;
    /** Class applied to the container element. */
    class?: unknown;
    /** Class applied to each item wrapper. */
    itemClass?: unknown;
  }>(),
  { tag: "div", itemTag: "div" },
);

function keyOf(item: T, i: number): string | number {
  if (item && typeof item === "object" && "id" in item) {
    return (item as { id: string | number }).id;
  }
  return i;
}
</script>

<template>
  <component :is="tag" :class="props.class">
    <component
      :is="itemTag"
      v-for="(item, i) in items"
      :key="keyOf(item, i)"
      class="stagger-item"
      :class="itemClass"
    >
      <slot :item="item" :index="i" />
    </component>
  </component>
</template>
