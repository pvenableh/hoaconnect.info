<script setup lang="ts">
/**
 * Decision records — the Board Room's minutes, listed where an HOA already
 * keeps its record of itself.
 *
 * This strip's home is the **meetings hub**. Minutes made in a room nobody
 * thinks to open would be the one part of the association's history you had to
 * know about an AI feature to find, and Phase 6's whole argument for a separate
 * `hoa_director_minutes` collection is that a decision outlives the meeting
 * that produced it. The Board Room renders the same strip so the person who
 * recorded a set can see it land.
 */
import type { MinutesListRow } from "#core/app/composables/useBoardroomMinutes";

const props = defineProps<{
  minutes: MinutesListRow[];
  loading?: boolean;
  /** Org-relative base for the detail route, already built by the caller. */
  hrefBase: string;
  /** Suppress the whole block when there is nothing yet (hub usage). */
  hideWhenEmpty?: boolean;
}>();

const SUBJECT_LABEL: Record<string, string> = {
  requests: "Requests",
  money: "Money",
  projects: "Projects",
  community: "Community",
  vendors: "Vendors",
  meetings: "Meetings",
  operations: "Operations",
};

function label(m: MinutesListRow): string {
  return m.title || m.topic || SUBJECT_LABEL[m.subject || ""] || "Working session";
}
function note(m: MinutesListRow): string {
  const parts: string[] = [m.scopeType === "entity" ? "Focused" : "Association-wide"];
  if (m.stats?.total) parts.push(`${m.stats.done} approved of ${m.stats.total}`);
  if (m.authorName) parts.push(m.authorName);
  return parts.join(" · ");
}
function when(iso: string | null): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (!isFinite(t)) return "";
  const mins = Math.floor((Date.now() - t) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
  return new Date(iso).toLocaleDateString();
}

const show = computed(() => !props.hideWhenEmpty || props.loading || props.minutes.length > 0);
</script>

<template>
  <section v-if="show" aria-label="Decision records">
    <h2 class="t-overline mb-2 flex items-center gap-2">
      <Icon name="i-lucide-gavel" class="w-3.5 h-3.5" />
      Decision records
    </h2>

    <div v-if="loading" class="flex items-center gap-2 text-sm t-text-muted py-4">
      <span class="spinner-ios spinner-ios--sm" /> Loading…
    </div>

    <p v-else-if="!minutes.length" class="text-sm t-text-muted py-2">
      Nothing recorded yet. Minutes taken in the Board Room land here.
    </p>

    <div v-else class="grid gap-2 sm:grid-cols-2">
      <NuxtLink
        v-for="m in minutes"
        :key="m.id"
        :to="`${hrefBase}/${m.id}`"
        class="ios-card p-3.5 flex items-center gap-3"
      >
        <span
          class="w-9 h-9 rounded-xl t-bg-subtle t-text-secondary flex items-center justify-center shrink-0"
          aria-hidden="true"
        >
          <Icon name="i-lucide-gavel" class="w-4.5 h-4.5" />
        </span>
        <span class="min-w-0 flex-1">
          <span class="block text-sm font-semibold t-text truncate">{{ label(m) }}</span>
          <span class="block text-xs t-text-muted truncate">
            {{ note(m) }}<template v-if="when(m.dateCreated)"> · {{ when(m.dateCreated) }}</template>
          </span>
        </span>
        <span
          v-if="m.status === 'shared'"
          class="text-[10px] uppercase t-tracking-wider rounded-full px-2 py-0.5 font-medium bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 shrink-0"
        >Shared</span>
      </NuxtLink>
    </div>
  </section>
</template>
