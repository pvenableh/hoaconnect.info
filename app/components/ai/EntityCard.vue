<script setup lang="ts">
// Inline "ask the assistant about this record" card for entity detail pages.
// The page has already set the AI focus (setContext), so opening the panel — or
// tapping a pill — lands anchored on this entity, in its own thread. Altitude 1
// of the two-altitude AI UX (the slide-over panel is altitude 2).
const props = defineProps<{
  entityType: string;
  label?: string | null;
  prompts?: string[];
}>();

const { open, openWith } = useAiAssistant();

const DEFAULT_PROMPTS: Record<string, string[]> = {
  member: ["Summarize this member's account", "Any open requests for this member?"],
  vendor: ["What projects has this vendor worked on?", "Draft an email to this vendor"],
  project: ["What's the status of this project?", "What tasks are still open here?"],
  request: ["Summarize this request", "Draft a response to the resident"],
  violation: ["Summarize this violation", "Draft a courtesy notice to the resident"],
  ticket: ["Summarize this ticket", "What's the next step here?"],
  meeting: ["Summarize this meeting's agenda", "Draft a minutes summary"],
  channel: ["Summarize the recent discussion here", "What's unresolved in this channel?"],
};

const pills = computed(() =>
  props.prompts?.length ? props.prompts : DEFAULT_PROMPTS[props.entityType] || ["Tell me about this record"]
);
</script>

<template>
  <div class="ios-card rounded-2xl t-bg-subtle p-4 space-y-3">
    <div class="flex items-center gap-2.5">
      <span class="t-icon-chip"><Icon name="lucide:sparkles" class="w-4 h-4" /></span>
      <div class="min-w-0 flex-1">
        <p class="text-sm font-medium t-text leading-tight">Ask the assistant</p>
        <p class="text-xs t-text-muted truncate">
          Focused on {{ label || entityType }}
        </p>
      </div>
      <button
        type="button"
        class="header-pill"
        title="Open the assistant"
        @click="open()"
      >
        <Icon name="lucide:arrow-up-right" class="w-4 h-4" />
      </button>
    </div>
    <div class="flex flex-wrap gap-2">
      <button
        v-for="p in pills"
        :key="p"
        type="button"
        class="rounded-full border t-border px-3 py-1.5 text-xs t-text-secondary hover:t-bg transition-colors"
        @click="openWith(p)"
      >
        {{ p }}
      </button>
    </div>
  </div>
</template>
