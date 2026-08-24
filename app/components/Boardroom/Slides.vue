<script setup lang="ts">
/**
 * The TL;DR strip — the briefing's takeaways as slides.
 *
 * `points` arrives already split off the prose by `splitTldr()` on the server,
 * so there is no parsing here: each entry is one self-contained takeaway, ten
 * words or fewer, written to be read verbatim.
 *
 * The strip doubles as the presenter's pointer in a live meeting. Clicking a
 * slide moves everybody's room along, which is why `current` is a prop rather
 * than local state — the server owns where the room is looking.
 */
const props = defineProps<{
  points: string[];
  current?: number;
  /** A live meeting the caller is presenting: slides become clickable. */
  interactive?: boolean;
}>();

const emit = defineEmits<{ (e: "select", index: number): void }>();

const has = computed(() => (props.points || []).length > 0);
</script>

<template>
  <section v-if="has" aria-label="Takeaways">
    <h2 class="t-overline mb-2">The short version</h2>
    <ol class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      <li v-for="(p, i) in points" :key="i">
        <component
          :is="interactive ? 'button' : 'div'"
          :type="interactive ? 'button' : undefined"
          class="w-full h-full text-left ios-card p-3.5 flex items-start gap-3"
          :class="[
            interactive ? 'ios-press cursor-pointer' : '',
            current === i ? 't-border-accent ring-1 ring-[var(--theme-accent)]' : '',
          ]"
          @click="interactive ? emit('select', i) : undefined"
        >
          <span
            class="w-6 h-6 rounded-lg t-bg-accent t-text-accent text-xs font-semibold flex items-center justify-center shrink-0 tabular-nums"
            aria-hidden="true"
          >{{ i + 1 }}</span>
          <span class="text-sm t-text leading-snug">{{ p }}</span>
        </component>
      </li>
    </ol>
  </section>
</template>
