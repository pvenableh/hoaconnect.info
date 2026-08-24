<script setup lang="ts">
/**
 * The Board Room — Phase 6's page.
 *
 * Everything under it already existed before this screen did, and that is the
 * point: the briefing comes from `POST /api/ai/director/plan`, the steps ARE
 * `ai_actions` rows shown through the same `<AiActionCard>` the approvals queue
 * uses, and the decision path is `useAiActions`. The page composes; it does not
 * duplicate.
 *
 * ── Three things worth knowing before editing this ──────────────────────────
 *
 * 1. **Reopening is free.** Without `refresh`, the plan endpoint serves the
 *    briefing it saved for this exact subject for six hours and charges
 *    nothing — while re-reading its steps LIVE, so a step approved in between
 *    shows as approved. That is why "sync the plan after a decision" is just
 *    another call to `planThis()`, and why the wallet does not notice.
 *    `redraft()` is the only path that bills.
 *
 * 2. **`drafting` is not `layer.planning`.** The re-sync in (1) goes through
 *    the same composable, and showing "Drafting…" while nothing is being
 *    drafted would be a small lie told several times a session. The button
 *    watches a flag this page sets only when a person actually asked for a
 *    draft.
 *
 * 3. **Multiplayer is a poll, deliberately.** The Board Room collections are
 *    admin-only, so nothing here can be *pushed* a revision bump — see
 *    `useBoardroomSession` for the full note. The room's contract is
 *    "the revision moved, re-read the steps", which a socket would satisfy
 *    identically if the read policy is ever added.
 */
import type { DirectorPlanStep } from "#core/app/composables/useDirectorLayer";

const selectedOrgId = useState<string | null>("selectedOrgId", () => null);
const orgId = computed(() => selectedOrgId.value || "");

const { buildOrgPath } = useOrgNavigation();
const { user } = useDirectusAuth();
const layer = useDirectorLayer();
const room = useBoardroomSession(orgId);
const minutes = useBoardroomMinutes(orgId);

const SUBJECT_LABEL: Record<string, string> = {
  requests: "Requests",
  money: "Money",
  projects: "Projects",
  community: "Community",
  vendors: "Vendors",
  meetings: "Meetings",
  operations: "Operations",
};

const subject = ref("");
const topic = ref("");
const drafting = ref(false);
const recorded = ref<string | number | null>(null);

const plan = layer.plan;
const steps = computed<DirectorPlanStep[]>(() => plan.value?.steps || []);
const minutesHref = computed(() => buildOrgPath("/admin/meetings/minutes"));

/** What this session would be called, in a list of meetings. */
const sessionTitle = computed(
  () => topic.value.trim() || SUBJECT_LABEL[subject.value] || "The whole association"
);

/** Live meetings someone else convened — a room you are in is not on offer. */
const otherLive = computed(() =>
  room.liveSessions.value.filter((s) => String(s.id) !== String(room.session.value?.id ?? ""))
);

/** Only the host may close the room; everyone else leaves it. */
const isHost = computed(() => {
  const s = room.session.value;
  return !!s && !!user.value?.id && String(s.hostId) === String(user.value.id);
});

async function draft(refresh = false) {
  if (drafting.value) return;
  drafting.value = true;
  recorded.value = null;
  try {
    const res = await layer.planThis({
      subject: subject.value || null,
      topic: topic.value.trim() || null,
      refresh,
    });
    // A plan drawn while the room is open goes ON the table, so the people
    // watching get the same one rather than a briefing only the host can see.
    if (res?.planId && room.session.value) {
      await room.attachPlan(res.planId, sessionTitle.value);
    }
  } finally {
    drafting.value = false;
  }
}

/**
 * Re-read the plan after a decision. Cached and free — and truthful, because
 * the endpoint re-reads its steps from `ai_actions` rather than replaying the
 * snapshot it saved.
 */
async function syncPlan() {
  await layer.planThis({
    subject: subject.value || null,
    topic: topic.value.trim() || null,
  });
}

async function decide(id: string, decision: "approve" | "reject") {
  await layer.actions[decision](id);
  await syncPlan();
  // Tell the room. The server reads the step back before it writes the line,
  // so the activity cannot claim an approval that did not happen.
  if (room.session.value) await room.reportDecision(id);
}

async function undo(id: string) {
  await layer.actions.undo(id);
  await syncPlan();
  if (room.session.value) await room.reportDecision(id);
}

async function editStep(id: string, payload: Record<string, any>) {
  await layer.actions.edit(id, payload);
  await syncPlan();
}

async function convene() {
  const s = await room.convene({
    title: sessionTitle.value,
    subject: subject.value || null,
    topic: topic.value.trim() || null,
    planId: plan.value?.planId || null,
  });
  if (s) await room.listLive();
}

async function joinLive(id: string | number) {
  const s = await room.join(id);
  if (!s) return;
  // Follow the room's subject, then reopen its briefing — cached, so joining a
  // meeting in progress costs nothing and shows exactly what the host sees.
  subject.value = s.subject || "";
  topic.value = s.topic || "";
  await draft(false);
  await room.listLive();
}

async function endMeeting() {
  await room.end();
  await room.listLive();
}

async function leaveMeeting() {
  await room.leave();
  await room.listLive();
}

async function recordMinutes() {
  const p = plan.value;
  if (!p?.planId) return;
  const id = await minutes.record({
    planId: p.planId,
    sessionId: room.session.value?.id ?? null,
    title: sessionTitle.value,
    subject: subject.value || null,
    topic: topic.value.trim() || null,
    intro: p.intro,
    points: p.points,
    money: p.money,
  });
  recorded.value = id;
}

// Somebody else decided something: the poll brought the steps back, so take
// them rather than asking the endpoint for what we already have.
watch(room.remoteSteps, (next) => {
  if (next && plan.value) plan.value = { ...plan.value, steps: next };
});

watch(
  orgId,
  (id) => {
    if (!id) return;
    void room.listLive();
    void minutes.refresh();
  },
  { immediate: true }
);
</script>

<template>
  <div class="space-y-5 p-4 sm:p-6 max-w-5xl mx-auto">
    <BoardroomHeader
      :live="room.isLive.value"
      :is-host="isHost"
      :attendees="room.attendees.value"
      :last-activity="room.lastActivity.value"
      :busy="room.busy.value"
      :title="room.session.value ? room.session.value.title : null"
      @convene="convene"
      @leave="leaveMeeting"
      @end="endMeeting"
    />

    <p v-if="room.error.value" class="text-xs text-red-600 dark:text-red-400">
      {{ room.error.value }}
    </p>

    <BoardroomLiveSessions :sessions="otherLive" :busy="room.busy.value" @join="joinLive" />

    <BoardroomAgenda
      v-model:subject="subject"
      v-model:topic="topic"
      :busy="drafting"
      :has-plan="!!plan"
      :cached="plan?.cached"
      @draft="draft(false)"
      @redraft="draft(true)"
    />

    <p v-if="layer.planError.value" class="text-xs text-red-600 dark:text-red-400">
      {{ layer.planError.value }}
    </p>

    <div v-if="drafting" class="flex items-center gap-2 text-sm t-text-muted py-8 justify-center">
      <span class="spinner-ios" />
      Reading what this association is actually carrying…
    </div>

    <template v-else-if="plan">
      <BoardroomSlides
        :points="plan.points"
        :current="room.session.value?.currentSlide"
        :interactive="room.isLive.value"
        @select="room.present($event)"
      />

      <BoardroomBriefing
        :intro="plan.intro"
        :money="plan.money"
        :cached="plan.cached"
        :saved-at="plan.savedAt"
      />

      <BoardroomSteps
        v-if="steps.length"
        :steps="steps"
        :busy-id="layer.actions.busyId.value"
        :skipped="(plan as any).skipped"
        @approve="decide($event, 'approve')"
        @reject="decide($event, 'reject')"
        @undo="undo"
        @edit="editStep"
      />

      <p v-else class="text-sm t-text-muted">
        No steps were drafted for this — nothing here needs an action right now.
      </p>

      <!-- Recording is the meeting's full stop: the server reads the steps back
           itself, so the record's tally cannot come from this screen. -->
      <div class="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          class="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium t-btn-outline ios-press disabled:opacity-50"
          :disabled="minutes.saving.value || !plan.planId"
          @click="recordMinutes"
        >
          <Icon
            :name="minutes.saving.value ? 'i-lucide-loader-2' : 'i-lucide-gavel'"
            class="w-4 h-4"
            :class="minutes.saving.value ? 'animate-spin' : ''"
          />
          Record the minutes
        </button>
        <NuxtLink
          v-if="recorded"
          :to="`${minutesHref}/${recorded}`"
          class="text-xs t-text-accent underline underline-offset-2"
        >
          Recorded — open the decision record
        </NuxtLink>
        <span v-else-if="minutes.error.value" class="text-xs text-red-600 dark:text-red-400">
          {{ minutes.error.value }}
        </span>
      </div>
    </template>

    <div v-else class="ios-card p-8 text-center">
      <span
        class="mx-auto mb-3 w-12 h-12 rounded-2xl t-bg-subtle flex items-center justify-center"
        aria-hidden="true"
      >
        <Icon name="i-lucide-gavel" class="w-6 h-6 t-text-muted" />
      </span>
      <p class="text-sm font-medium t-text">Nothing on the table yet</p>
      <p class="text-xs t-text-muted mt-1 max-w-sm mx-auto">
        Pick what this session is about and draft a plan. The assistant reads your association's
        own records first — it proposes steps, it never takes them.
      </p>
    </div>

    <BoardroomMinutesStrip
      :minutes="minutes.list.value"
      :loading="minutes.loading.value"
      :href-base="minutesHref"
      hide-when-empty
    />
  </div>
</template>
