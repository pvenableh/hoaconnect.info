<script setup lang="ts">
/**
 * DirectorLayer — the assistant's advisory presence, outside its panel.
 *
 * One component, two shapes, chosen by what it is given:
 *
 *   · **Scope mode** (no entity) — a rounded-full pill on a hub page: "Have the
 *     assistant plan Requests", an outline button, and the approvals chip. It is
 *     ambient chrome, so it stays a pill: the card treatment is reserved for
 *     when there is actual content stacked under the heading.
 *   · **Entity mode** — pinned to one record. Its notices, its pending
 *     proposals, its own approvals chip.
 *
 * Three rules this surface is built around, all learned the hard way elsewhere:
 *
 * 1. **It never out-shouts the page.** The action button is `outline`, never
 *    filled. A page has one filled button and it belongs to the page's own job,
 *    not to an advisory strip above it.
 * 2. **It collapses.** Pending proposals are a chip — "● 4 approvals waiting ·
 *    Review" — not a stack of full-width cards pushing the actual content below
 *    the fold. Expanding renders the same `<AiActionCard>` the panel uses, so
 *    approve/reject/undo exists once. Notices are ONE line too (Session 18,
 *    Peter's concept 1): "Worth a look · 15 · the first one… · Draft a plan ·
 *    Show", the assistant's invitation folded in; Show opens compact one-line
 *    rows in the same card, every action (open, propose, dismiss) one tap away.
 *    Open or shut is the person's (app prefs, `attention.hubs`, shut by
 *    default), the same pattern as the dashboard's What needs you.
 * 3. **It renders nothing when it has nothing.** No empty state, no placeholder.
 *    An ambient layer that is always visible stops being ambient.
 *
 * `<ClientOnly>` is not decoration: everything here is client state (the org id
 * from `useState`, notices, the pending count), and rendering it during SSR
 * produces a hydration divergence that on SSR-heavy pages cascades into blanked
 * siblings. Same reason `<DirectorTrustBar>` is wrapped in the nav.
 */

const props = withDefaults(
  defineProps<{
    /** Pin to a record. Omit to follow the page's own AI context. */
    entityType?: string | null;
    entityId?: string | null;
    label?: string | null;
    /** Show the heading pill (the "plan this area / focused on X" row). */
    heading?: boolean;
    /** Show the collapsible pending-proposal queue. */
    showProposals?: boolean;
    /** Show the advisory notices block. */
    showNotices?: boolean;
    variant?: "inline" | "ambient";
  }>(),
  {
    entityType: null,
    entityId: null,
    label: null,
    heading: true,
    showProposals: true,
    showNotices: true,
    variant: "inline",
  }
);

const scope = computed(() => ({
  entityType: props.entityType,
  entityId: props.entityId,
  label: props.label,
}));

const director = useDirectorLayer(scope);
const {
  hasEntity,
  scopeName,
  subjectName,
  notices,
  dismissNotice,
  refreshNotices,
  hydrateDismissed,
  actions,
  approvalsCount,
  loadQueue,
  afterDecision,
  proposeFromNotice,
  proposingId,
  proposeError,
  decideMany,
  bulkBusy,
  planThis,
  planning,
  planError,
} = director;

const router = useRouter();
const { buildOrgPath } = useOrgNavigation();

// ── Notices ──────────────────────────────────────────────────────────────────
// The priority is a dot in a status token (and words for a screen reader).
const NOTICE_DOT: Record<string, string> = {
  urgent: "bg-destructive",
  high: "bg-warning",
  medium: "bg-info",
  low: "bg-muted-foreground",
};

// The one line: open or shut, the person's choice, remembered with their prefs.
const listId = useId();
const { attentionOpen, setAttentionOpen } = useAppearance();
const open = attentionOpen("hubs");
const toggleOpen = () => setAttentionOpen("hubs", !open.value);
const firstNotice = computed(() => notices.value[0] ?? null);
/** The count's chip: the attention colour when anything is urgent or high. */
const countTone = computed(() =>
  notices.value.some((n) => n.priority === "urgent" || n.priority === "high") ? "director-line__count--hot" : "",
);

const MAX_COLLAPSED = 5;
const noticesExpanded = ref(false);
const visibleNotices = computed(() =>
  noticesExpanded.value ? notices.value : notices.value.slice(0, MAX_COLLAPSED)
);
const hiddenNoticeCount = computed(() => Math.max(0, notices.value.length - MAX_COLLAPSED));

function openNotice(n: { actionRoute?: string }) {
  if (!n.actionRoute) return;
  // Notices carry an ORG-RELATIVE path; the community slug is ours to add.
  router.push(buildOrgPath(n.actionRoute));
}

// ── Approvals queue ──────────────────────────────────────────────────────────
const approvalsExpanded = ref(false);
const approvalsLabel = computed(
  () => `${approvalsCount.value} approval${approvalsCount.value === 1 ? "" : "s"} waiting`
);

async function toggleApprovals() {
  approvalsExpanded.value = !approvalsExpanded.value;
  if (approvalsExpanded.value) await loadQueue();
}

const pendingRows = computed(() => actions.actions.value.filter((a) => a.status === "pending"));

async function onDecide(id: string, decision: "approve" | "reject") {
  await (decision === "approve" ? actions.approve(id) : actions.reject(id));
  await Promise.all([loadQueue(), afterDecision()]);
}

async function approveAll() {
  const ids = pendingRows.value.filter((a) => !a.outbound).map((a) => a.id);
  if (!ids.length) return;
  await decideMany(ids, "approve");
}

/**
 * Outbound proposals are excluded from "Approve all" on purpose. Approving an
 * email one at a time is a decision; approving nine at once, sight unseen,
 * is a different act with the same name. The server does not care — bulk goes
 * through the same approval path either way and would happily send them — so
 * this is a UI judgement, stated here so nobody later "fixes" it.
 */
const bulkEligible = computed(() => pendingRows.value.filter((a) => !a.outbound).length);
const outboundHeld = computed(() => pendingRows.value.filter((a) => a.outbound).length);

// ── Dismissible scope banner ─────────────────────────────────────────────────
// Only the scope-mode invitation is dismissible. An entity heading is workspace
// chrome — it says what the surface below is about — and hiding it would leave
// orphaned content.
const BANNER_KEY = "hoa.director-banner-dismissed";
const bannerDismissed = ref(false);
function dismissBanner() {
  bannerDismissed.value = true;
  try {
    localStorage.setItem(BANNER_KEY, "1");
  } catch {
    /* private mode */
  }
}

onMounted(async () => {
  try {
    bannerDismissed.value = localStorage.getItem(BANNER_KEY) === "1";
  } catch {
    /* private mode */
  }
  hydrateDismissed();
  await Promise.all([
    props.showNotices ? refreshNotices() : Promise.resolve(),
    actions.refreshPendingCount(),
    director.refreshEntityPending(),
  ]);
});

// Follow the page when it changes what it is about (a detail page resolving its
// record, or a hub the user navigated to).
watch(
  () => [props.entityType, props.entityId] as const,
  async () => {
    if (!props.showNotices) return;
    await Promise.all([refreshNotices(), director.refreshEntityPending()]);
  }
);

const showHeading = computed(() => props.heading && (hasEntity.value || !bannerDismissed.value));
const showApprovals = computed(() => props.showProposals && approvalsCount.value > 0);
const showNoticeBlock = computed(() => props.showNotices && notices.value.length > 0);
const showAny = computed(() => showHeading.value || showApprovals.value || showNoticeBlock.value);
</script>

<template>
  <ClientOnly>
    <section
      v-if="showAny"
      class="director-layer space-y-3"
      :class="variant === 'inline' ? 'mb-2' : ''"
      aria-label="Assistant"
    >
      <!-- Heading pill: ambient, rounded-full, one outline button. With notices
           the line below carries the same invitation instead. -->
      <div v-if="showHeading && !showNoticeBlock" class="ios-card rounded-full px-4 py-2 sm:px-5">
        <div class="flex items-center justify-between gap-3 flex-wrap">
          <div class="flex items-center gap-2 min-w-0">
            <Icon name="i-lucide-sparkles" class="w-4 h-4 t-text-secondary shrink-0" />
            <p v-if="hasEntity" class="text-sm font-medium t-text truncate">
              The assistant is watching
              <span class="t-text-accent">{{ subjectName }}</span>
            </p>
            <p v-else class="text-sm font-medium t-text truncate">
              Have the assistant plan <span class="t-text-accent">{{ scopeName }}</span>
            </p>
          </div>

          <div class="flex items-center gap-2 shrink-0">
            <button
              v-if="showApprovals"
              type="button"
              class="inline-flex items-center gap-1.5 rounded-full border t-border px-3 py-1.5 text-xs font-medium t-text-secondary hover:t-text transition-colors ios-press"
              :aria-expanded="approvalsExpanded"
              @click="toggleApprovals"
            >
              <span class="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" aria-hidden="true" />
              {{ approvalsLabel }}
              <Icon
                :name="approvalsExpanded ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
                class="w-3 h-3"
              />
            </button>

            <!-- Drafting is a real model call now (P6), so the button says so
                 while it runs. Its steps land in the approvals chip beside it. -->
            <AppButton
              variant="outline"
              size="sm"
              class="rounded-full shrink-0"
              :disabled="planning"
              @click="planThis()"
            >
              <Icon
                :name="planning ? 'i-lucide-loader-2' : 'i-lucide-list-checks'"
                class="w-4 h-4 mr-1.5"
                :class="planning ? 'animate-spin' : ''"
              />
              {{ planning ? "Drafting…" : "Draft a plan" }}
            </AppButton>

            <button
              v-if="!hasEntity"
              type="button"
              class="p-1 rounded-full t-text-muted hover:t-text transition-colors shrink-0"
              title="Dismiss"
              aria-label="Dismiss"
              @click="dismissBanner"
            >
              <Icon name="i-lucide-x" class="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      <!-- A plan that could not be drafted (no credits, a provider hiccup) says
           so here rather than inside the notices block, which is absent on
           exactly the quiet hub where someone is most likely to press it. -->
      <p v-if="planError" class="text-xs text-red-600 dark:text-red-400">
        {{ planError }}
      </p>

      <!-- With notices: ONE line (Session 18, concept 1), the assistant's
           invitation and the notices folded together. Collapsed it is a
           52px pill; expanded, the same card holds compact one-line rows,
           every action one tap away. -->
      <div
        v-if="showNoticeBlock"
        class="director-line ios-card"
        :class="{ 'director-line--open': open }"
        data-attention-line
      >
        <div class="director-line__bar">
          <button
            type="button"
            class="director-line__toggle"
            :aria-expanded="open"
            :aria-controls="listId"
            data-attention-toggle
            @click="toggleOpen"
          >
            <Icon name="i-lucide-radar" class="w-4 h-4 t-text-secondary shrink-0" aria-hidden="true" />
            <span class="text-sm font-semibold t-text shrink-0">Worth a look</span>
            <span class="director-line__count text-xs tabular-nums" :class="countTone">{{ notices.length }}</span>
            <span
              v-if="!open && firstNotice"
              class="director-line__peek text-sm t-text-secondary"
            >
              <span class="director-line__dot" :class="NOTICE_DOT[firstNotice.priority]" aria-hidden="true" />
              <span class="truncate">{{ firstNotice.title }}<template v-if="notices.length > 1"> · and {{ notices.length - 1 }} more</template></span>
            </span>
            <span class="sr-only">{{ open ? "Hide" : "Show" }}</span>
          </button>

          <div class="director-line__actions">
            <ActionButton
              v-if="showApprovals"
              :pressed="approvalsExpanded"
              icon="lucide:circle-dot"
              :title="approvalsLabel"
              hide-label="sm"
              @click="toggleApprovals"
            >
              {{ approvalsLabel }}
            </ActionButton>
            <ActionButton
              v-if="showHeading"
              :icon="planning ? 'lucide:loader-2' : 'lucide:list-checks'"
              :loading="planning"
              :disabled="planning"
              title="Draft a plan"
              hide-label="sm"
              @click="planThis()"
            >
              {{ planning ? "Drafting…" : "Draft a plan" }}
            </ActionButton>
            <ActionButton
              size="xs"
              :icon="open ? 'lucide:chevron-up' : 'lucide:chevron-down'"
              :title="open ? 'Hide' : 'Show'"
              :aria-expanded="open"
              :aria-controls="listId"
              @click="toggleOpen"
            />
          </div>
        </div>

        <div v-if="open" :id="listId" class="director-line__body">
          <ul class="director-line__list">
            <li v-for="n in visibleNotices" :key="n.id" class="director-line__row">
              <span class="director-line__dot mt-1.5" :class="NOTICE_DOT[n.priority]" aria-hidden="true" />
              <div class="min-w-0 flex-1">
                <p class="text-sm font-medium t-text">
                  {{ n.title }}
                  <span class="sr-only">, {{ n.priority }} priority</span>
                </p>
                <p v-if="n.description" class="text-xs t-text-muted truncate">{{ n.description }}</p>
              </div>
              <div v-if="(n.actionLabel && n.actionRoute) || n.proposedAction" class="director-line__row-actions">
                <ActionButton v-if="n.actionLabel && n.actionRoute" icon="lucide:arrow-right" @click="openNotice(n)">
                  {{ n.actionLabel }}
                </ActionButton>
                <ActionButton
                  v-if="n.proposedAction"
                  :icon="proposingId === n.id ? 'lucide:loader-2' : 'lucide:wand-2'"
                  :loading="proposingId === n.id"
                  :disabled="proposingId === n.id"
                  @click="proposeFromNotice(n.id)"
                >
                  {{ n.proposedAction.title }}
                </ActionButton>
              </div>
              <ActionButton size="xs" icon="lucide:x" :title="`Dismiss: ${n.title}`" @click="dismissNotice(n.id)" />
            </li>
          </ul>
          <div v-if="hiddenNoticeCount > 0 || proposeError" class="director-line__foot">
            <p v-if="proposeError" class="text-xs text-destructive">{{ proposeError }}</p>
            <AppButton
              v-if="hiddenNoticeCount > 0"
              variant="link"
              size="sm"
              class="h-auto px-0"
              @click="noticesExpanded = !noticesExpanded"
            >
              {{ noticesExpanded ? "Show fewer" : `Show ${hiddenNoticeCount} more` }}
            </AppButton>
          </div>
        </div>
      </div>

      <!-- Approvals: a chip on its own row when there is no heading to carry it. -->
      <div v-if="showApprovals" class="space-y-2">
        <button
          v-if="!showHeading && !showNoticeBlock"
          type="button"
          class="ios-card rounded-full px-4 py-2 sm:px-5 w-full flex items-center gap-2 text-left ios-press"
          :aria-expanded="approvalsExpanded"
          @click="toggleApprovals"
        >
          <span class="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" aria-hidden="true" />
          <span class="text-xs font-medium t-text-secondary truncate">{{ approvalsLabel }}</span>
          <span
            class="ml-auto inline-flex items-center gap-0.5 text-xs font-medium t-text-secondary shrink-0"
          >
            {{ approvalsExpanded ? "Hide" : "Review" }}
            <Icon
              :name="approvalsExpanded ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
              class="w-3 h-3"
            />
          </span>
        </button>

        <div v-if="approvalsExpanded" class="space-y-2">
          <div v-if="actions.loading.value" class="py-6 flex justify-center">
            <div class="spinner-ios" />
          </div>
          <template v-else>
            <AiActionCard
              v-for="a in pendingRows"
              :key="a.id"
              :action="a"
              :busy="actions.busyId.value === a.id"
              @approve="onDecide($event, 'approve')"
              @reject="onDecide($event, 'reject')"
            />
            <div
              v-if="bulkEligible > 1"
              class="flex items-center gap-2 flex-wrap pt-1"
            >
              <button
                type="button"
                class="inline-flex items-center gap-1.5 rounded-full border t-border px-3 py-1.5 text-xs font-medium t-text-secondary hover:t-text transition-colors disabled:opacity-50 ios-press"
                :disabled="bulkBusy"
                @click="approveAll"
              >
                <Icon
                  :name="bulkBusy ? 'i-lucide-loader-2' : 'i-lucide-check-check'"
                  class="w-3.5 h-3.5"
                  :class="bulkBusy ? 'animate-spin' : ''"
                />
                Approve the {{ bulkEligible }} internal ones
              </button>
              <span v-if="outboundHeld" class="text-[11px] t-text-muted">
                {{ outboundHeld }} that {{ outboundHeld === 1 ? "reaches" : "reach" }} residents
                {{ outboundHeld === 1 ? "stays" : "stay" }} one at a time.
              </span>
            </div>
          </template>
        </div>
      </div>
    </section>
  </ClientOnly>
</template>

<style scoped>
/* The attention line (Session 18): a 52px pill shut, a card open. Solid
   content (ios-card), never glass; nothing in it is filled, so it never
   out-shouts the page's own primary action. */
.director-line {
  border-radius: 1.625rem;
  padding: 0.375rem 0.5rem 0.375rem 1rem;
}
.director-line.director-line--open {
  padding-bottom: 0.5rem;
}
.director-line__bar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-height: 2.5rem;
}
.director-line__toggle {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  flex: 1;
  min-width: 0;
  /* 44px, not 2.75rem: the workspace's root size is 15px. */
  min-height: 44px;
  text-align: left;
  border-radius: 999px;
}
.director-line__toggle:focus-visible {
  outline: 2px solid var(--theme-accent-primary);
  outline-offset: 2px;
}
.director-line__count {
  display: inline-grid;
  place-items: center;
  min-width: 1.5rem;
  height: 1.375rem;
  padding: 0 0.5rem;
  border-radius: 999px;
  font-weight: 700;
  background: var(--theme-bg-secondary);
  color: var(--theme-text-secondary);
  flex-shrink: 0;
}
.director-line__count--hot {
  background: color-mix(in srgb, var(--destructive) 14%, var(--theme-bg-elevated));
  color: var(--destructive);
}
.director-line__peek {
  display: none;
  min-width: 0;
  align-items: center;
  gap: 0.5rem;
}
@media (min-width: 640px) {
  .director-line__peek {
    display: inline-flex;
  }
}
.director-line__dot {
  width: 0.4375rem;
  height: 0.4375rem;
  border-radius: 999px;
  flex-shrink: 0;
}
.director-line__actions {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  flex-shrink: 0;
}
.director-line__list {
  margin: 0.25rem 0 0;
  padding: 0;
  list-style: none;
}
.director-line__row {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 0.625rem 0.25rem 0.625rem 0;
  border-top: 1px solid var(--theme-border-light);
}
/* The row's text takes what is left; its actions sit beside it, and drop
   under it (indented past the dot) when the row is too narrow for both. */
.director-line__row > .min-w-0 {
  flex: 1 1 14rem;
}
.director-line__row-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.375rem;
}
/* On a phone the actions take their own line under the text, and the dismiss
   stays on the first line, beside the title. */
@media (max-width: 639px) {
  .director-line__row-actions {
    order: 3;
    flex-basis: 100%;
    padding-left: 1.1875rem;
  }
}
.director-line__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.375rem 0 0;
  border-top: 1px solid var(--theme-border-light);
}
</style>
