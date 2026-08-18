<!--
  StaggerList — app-wide staggered entrance for any list.

  Wraps each item in a `v-motion` element bound to `useMotionPresets().rise(i)`,
  the same spring rise used by Admin/SectionHub + the dashboard widgets, so
  directories, requests, documents, payments, etc. all share ONE motion
  language. Reduced motion is handled inside the preset (instant, transform-free
  reveal) — nothing here branches on it.

    <StaggerList :items="rows" v-slot="{ item }">
      <RequestRow :request="item" />
    </StaggerList>

  The outer container + per-item element tags/classes are overridable so the
  wrapper fits flex stacks, CSS grids, or plain blocks without breaking layout.
-->
<script setup lang="ts" generic="T">
import type { RiseOptions } from "#core/shared/motion/presets";

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
    /** Per-item stagger step (ms). */
    stagger?: number;
    /** Upward offset (px) items rise from. */
    y?: number;
    /** Base delay (ms) before the staggered offset. */
    base?: number;
  }>(),
  { tag: "div", itemTag: "div" },
);

const { rise } = useMotionPresets();

const riseOpts = computed<RiseOptions>(() => {
  const o: RiseOptions = {};
  if (props.stagger !== undefined) o.stagger = props.stagger;
  if (props.y !== undefined) o.y = props.y;
  if (props.base !== undefined) o.base = props.base;
  return o;
});

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
      v-motion
      v-bind="rise(i, riseOpts)"
      :class="itemClass"
    >
      <slot :item="item" :index="i" />
    </component>
  </component>
</template>
