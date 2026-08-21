<script setup lang="ts">
/**
 * The content half of a segmented control — the part that moves.
 *
 * A tab strip tells you there are sibling views laid out in a row; the content
 * should behave like it. Swapping panels with `v-if` breaks that promise: the
 * strip says "you moved right" and the content just cuts, so the only thing
 * carrying the direction is a 22px thumb. Here the panel travels the way you
 * went — right-to-left going forward, the reverse coming back — which is the
 * same language the route-level push/pop speaks one level up.
 *
 * Direction comes from the tab's POSITION in the row, not from history, so
 * jumping from the first tab to the fourth still reads as moving right.
 *
 * Usage — one panel at a time, keyed by the active value:
 *
 *   <AppSegmentedControl v-model="tab" :items="items" />
 *   <AppTabPanels :value="tab" :items="items">
 *     <MembersTable v-if="tab === 'members'" />
 *     <InviteForm v-else-if="tab === 'invite'" />
 *   </AppTabPanels>
 */
const props = defineProps<{
  /** The active tab value. */
  value: string;
  /** The same items given to the segmented control — this is what orders them. */
  items: readonly { value: string }[];
}>();

const direction = ref<"forward" | "back">("forward");

watch(
  () => props.value,
  (next, previous) => {
    const from = props.items.findIndex((i) => i.value === previous);
    const to = props.items.findIndex((i) => i.value === next);
    // Unknown positions fall forward: an arbitrary direction reads better than
    // a cut, and it is the direction people expect when opening something new.
    direction.value = from === -1 || to === -1 || to >= from ? "forward" : "back";
  },
);

// `out-in` so the two panels never overlap. Panels are page-height and full
// width; running them simultaneously would need absolute positioning and would
// collapse the page's scroll height mid-transition.
const name = computed(() => `tab-${direction.value}`);
</script>

<template>
  <Transition :name="name" mode="out-in">
    <div :key="value" class="tab-panel">
      <slot />
    </div>
  </Transition>
</template>

<style scoped>
.tab-panel {
  /* Contain the horizontal travel so a panel sliding in cannot widen the page
     and flash a scrollbar. */
  overflow-x: clip;
}
</style>
