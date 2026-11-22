<script setup lang="ts">
// Work board: status columns for requests. Drag a card to a column, or use its
// "Move to…" menu; both call the same plan and the existing `applyTransition`.
import type { RequestRow } from "#core/app/composables/useRequests";
import { getWorkflow } from "#core/app/config/requestWorkflows";
import { REQUEST_BOARD_COLUMNS, groupRequests, moveTargets, planBoardMove, type BoardStatus } from "#core/shared/requests/board";
import { toast } from "vue-sonner";

const props = defineProps<{ requests: RequestRow[]; basePath: string }>();
const emit = defineEmits<{ moved: [] }>();

const { applyTransition } = useRequests();
const slide = useAppSlideOver("request");
const columns = computed(() => groupRequests(props.requests));
const MIME = "application/x-request-id";
const live = ref("");
const busy = ref(false);

const find = (id: string) => props.requests.find((r) => r.id === id);

async function move(r: RequestRow, to: BoardStatus) {
  const plan = planBoardMove(r, to);
  if (!plan) {
    toast.error(`${getWorkflow(r.type).label} can't go straight to that column`);
    return;
  }
  const from = (r.metadata?.workflow_state as string) || getWorkflow(r.type).initialState;
  busy.value = true;
  try {
    await applyTransition(r, plan.state, plan.label);
    live.value = `Moved ${r.title} to ${REQUEST_BOARD_COLUMNS.find((c) => c.key === to)?.label}`;
    emit("moved");
    toast(`Moved to ${REQUEST_BOARD_COLUMNS.find((c) => c.key === to)?.label}`, {
      description: r.title ?? undefined,
      action: {
        label: "Undo",
        onClick: async () => {
          const back = { ...r, status: getStateStatus(r, plan.state), metadata: { ...(r.metadata || {}), workflow_state: plan.state } } as RequestRow;
          try {
            await applyTransition(back, from, "Undone");
            emit("moved");
          } catch {
            toast.error("Could not undo");
          }
        },
      },
    });
  } catch (e: any) {
    toast.error(e?.message || "Could not move request");
  } finally {
    busy.value = false;
  }
}

function getStateStatus(r: RequestRow, state: string) {
  return getWorkflow(r.type).states.find((s) => s.value === state)?.status ?? r.status;
}

function onDragStart(e: DragEvent, r: RequestRow) {
  e.dataTransfer?.setData(MIME, r.id);
  if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
}
function onDrop(id: string, to: BoardStatus) {
  const r = find(id);
  if (r) void move(r, to);
}
function onMoveSelect(r: RequestRow, ev: Event) {
  const el = ev.target as HTMLSelectElement;
  const to = el.value as BoardStatus;
  el.value = "";
  if (to) void move(r, to);
}
function open(r: RequestRow, ev: MouseEvent) {
  ev.preventDefault();
  slide.open(r.id, { mode: "board", flipFrom: flipPayloadFrom(ev.currentTarget as HTMLElement) });
}
</script>

<template>
  <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
    <AppDropTarget
      v-for="col in REQUEST_BOARD_COLUMNS"
      :key="col.key"
      :accepts="[MIME]"
      :type="MIME"
      class="rounded-2xl"
      @drop="(id: string) => onDrop(id, col.key)"
    >
      <section class="t-bg-subtle rounded-2xl p-2 min-h-32" :aria-label="`${col.label} requests`">
        <p class="type-micro px-2 py-1 font-semibold uppercase tracking-wider t-text-tertiary">
          {{ col.label }} <span class="t-text-muted">{{ columns[col.key].length }}</span>
        </p>
        <ul class="space-y-2">
          <li
            v-for="r in columns[col.key]"
            :key="r.id"
            class="ios-card p-3 cursor-grab active:cursor-grabbing"
            :draggable="!busy"
            @dragstart="onDragStart($event, r)"
          >
            <NuxtLink :to="`${basePath}/${r.id}`" class="block font-medium t-text truncate" @click="open(r, $event)">
              {{ r.title }}
            </NuxtLink>
            <p class="text-xs t-text-muted truncate">{{ getWorkflow(r.type).label }}</p>
            <label v-if="moveTargets(r).length" class="mt-2 block">
              <span class="sr-only">Move {{ r.title }} to</span>
              <select
                class="w-full rounded-lg border t-border bg-transparent px-2 py-1 text-xs t-text-secondary"
                :disabled="busy"
                @change="onMoveSelect(r, $event)"
              >
                <option value="">Move to…</option>
                <option v-for="t in moveTargets(r)" :key="t.key" :value="t.key">{{ t.label }}</option>
              </select>
            </label>
          </li>
        </ul>
      </section>
    </AppDropTarget>
    <span class="sr-only" aria-live="polite">{{ live }}</span>
  </div>
</template>
