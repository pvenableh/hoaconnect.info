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
  amber: "bg-amber-50 text-amber-700",
  violet: "bg-violet-50 text-violet-700",
  red: "bg-red-50 text-red-700",
  orange: "bg-orange-50 text-orange-700",
  sky: "bg-sky-50 text-sky-700",
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
      <div class="w-14 h-14 rounded-full bg-stone-100 flex items-center justify-center mx-auto mb-3">
        <Icon name="lucide:clipboard-list" class="w-7 h-7 text-stone-400" />
      </div>
      <p class="text-stone-500">No requests yet.</p>
    </div>

    <StaggerList
      v-else
      :items="requests"
      tag="ul"
      item-tag="li"
      class="divide-y divide-stone-100"
      v-slot="{ item: r }"
    >
        <NuxtLink
          :to="`${basePath}/${r.id}`"
          class="flex items-center gap-3 px-3 py-3 hover:bg-stone-50 rounded-xl transition-colors"
          @click="openRow(r, $event)"
        >
          <div
            class="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
            :class="accentClass[getWorkflow(r.type).accent] || 'bg-stone-100 text-stone-600'"
          >
            <Icon :name="getWorkflow(r.type).icon" class="w-4.5 h-4.5" />
          </div>

          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2">
              <p class="font-medium text-stone-900 truncate">{{ r.title }}</p>
              <span
                v-if="r.priority === 'urgent'"
                class="text-[10px] font-semibold text-red-600 uppercase"
              >Urgent</span>
            </div>
            <p class="text-xs text-stone-500 truncate">
              {{ getWorkflow(r.type).label }}
              <template v-if="personName(r.assigned_to)"> · {{ personName(r.assigned_to) }}</template>
            </p>
          </div>

          <div class="flex flex-col items-end gap-1 flex-shrink-0">
            <span
              class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium"
              :class="accentClass[getWorkflow(r.type).accent] || 'bg-stone-100 text-stone-600'"
            >
              {{ stateLabel(r) }}
            </span>
            <span class="text-xs text-stone-400">{{ formatDate(r.date_updated || r.date_created) }}</span>
          </div>
        </NuxtLink>
    </StaggerList>
  </div>
</template>
