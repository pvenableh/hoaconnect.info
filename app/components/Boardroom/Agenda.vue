<script setup lang="ts">
/**
 * What this session is about.
 *
 * The seven subjects are exactly the buckets `collectDirectorAgenda()` sorts
 * notices into on the server — the picker cannot offer a subject the grounding
 * cannot fill. "The whole association" is the absence of a subject, not an
 * eighth one, which is why its value is empty.
 *
 * Drafting is never automatic. Reopening a subject is free and instant (the
 * server serves a six-hour cache and re-reads its steps live); redrafting
 * redraws and bills the wallet, so it is a separate, quieter control that says
 * what it costs.
 */
const props = defineProps<{
  subject: string;
  topic: string;
  busy?: boolean;
  /** A plan is already on the table for this subject. */
  hasPlan?: boolean;
  cached?: boolean;
}>();

const emit = defineEmits<{
  (e: "update:subject", v: string): void;
  (e: "update:topic", v: string): void;
  (e: "draft"): void;
  (e: "redraft"): void;
}>();

const SUBJECTS = [
  { value: "", label: "The whole association", icon: "i-lucide-building-2" },
  { value: "requests", label: "Requests", icon: "i-lucide-clipboard-list" },
  { value: "money", label: "Money", icon: "i-lucide-banknote" },
  { value: "projects", label: "Projects", icon: "i-lucide-kanban-square" },
  { value: "meetings", label: "Meetings", icon: "i-lucide-calendar-days" },
  { value: "community", label: "Community", icon: "i-lucide-messages-square" },
  { value: "vendors", label: "Vendors", icon: "i-lucide-hard-hat" },
  { value: "operations", label: "Operations", icon: "i-lucide-settings-2" },
];

const topicModel = computed({
  get: () => props.topic,
  set: (v: string) => emit("update:topic", v),
});
</script>

<template>
  <section class="ios-card p-4 sm:p-5" aria-label="Agenda">
    <h2 class="t-overline mb-3">On the agenda</h2>

    <div class="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Session subject">
      <button
        v-for="s in SUBJECTS"
        :key="s.value || 'all'"
        type="button"
        role="radio"
        :aria-checked="subject === s.value"
        class="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ios-press transition-colors"
        :class="
          subject === s.value
            ? 't-bg-accent t-text-accent'
            : 't-bg-subtle t-text-secondary hover:t-text'
        "
        @click="emit('update:subject', s.value)"
      >
        <Icon :name="s.icon" class="w-3.5 h-3.5" />
        {{ s.label }}
      </button>
    </div>

    <div class="mt-3 flex flex-col sm:flex-row sm:items-center gap-2">
      <input
        v-model="topicModel"
        type="text"
        placeholder="Anything specific? e.g. the pool resurfacing bids"
        class="flex-1 rounded-full glass-field px-4 py-2 text-sm focus:outline-none t-focus-ring"
        @keydown.enter="!busy && emit('draft')"
      />
      <button
        type="button"
        class="inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-medium t-btn ios-press disabled:opacity-50 shrink-0"
        :disabled="busy"
        @click="emit('draft')"
      >
        <Icon
          :name="busy ? 'i-lucide-loader-2' : 'i-lucide-list-checks'"
          class="w-4 h-4"
          :class="busy ? 'animate-spin' : ''"
        />
        {{ busy ? "Drafting…" : hasPlan ? "Open the briefing" : "Draft a plan" }}
      </button>
    </div>

    <p v-if="hasPlan" class="mt-2 text-[11px] t-text-muted flex items-center gap-2 flex-wrap">
      <span v-if="cached">
        This briefing was already written, so reopening it cost nothing.
      </span>
      <button
        type="button"
        class="inline-flex items-center gap-1 underline underline-offset-2 hover:t-text disabled:opacity-50"
        :disabled="busy"
        @click="emit('redraft')"
      >
        <Icon name="i-lucide-refresh-cw" class="w-3 h-3" />
        Draft it again against today's facts — this one uses credits
      </button>
    </p>
  </section>
</template>
