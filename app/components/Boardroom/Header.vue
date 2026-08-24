<script setup lang="ts">
/**
 * The Board Room's hero header — and the first surface in the app to wear
 * `.glass-refract`.
 *
 * Phase 8 of the Round 2 plan names this and the stacks home as the natural
 * first adopters of the true gradient rim: a 1px band whose colour actually
 * travels from the bright top edge to nothing. Building it in now rather than
 * sweeping it later is deliberate — the sweep's job is fixing surfaces that
 * were built before the material existed, and this one wasn't.
 *
 * It carries the room's whole live state: who is at the table, what just
 * happened, and the one control that changes it.
 */
import type { BoardroomAttendee, BoardroomActivity } from "#core/app/composables/useBoardroomSession";

const props = defineProps<{
  live?: boolean;
  isHost?: boolean;
  attendees?: BoardroomAttendee[];
  lastActivity?: BoardroomActivity | null;
  busy?: boolean;
  title?: string | null;
}>();

const emit = defineEmits<{
  (e: "convene"): void;
  (e: "leave"): void;
  (e: "end"): void;
}>();

const seated = computed(() => props.attendees || []);

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

/** The last thing that happened, as a sentence rather than a payload. */
const activityLine = computed(() => {
  const a = props.lastActivity;
  if (!a) return null;
  const who = a.actorName || "Someone";
  if (a.type === "decision") {
    const verb =
      a.status === "executed"
        ? "approved"
        : a.status === "rejected"
          ? "set aside"
          : a.status === "failed"
            ? "hit a problem with"
            : "decided on";
    return `${who} ${verb} “${a.label}”`;
  }
  return `${who} ${a.label || "did something"}`;
});
</script>

<template>
  <header
    class="glass-edge glass-body glass-refract rounded-3xl px-5 py-5 sm:px-7 sm:py-6 t-bg-elevated"
  >
    <div class="flex items-start gap-4 flex-wrap sm:flex-nowrap">
      <span
        class="w-12 h-12 rounded-2xl t-bg-accent flex items-center justify-center shrink-0"
        aria-hidden="true"
      >
        <Icon name="i-lucide-gavel" class="w-6 h-6 t-text-accent" />
      </span>

      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2 flex-wrap">
          <h1 class="t-heading text-xl sm:text-2xl font-semibold truncate">
            {{ title || "The Board Room" }}
          </h1>
          <span
            v-if="live"
            class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium bg-red-500/15 text-red-600 dark:text-red-400"
          >
            <span class="relative flex w-1.5 h-1.5">
              <span
                class="absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75 motion-safe:animate-ping"
              />
              <span class="relative inline-flex rounded-full w-1.5 h-1.5 bg-red-500" />
            </span>
            Live
          </span>
        </div>
        <p class="text-sm t-text-secondary mt-1 max-w-2xl">
          The assistant reviews what your association is actually carrying, briefs the board on
          it, and proposes numbered next steps. Every step is a proposal — nothing runs until
          somebody approves it.
        </p>

        <div v-if="live" class="flex items-center gap-2 mt-3 flex-wrap">
          <div v-if="seated.length" class="flex items-center -space-x-1.5">
            <span
              v-for="a in seated.slice(0, 5)"
              :key="a.userId"
              class="w-7 h-7 rounded-full t-bg-subtle ring-2 ring-[var(--theme-bg-elevated,#fff)] flex items-center justify-center text-[10px] font-semibold t-text-secondary"
              :title="`${a.name}${a.role === 'host' ? ' · host' : ''}`"
            >{{ initials(a.name) }}</span>
          </div>
          <span class="text-xs t-text-muted">
            {{ seated.length }} at the table
          </span>
          <span v-if="activityLine" class="text-xs t-text-muted truncate">
            · {{ activityLine }}
          </span>
        </div>
      </div>

      <div class="flex items-center gap-2 shrink-0">
        <button
          v-if="!live"
          type="button"
          class="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium t-btn ios-press disabled:opacity-50"
          :disabled="busy"
          @click="emit('convene')"
        >
          <Icon name="i-lucide-users-round" class="w-4 h-4" />
          Convene the board
        </button>
        <template v-else>
          <button
            v-if="!isHost"
            type="button"
            class="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium t-btn-outline ios-press disabled:opacity-50"
            :disabled="busy"
            @click="emit('leave')"
          >
            <Icon name="i-lucide-log-out" class="w-4 h-4" />
            Leave
          </button>
          <button
            v-else
            type="button"
            class="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium t-btn-outline ios-press disabled:opacity-50"
            :disabled="busy"
            @click="emit('end')"
          >
            <Icon name="i-lucide-square" class="w-4 h-4" />
            End meeting
          </button>
        </template>
      </div>
    </div>
  </header>
</template>
