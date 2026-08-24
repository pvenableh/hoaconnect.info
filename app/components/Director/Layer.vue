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
 *    approve/reject/undo exists once.
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
const NOTICE_ACCENT: Record<string, string> = {
  urgent: "text-red-600 dark:text-red-400",
  high: "text-amber-600 dark:text-amber-400",
  medium: "text-sky-600 dark:text-sky-400",
  low: "t-text-muted",
};
const NOTICE_DOT: Record<string, string> = {
  urgent: "bg-red-500",
  high: "bg-amber-500",
  medium: "bg-sky-500",
  low: "bg-slate-400",
};

const MAX_COLLAPSED = 2;
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
      <!-- Heading pill: ambient, rounded-full, one outline button. -->
      <div v-if="showHeading" class="ios-card rounded-full px-4 py-2 sm:px-5">
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
            <Button
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
            </Button>

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
      <p v-if="planError" class="text-xs text-red-600 dark:text-red-400 px-4">
        {{ planError }}
      </p>

      <!-- Advisory notices. Deterministic, free, and never an LLM call. -->
      <div v-if="showNoticeBlock" class="space-y-2">
        <div class="flex items-center gap-1.5 px-1">
          <Icon name="i-lucide-radar" class="w-3.5 h-3.5 t-text-secondary" />
          <span class="text-[10px] font-semibold uppercase tracking-wide t-text-muted">
            Worth a look
          </span>
        </div>

        <div
          v-for="n in visibleNotices"
          :key="n.id"
          class="group rounded-2xl border t-border t-bg p-3 sm:p-4"
        >
          <div class="flex items-start gap-3">
            <span
              class="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0"
              :class="NOTICE_DOT[n.priority]"
              aria-hidden="true"
            />
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium t-text">{{ n.title }}</p>
              <p class="text-xs t-text-muted mt-0.5">{{ n.description }}</p>
              <div class="flex items-center gap-3 mt-2 flex-wrap">
                <button
                  v-if="n.actionLabel && n.actionRoute"
                  type="button"
                  class="text-xs font-medium t-text-accent hover:underline"
                  @click="openNotice(n)"
                >
                  {{ n.actionLabel }} &rarr;
                </button>
                <button
                  v-if="n.proposedAction"
                  type="button"
                  class="inline-flex items-center gap-1.5 rounded-full border t-border px-2.5 py-1 text-xs t-text-secondary hover:t-text transition-colors disabled:opacity-50 ios-press"
                  :disabled="proposingId === n.id"
                  @click="proposeFromNotice(n.id)"
                >
                  <Icon
                    :name="proposingId === n.id ? 'i-lucide-loader-2' : 'i-lucide-wand-2'"
                    class="w-3 h-3"
                    :class="proposingId === n.id ? 'animate-spin' : ''"
                  />
                  {{ n.proposedAction.title }}
                </button>
              </div>
            </div>
            <span
              class="text-[10px] uppercase tracking-wide shrink-0"
              :class="NOTICE_ACCENT[n.priority]"
            >
              {{ n.priority }}
            </span>
            <button
              type="button"
              class="shrink-0 p-1 rounded-md opacity-0 group-hover:opacity-100 focus-visible:opacity-100 t-text-muted hover:t-text transition-all"
              title="Dismiss"
              :aria-label="`Dismiss: ${n.title}`"
              @click.stop="dismissNotice(n.id)"
            >
              <Icon name="i-lucide-x" class="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <p v-if="proposeError" class="text-xs text-red-600 dark:text-red-400 px-1">
          {{ proposeError }}
        </p>

        <button
          v-if="hiddenNoticeCount > 0"
          type="button"
          class="text-[11px] t-text-muted hover:t-text transition-colors px-1"
          @click="noticesExpanded = !noticesExpanded"
        >
          {{ noticesExpanded ? "Show less" : `Show ${hiddenNoticeCount} more` }}
        </button>
      </div>

      <!-- Approvals: a chip on its own row when there is no heading to carry it. -->
      <div v-if="showApprovals" class="space-y-2">
        <button
          v-if="!showHeading"
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
