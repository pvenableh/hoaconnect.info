<script setup lang="ts">
import type { RequestRow } from "~/composables/useRequests";
import { getWorkflow, getStateMeta } from "~/config/requestWorkflows";

const props = defineProps<{
  requests: RequestRow[];
  basePath: string;
  loading?: boolean;
  /**
   * Open rows in the slide-over panel stack (?slide=request:id) instead of
   * navigating to the full page. The full page stays reachable by URL.
   * `panelMode: "board"` lights the board affordances inside the panel.
   */
  panel?: boolean;
  panelMode?: string;
}>();

const slide = useAppSlideOver("request");

function openRow(r: RequestRow, ev: MouseEvent) {
  if (!props.panel) return;
  ev.preventDefault();
  const row = (ev.currentTarget as HTMLElement) ?? undefined;
  slide.open(r.id, {
    mode: props.panelMode,
    flipFrom: flipPayloadFrom(row),
  });
}

const accentClass: Record<string, string> = {
  amber: "bg-amber-50 text-amber-700 dark:bg-amber-500/20 dark:text-amber-200",
  violet: "bg-violet-50 text-violet-700 dark:bg-violet-500/20 dark:text-violet-200",
  red: "bg-red-50 text-red-700 dark:bg-red-500/20 dark:text-red-200",
  orange: "bg-orange-50 text-orange-700 dark:bg-orange-500/20 dark:text-orange-200",
  sky: "bg-sky-50 text-sky-700 dark:bg-sky-500/20 dark:text-sky-200",
};

const stateLabel = (r: RequestRow) =>
  getStateMeta(r.type, (r.metadata?.workflow_state as string) || undefined).label;

const personName = (p: RequestRow["assigned_to"]) => {
  if (!p || typeof p === "string") return null;
  return `${p.first_name || ""} ${p.last_name || ""}`.trim() || null;
};

const formatDate = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";
</script>

<template>
  <div>
    <WidgetRowSkeleton v-if="loading" :rows="5" avatar-shape="square" />

    <div v-else-if="!requests.length" class="py-16 text-center">
      <div class="w-14 h-14 rounded-full t-bg-subtle flex items-center justify-center mx-auto mb-3">
        <Icon name="lucide:clipboard-list" class="w-7 h-7 t-text-muted" />
      </div>
      <p class="t-text-muted">No requests yet.</p>
    </div>

    <StaggerList
      v-else
      :items="requests"
      tag="ul"
      item-tag="li"
      class="divide-y divide-black/[0.06] dark:divide-white/[0.08]"
      v-slot="{ item: r }"
    >
        <NuxtLink
          :to="`${basePath}/${r.id}`"
          class="flex items-center gap-3 px-3 py-3 hover:t-bg-subtle rounded-xl transition-colors"
          @click="openRow(r, $event)"
        >
          <div
            class="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
            :class="accentClass[getWorkflow(r.type).accent] || 't-bg-subtle t-text-secondary'"
          >
            <Icon :name="getWorkflow(r.type).icon" class="w-4.5 h-4.5" />
          </div>

          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2">
              <p class="font-medium t-text truncate">{{ r.title }}</p>
              <span
                v-if="r.priority === 'urgent'"
                class="text-[10px] font-semibold text-red-600 uppercase"
              >Urgent</span>
            </div>
            <p class="text-xs t-text-muted truncate">
              {{ getWorkflow(r.type).label }}
              <template v-if="personName(r.assigned_to)"> · {{ personName(r.assigned_to) }}</template>
            </p>
          </div>

          <div class="flex flex-col items-end gap-1 flex-shrink-0">
            <span
              class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium"
              :class="accentClass[getWorkflow(r.type).accent] || 't-bg-subtle t-text-secondary'"
            >
              {{ stateLabel(r) }}
            </span>
            <span class="text-xs t-text-muted">{{ formatDate(r.date_updated || r.date_created) }}</span>
          </div>
        </NuxtLink>
    </StaggerList>
  </div>
</template>
