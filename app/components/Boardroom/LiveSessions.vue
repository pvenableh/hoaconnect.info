<script setup lang="ts">
/**
 * Meetings running right now — "pull up a chair".
 *
 * Only rendered when somebody else has convened one. A room you are already in
 * is filtered out by the caller, so this never offers you a seat you occupy.
 */
import type { BoardroomSession } from "#core/app/composables/useBoardroomSession";

defineProps<{ sessions: BoardroomSession[]; busy?: boolean }>();
const emit = defineEmits<{ (e: "join", id: string | number): void }>();

const SUBJECT_LABEL: Record<string, string> = {
  requests: "Requests",
  money: "Money",
  projects: "Projects",
  community: "Community",
  vendors: "Vendors",
  meetings: "Meetings",
  operations: "Operations",
};

function label(s: BoardroomSession): string {
  return s.title || s.topic || SUBJECT_LABEL[s.subject || ""] || "Working session";
}
function seatedCount(s: BoardroomSession): number {
  return (s.attendees || []).filter((a) => a.status !== "left").length;
}
function hostName(s: BoardroomSession): string | null {
  return (s.attendees || []).find((a) => a.role === "host")?.name ?? null;
}
</script>

<template>
  <section v-if="sessions.length" aria-label="Live meetings">
    <h2 class="t-overline mb-2 flex items-center gap-2">
      <span class="relative flex w-2 h-2">
        <span
          class="absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75 motion-safe:animate-ping"
        />
        <span class="relative inline-flex rounded-full w-1.5 h-1.5 bg-red-500" />
      </span>
      Live now
    </h2>
    <div class="grid gap-2 sm:grid-cols-2">
      <button
        v-for="s in sessions"
        :key="s.id"
        type="button"
        class="ios-card ios-press p-3.5 text-left flex items-center gap-3 disabled:opacity-50"
        :disabled="busy"
        @click="emit('join', s.id)"
      >
        <span
          class="w-9 h-9 rounded-xl t-bg-accent t-text-accent flex items-center justify-center shrink-0"
          aria-hidden="true"
        >
          <Icon name="i-lucide-users-round" class="w-4.5 h-4.5" />
        </span>
        <span class="min-w-0 flex-1">
          <span class="block text-sm font-semibold t-text truncate">{{ label(s) }}</span>
          <span class="block text-xs t-text-muted truncate">
            <template v-if="hostName(s)">{{ hostName(s) }} · </template>
            {{ seatedCount(s) }} at the table
          </span>
        </span>
        <span class="text-xs font-medium t-text-accent shrink-0">Join</span>
      </button>
    </div>
  </section>
</template>
