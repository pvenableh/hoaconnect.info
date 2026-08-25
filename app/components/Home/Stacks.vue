<script setup lang="ts">
/**
 * The stacks home — the band above the fold on the admin dashboard.
 *
 * Three piles, in the order a day is actually spent: what needs your judgment,
 * what needs your hands, and what is simply worth knowing. Everything below
 * this band is the classic widget grid, unchanged.
 *
 * ── This surface costs nothing to look at ───────────────────────────────────
 * Every source here is a read. The proposals come from the HITL queue, the
 * notices from the deterministic engine (no model call at any point), the
 * unread counts from the channels endpoint, and the briefing headlines from
 * `GET /api/ai/director/briefing`, which serves a SAVED briefing or nothing.
 * There is deliberately no path from mounting this component to
 * `POST /api/ai/director/plan` — that one drafts, and bills. Landing on the
 * dashboard must never spend the community's credits.
 *
 * ── Glass ───────────────────────────────────────────────────────────────────
 * Phase 8 names this band and the Board Room header as the first two adopters
 * of `.glass-refract`. Built that way from the start rather than swept later:
 * the sweep exists to fix surfaces that predate the material, and this one
 * does not.
 */
import type { StackPile } from "#core/app/composables/useStackItems";

const props = defineProps<{
  organizationId?: string | null;
  /** The org's channels — unread counts arrive as ids and carry no names. */
  channels?: Array<{ id: string; name: string; slug?: string | null }>;
}>();

const stackApi = useStackItems(
  () => props.organizationId,
  { channels: () => props.channels || [] }
);
const { stacks, total, loading, load, markHandled, dismissNotice, busyId } = stackApi;

// One Director layer for the whole band: proposing from a notice writes into
// the same queue the Decide pile reads, so the refresh has to happen where that
// queue lives rather than inside a row.
const { proposeFromNotice, proposingId, proposeError } = useDirectorLayer();

const decideEl = ref<{ collapse: () => void } | null>(null);
const doEl = ref<{ collapse: () => void } | null>(null);

const walking = ref<StackPile | null>(null);
const walkOpen = computed({
  get: () => walking.value !== null,
  set: (v: boolean) => {
    if (!v) closeWalk();
  },
});

const walkItems = computed(() => (walking.value ? stacks.value[walking.value] : []));
const walkTitle = computed(() =>
  walking.value === "decide" ? "Decide — one at a time" : "Do — one at a time"
);

function startWalk(pile: StackPile) {
  walking.value = pile;
}

/** Leaving a walk folds the pile it came from back to its collapsed card. */
function closeWalk() {
  const from = walking.value;
  walking.value = null;
  if (from === "decide") decideEl.value?.collapse();
  if (from === "do") doEl.value?.collapse();
}

async function onApprove(id: string) {
  await stackApi.approve(id);
}
async function onReject(id: string) {
  await stackApi.reject(id);
}
async function onUndo(id: string) {
  await stackApi.undo(id);
}
async function onEdit(id: string, payload: Record<string, any>) {
  await stackApi.edit(id, payload);
}

async function onPropose(noticeId: string) {
  const res = await proposeFromNotice(noticeId);
  if (!res) return;
  // The notice has become a row in the queue — re-read both so the fact moves
  // to Decide rather than appearing in two piles at once.
  await load(true);
}

const allClear = computed(
  () => !loading.value && total.value === 0
);

onMounted(() => {
  void load();
});

watch(
  () => props.organizationId,
  () => {
    void load(true);
  }
);
</script>

<template>
  <section
    class="glass-edge glass-body glass-refract rounded-3xl px-4 py-5 sm:px-6 sm:py-6 t-bg-elevated"
    aria-label="What needs you"
  >
    <div class="flex items-start gap-3 mb-4">
      <span
        class="w-10 h-10 rounded-2xl t-bg-accent flex items-center justify-center shrink-0"
        aria-hidden="true"
      >
        <Icon name="i-lucide-layers" class="w-5 h-5 t-text-accent" />
      </span>
      <div class="min-w-0 flex-1">
        <h2 class="t-heading text-lg sm:text-xl font-semibold">What needs you</h2>
        <p class="text-sm t-text-secondary mt-0.5">
          Grouped by the kind of attention it wants, not by where it came from. Nothing here
          is counted twice.
        </p>
      </div>
      <div v-if="loading" class="shrink-0 pt-1">
        <div class="spinner-ios" />
      </div>
    </div>

    <p v-if="proposeError" class="mb-3 text-xs text-red-600 dark:text-red-400">
      {{ proposeError }}
    </p>

    <div v-if="allClear" class="py-6 text-center space-y-2">
      <Icon name="i-lucide-check-circle-2" class="w-9 h-9 mx-auto text-success" />
      <p class="text-sm font-medium t-text">Nothing is waiting on you.</p>
      <p class="text-xs t-text-muted">
        No decisions pending, nothing overdue, no unread conversations.
      </p>
    </div>

    <div v-else class="space-y-6">
      <HomeStack
        ref="decideEl"
        title="Decide"
        summary="Waiting on your judgment"
        cleared-text="Every decision is answered."
        :items="stacks.decide"
        :busy-id="busyId"
        :proposing-id="proposingId"
        walkable
        default-open
        @handled="markHandled"
        @walk="startWalk('decide')"
        @approve="onApprove"
        @reject="onReject"
        @undo="onUndo"
        @edit="onEdit"
        @dismiss="dismissNotice"
        @propose="onPropose"
      />

      <HomeStack
        ref="doEl"
        title="Do"
        summary="Only a person can close these"
        cleared-text="Nothing overdue, nothing unread."
        :items="stacks.do"
        :busy-id="busyId"
        :proposing-id="proposingId"
        walkable
        @handled="markHandled"
        @walk="startWalk('do')"
        @approve="onApprove"
        @reject="onReject"
        @undo="onUndo"
        @edit="onEdit"
        @dismiss="dismissNotice"
        @propose="onPropose"
      />

      <HomeStack
        title="Know"
        summary="Worth reading, nothing required"
        cleared-text="You are up to date."
        :items="stacks.know"
        :busy-id="busyId"
        :proposing-id="proposingId"
        @handled="markHandled"
        @approve="onApprove"
        @reject="onReject"
        @undo="onUndo"
        @edit="onEdit"
        @dismiss="dismissNotice"
        @propose="onPropose"
      />
    </div>

    <HomeStackClearWizard
      v-model="walkOpen"
      :title="walkTitle"
      :items="walkItems"
      :busy-id="busyId"
      :proposing-id="proposingId"
      @handled="markHandled"
      @approve="onApprove"
      @reject="onReject"
      @undo="onUndo"
      @edit="onEdit"
      @dismiss="dismissNotice"
      @propose="onPropose"
    />
  </section>
</template>
