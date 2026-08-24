<script setup lang="ts">
/**
 * One decision record, in full.
 *
 * A set of minutes is a SNAPSHOT, not a live view. The steps printed here are
 * the steps as they stood when the meeting was recorded, and the counts above
 * them were computed by the server from those same steps — see
 * `summarizeMinutesSteps`. That is the whole value of the record: it does not
 * quietly update to agree with what happened afterwards.
 *
 * Which is also why nothing here approves anything. The Board Room is where a
 * step is decided; this is where the decision is kept.
 */
import type { LoadedMinutes } from "#core/app/composables/useBoardroomMinutes";

const selectedOrgId = useState<string | null>("selectedOrgId", () => null);
const orgId = computed(() => selectedOrgId.value || "");
const route = useRoute();
const { buildOrgPath } = useOrgNavigation();
const api = useBoardroomMinutes(orgId);

const record = ref<LoadedMinutes | null>(null);
const loading = ref(true);
const notFound = ref(false);
const sharing = ref(false);

const minutesId = computed(() => String(route.params.id || ""));
const meetingsHref = computed(() => buildOrgPath("/admin/meetings"));

const STATUS_LABEL: Record<string, string> = {
  executed: "Approved",
  approved: "Approved",
  rejected: "Set aside",
  failed: "Failed",
  pending: "Still open",
};

const STATUS_STYLE: Record<string, string> = {
  executed: "text-emerald-700 bg-emerald-100 dark:text-emerald-300 dark:bg-emerald-500/15",
  approved: "text-blue-700 bg-blue-100 dark:text-blue-300 dark:bg-blue-500/15",
  rejected: "t-text-muted t-bg-subtle",
  failed: "text-red-700 bg-red-100 dark:text-red-300 dark:bg-red-500/15",
  pending: "text-amber-700 bg-amber-100 dark:text-amber-300 dark:bg-amber-500/15",
};

const paragraphs = computed(() =>
  (record.value?.intro || "")
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean)
);

const tallies = computed(() => {
  const s = record.value?.stats;
  if (!s) return [];
  return [
    { label: "Approved", value: s.done },
    { label: "Set aside", value: s.skipped },
    { label: "Still open", value: s.open },
    { label: "Failed", value: s.failed },
  ];
});

async function load() {
  if (!orgId.value || !minutesId.value) return;
  loading.value = true;
  notFound.value = false;
  const res = await api.load(minutesId.value);
  record.value = res;
  notFound.value = !res;
  loading.value = false;
}

async function share() {
  if (!record.value || sharing.value) return;
  sharing.value = true;
  try {
    const res = await api.share(record.value.id);
    if (res) record.value = res;
  } finally {
    sharing.value = false;
  }
}

watch(orgId, () => void load(), { immediate: true });
</script>

<template>
  <div class="space-y-5 p-4 sm:p-6 max-w-3xl mx-auto">
    <NuxtLink
      :to="meetingsHref"
      class="inline-flex items-center gap-1.5 text-xs t-text-muted hover:t-text"
    >
      <Icon name="i-lucide-chevron-left" class="w-3.5 h-3.5" />
      Meetings
    </NuxtLink>

    <div v-if="loading" class="flex items-center gap-2 text-sm t-text-muted py-10 justify-center">
      <span class="spinner-ios" /> Loading the record…
    </div>

    <AppEmptyState
      v-else-if="notFound"
      icon="lucide:file-question"
      title="No such decision record"
      description="It may have been removed, or it belongs to another community."
    />

    <template v-else-if="record">
      <header class="glass-edge glass-body glass-refract rounded-3xl px-5 py-5 sm:px-6 t-bg-elevated">
        <div class="flex items-start gap-4 flex-wrap sm:flex-nowrap">
          <span
            class="w-11 h-11 rounded-2xl t-bg-accent flex items-center justify-center shrink-0"
            aria-hidden="true"
          >
            <Icon name="i-lucide-gavel" class="w-5.5 h-5.5 t-text-accent" />
          </span>
          <div class="min-w-0 flex-1">
            <h1 class="t-heading text-xl font-semibold truncate">
              {{ record.title || "Working session" }}
            </h1>
            <p class="text-xs t-text-muted mt-1">
              {{ record.scopeType === "entity" ? "Focused" : "Association-wide" }}
              <template v-if="record.authorName"> · recorded by {{ record.authorName }}</template>
              <template v-if="record.dateCreated">
                · {{ new Date(record.dateCreated).toLocaleString() }}
              </template>
            </p>
          </div>
          <button
            v-if="record.status !== 'shared'"
            type="button"
            class="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium t-btn-outline ios-press disabled:opacity-50 shrink-0"
            :disabled="sharing"
            @click="share"
          >
            <Icon
              :name="sharing ? 'i-lucide-loader-2' : 'i-lucide-share-2'"
              class="w-4 h-4"
              :class="sharing ? 'animate-spin' : ''"
            />
            Share with the board
          </button>
          <span
            v-else
            class="text-[10px] uppercase t-tracking-wider rounded-full px-2.5 py-1 font-medium bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 shrink-0"
          >Shared</span>
        </div>
      </header>

      <dl v-if="tallies.length" class="grid grid-cols-4 gap-3">
        <div v-for="t in tallies" :key="t.label" class="ios-card p-3.5">
          <dt class="text-[11px] t-text-muted">{{ t.label }}</dt>
          <dd class="text-lg font-semibold t-text tabular-nums">{{ t.value }}</dd>
        </div>
      </dl>

      <BoardroomSlides v-if="record.points?.length" :points="record.points" />

      <section v-if="paragraphs.length" class="ios-card p-5">
        <h2 class="t-overline mb-3">The briefing</h2>
        <div class="space-y-3">
          <p v-for="(p, i) in paragraphs" :key="i" class="text-sm t-text leading-relaxed">
            {{ p }}
          </p>
        </div>
      </section>

      <section v-if="record.steps?.length" aria-label="Steps">
        <h2 class="t-overline mb-2">The steps, as they stood</h2>
        <ol class="ios-card divide-y divide-[var(--theme-border,rgba(0,0,0,0.08))]">
          <li
            v-for="(s, i) in record.steps"
            :key="s.id"
            class="flex items-center gap-3 px-4 py-3"
          >
            <span
              class="w-6 h-6 rounded-lg t-bg-subtle text-xs font-semibold t-text-secondary flex items-center justify-center shrink-0 tabular-nums"
              aria-hidden="true"
            >{{ i + 1 }}</span>
            <span class="min-w-0 flex-1">
              <span class="block text-sm t-text truncate">{{ s.title }}</span>
              <span class="block text-[11px] t-text-muted">
                {{ s.actionType.replace(/_/g, " ") }}
                <template v-if="s.outbound"> · reaches residents</template>
              </span>
            </span>
            <span
              class="text-[10px] uppercase t-tracking-wider rounded-full px-2 py-0.5 font-medium shrink-0"
              :class="STATUS_STYLE[s.status] || 't-bg-subtle t-text-muted'"
            >{{ STATUS_LABEL[s.status] || s.status }}</span>
          </li>
        </ol>
      </section>
    </template>
  </div>
</template>
