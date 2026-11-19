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
 * ── One line (Session 18) ───────────────────────────────────────────────────
 * The band's head is the same line as the hub pages' Worth a look
 * (Director/Layer.vue): an icon, the name, the counts ("2 to decide · 12 to
 * do"), and a chevron. Open by default here (it is the dashboard's job); a
 * person who shuts it keeps it shut, on every device (app prefs,
 * `attention.home`). The piles, their rows and every action are unchanged
 * once it is open.
 *
 * ── Glass ───────────────────────────────────────────────────────────────────
 * The band is a solid content card (`ios-card`): glass is the floating layer
 * only (docs/plan-role-first-ux.md §2.4), and this is content. It first
 * adopted `.glass-refract`; Phase 4 part 2 took the glass off.
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

// ── The line: open or shut, the person's choice ─────────────────────────────
const bodyId = useId();
const { attentionOpen, setAttentionOpen } = useAppearance();
const open = attentionOpen("home");
const toggle = () => setAttentionOpen("home", !open.value);
/** "2 to decide · 12 to do": the piles that hold something. */
const tally = computed(() => {
  if (loading.value && !total.value) return "Loading…";
  if (allClear.value) return "Nothing is waiting on you";
  const parts = [
    [stacks.value.decide.length, "to decide"],
    [stacks.value.do.length, "to do"],
    [stacks.value.know.length, "to know"],
  ] as const;
  return parts.filter(([n]) => n > 0).map(([n, w]) => `${n} ${w}`).join(" · ");
});

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
    class="stacks ios-card"
    :class="{ 'stacks--open': open }"
    aria-labelledby="stacks-title"
    data-attention-line
  >
    <h2 id="stacks-title" class="stacks__head">
      <button
        type="button"
        class="stacks__toggle"
        :aria-expanded="open"
        :aria-controls="bodyId"
        data-attention-toggle
        @click="toggle"
      >
        <span class="t-icon-chip w-8 h-8 shrink-0" aria-hidden="true">
          <Icon name="i-lucide-layers" class="w-4 h-4" />
        </span>
        <span class="t-heading text-base font-semibold t-text shrink-0">What needs you</span>
        <span class="text-sm t-text-secondary truncate min-w-0" data-attention-tally>{{ tally }}</span>
        <span v-if="loading" class="shrink-0"><span class="spinner-ios" /></span>
        <Icon
          name="i-lucide-chevron-down"
          class="stacks__chevron w-4 h-4 t-text-muted shrink-0 ml-auto"
          aria-hidden="true"
        />
        <span class="sr-only">{{ open ? "Hide" : "Show" }}</span>
      </button>
    </h2>

    <div v-if="open" :id="bodyId" class="stacks__body">
    <p class="text-sm t-text-secondary mb-4">
      Grouped by the kind of attention it wants, not by where it came from. Nothing here
      is counted twice.
    </p>

    <p v-if="proposeError" class="mb-3 text-xs text-red-600 dark:text-red-400">
      {{ proposeError }}
    </p>

    <div v-if="allClear" class="py-4 text-center space-y-2">
      <Icon name="i-lucide-check-circle-2" class="w-9 h-9 mx-auto text-success" />
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

<style scoped>
/* The same line as Worth a look (Director/Layer.vue): a 52px pill shut, a
   card open. */
.stacks {
  border-radius: 1.625rem;
  padding: 0.375rem 1rem 0.375rem 0.5rem;
}
.stacks.stacks--open {
  padding: 0.375rem 1rem 1.25rem;
}
.stacks__head {
  margin: 0;
}
.stacks__toggle {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  width: 100%;
  /* 44px, not 2.75rem: the workspace's root size is 15px. */
  min-height: 44px;
  text-align: left;
  border-radius: 999px;
}
.stacks__toggle:focus-visible {
  outline: 2px solid var(--theme-accent-primary);
  outline-offset: 2px;
}
.stacks__chevron {
  transition: transform var(--motion-base, 240ms) var(--spring);
}
.stacks--open .stacks__chevron {
  transform: rotate(180deg);
}
.stacks__body {
  padding: 0.5rem 0.25rem 0;
}
@media (prefers-reduced-motion: reduce) {
  .stacks__chevron {
    transition: none;
  }
}
</style>
