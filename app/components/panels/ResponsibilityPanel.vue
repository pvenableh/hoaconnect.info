<!--
  ResponsibilityPanel — one standing job (?slide=responsibility:id, or the full
  page at /admin/responsibilities/:id). The detail moment of plan §2.3: a summary
  strip (status, who holds it, the review), the one next action top right
  (Hand over, or Assign when nobody holds it), the facts, and the holder
  timeline: every holder row with its dates, ended rows under the name frozen
  when they ended, and an office row showing who held the office inside it.

  Reads the job from the register (`reuse: true`), so over its index it makes
  no request, and a deep link loads through the same gated route
  (GET /api/org/responsibilities: admins, the grant, every board seat). The
  controls are the editors' (`viewer.canEdit`): a board seat reading the
  register sees the same facts and history and no controls.

  Not here yet: the discussion thread (hoa_channels links to a request, a
  project or a vendor, not to a job), and attaching files (the files section
  lists what the route returns).
-->
<script setup lang="ts">
import type { FlipFromPayload } from "#core/app/composables/useFlipFromRow";
import { basisLabel, cadenceLabel, categoryLabel, endReasonLabel, roleLabel } from "#core/shared/responsibilities/config";
import type { HolderView } from "#core/shared/responsibilities/views";

const props = defineProps<{
  id: string;
  mode?: string;
  flipFrom?: FlipFromPayload | null;
  /** The index path, when rendered as a full page. */
  page?: string | null;
}>();

defineEmits<{ (e: "close"): void }>();

const { selectedOrgId } = await useSelectedOrg();
const reg = useResponsibilitiesResource(selectedOrgId, { reuse: true });
const { resource, viewer, asOf, asOfIsToday } = reg;
const { confirm } = useConfirm();
const files = useDirectusFiles();

const job = computed(() => resource.find(props.id));
const retired = computed(() => job.value?.status === "retired");
const canAct = computed(() => viewer.value.canEdit && !!job.value && !retired.value);

// The rows a hand-over can end: open (no end date). Not the same as who holds
// the job on the as-of date, which may be a day that has since passed.
const openHolders = computed<HolderView[]>(() => (job.value?.assignees ?? []).filter((a) => !a.end_date));

const editing = ref(false);
const correcting = ref<HolderView | null>(null);
const correctSheet = computed({ get: () => !!correcting.value, set: (v) => (correcting.value = v ? correcting.value : null) });
const holderSheet = ref(false);
const holderMode = ref<"hand-over" | "assign">("assign");
const holderTarget = ref<HolderView | null>(null);

function startHandOver(h: HolderView) {
  holderMode.value = "hand-over";
  holderTarget.value = h;
  holderSheet.value = true;
}
function startAssign() {
  holderMode.value = "assign";
  holderTarget.value = null;
  holderSheet.value = true;
}

async function retire() {
  const j = job.value;
  if (!j) return;
  const ok = await confirm({
    title: `Retire “${j.title}”?`,
    body: "It leaves the register's current list and the owners' view. Its history stays, and any holder still open ends today. Editing it brings it back.",
    confirmLabel: "Retire Job",
    cancelLabel: "Keep Job",
    destructive: true,
  });
  if (ok) await reg.retireJob(j.id);
}

const facts = computed(() => {
  const j = job.value;
  if (!j) return [];
  return [
    { label: "Section", value: categoryLabel(j.category) },
    { label: "How often", value: cadenceLabel(j.cadence) || "—" },
    { label: "What says so", value: [basisLabel(j.basis || "unknown"), j.basis_reference].filter(Boolean).join(" · ") },
    {
      label: "Last verified",
      value: j.last_verified ? `${registerDay(j.last_verified)}${j.last_verified_by ? ` by ${j.last_verified_by.name}` : ""}` : "Never",
      warn: !j.last_verified && !retired.value,
    },
    { label: "Next review", value: retired.value ? "—" : j.nextReview ? registerDay(j.nextReview) : "Now", warn: j.reviewOverdue },
    { label: "Shown to owners", value: j.member_visible === false ? "No, hidden" : "Yes, once published" },
    ...(j.project ? [{ label: "Project", value: j.project.title }] : []),
  ];
});

const span = (a: { start_date: string | null; end_date: string | null }) =>
  a.end_date ? `${registerDay(a.start_date)} – ${registerDay(a.end_date)}` : `Since ${registerDay(a.start_date)}`;
const termSpan = (t: { from: string | null; to: string | null }) =>
  `${t.from ? registerDay(t.from) : "…"} – ${t.to ? registerDay(t.to) : "now"}`;
</script>

<template>
  <AppSlideOverShell
    :title="job?.title || 'Job'"
    :subtitle="job ? categoryLabel(job.category) : null"
    :page="page"
    @close="$emit('close')"
  >
    <template v-if="canAct" #actions>
      <DropdownMenu v-if="openHolders.length > 1">
        <DropdownMenuTrigger as-child>
          <Button size="sm" class="rounded-full">
            <Icon name="lucide:repeat" class="w-4 h-4 mr-1.5" />
            Hand Over
            <Icon name="lucide:chevron-down" class="w-3.5 h-3.5 ml-1" />
          </Button>
        </DropdownMenuTrigger>
        <AppDropdownMenuContent align="end">
          <DropdownMenuItem v-for="h in openHolders" :key="h.id" @click="startHandOver(h)">
            {{ h.name }} <span class="t-text-muted ml-1">{{ roleLabel(h.role).toLowerCase() }}</span>
          </DropdownMenuItem>
        </AppDropdownMenuContent>
      </DropdownMenu>
      <Button v-else-if="openHolders.length === 1" size="sm" class="rounded-full" @click="startHandOver(openHolders[0]!)">
        <Icon name="lucide:repeat" class="w-4 h-4 mr-1.5" />
        Hand Over
      </Button>
      <Button v-else size="sm" class="rounded-full" @click="startAssign">
        <Icon name="lucide:user-plus" class="w-4 h-4 mr-1.5" />
        Assign
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <Button variant="ghost" size="icon-sm" aria-label="More actions">
            <Icon name="lucide:more-horizontal" />
          </Button>
        </DropdownMenuTrigger>
        <AppDropdownMenuContent align="end">
          <DropdownMenuItem v-if="openHolders.length" @click="startAssign">
            <Icon name="lucide:user-plus" class="w-4 h-4 mr-2" />
            Add a Holder
          </DropdownMenuItem>
          <DropdownMenuItem @click="job && reg.markVerified(job.id)">
            <Icon name="lucide:check-check" class="w-4 h-4 mr-2" />
            Mark Verified Today
          </DropdownMenuItem>
          <DropdownMenuItem @click="editing = true">
            <Icon name="lucide:pencil" class="w-4 h-4 mr-2" />
            Edit Job
          </DropdownMenuItem>
          <DropdownMenuItem class="text-destructive" @click="retire">
            <Icon name="lucide:archive" class="w-4 h-4 mr-2" />
            Retire Job
          </DropdownMenuItem>
        </AppDropdownMenuContent>
      </DropdownMenu>
    </template>
    <template v-else-if="viewer.canEdit && job && retired" #actions>
      <Button size="sm" variant="outline" class="rounded-full" @click="editing = true">Edit Job</Button>
    </template>

    <div v-if="!job && resource.pending" class="py-16 flex justify-center">
      <div class="spinner-ios" />
    </div>

    <AppEmptyState
      v-else-if="!job"
      title="Job not found"
      description="It may have been removed, or belong to another community."
      icon="lucide:list-checks"
      size="sm"
    />

    <div v-else class="space-y-6">
      <!-- Summary strip: where it stands, who holds it, when it is next reviewed. -->
      <div class="responsibility-panel__summary">
        <div class="flex items-center justify-between gap-3">
          <span
            class="inline-flex px-2 py-0.5 rounded-full text-xs font-medium capitalize"
            :class="RESPONSIBILITY_STATUS_CLASS[job.status as string]"
          >
            {{ job.status }}
          </span>
          <span v-if="job.reviewOverdue" class="type-meta text-warning">Review overdue</span>
          <span v-else-if="job.nextReview && !retired" class="type-meta t-text-muted">
            Next review {{ registerDay(job.nextReview) }}
          </span>
        </div>
        <div class="space-y-1">
          <p class="type-meta t-text-muted">{{ asOfIsToday ? "Held by" : `Held by on ${registerDay(asOf)}` }}</p>
          <ResponsibilitiesHolderChips :holders="job.holders" :unassigned-since="job.unassignedSince" />
        </div>
      </div>

      <section class="space-y-2">
        <h3 class="type-card">Details</h3>
        <dl class="responsibility-panel__facts">
          <div v-for="f in facts" :key="f.label" class="responsibility-panel__fact">
            <dt class="type-meta t-text-muted">{{ f.label }}</dt>
            <dd :class="f.warn ? 'text-warning' : 't-text'">{{ f.value }}</dd>
          </div>
        </dl>
        <p v-if="job.description" class="t-text-secondary text-sm">{{ job.description }}</p>
        <div v-if="job.notes" class="space-y-0.5">
          <p class="type-meta t-text-muted">Board notes · never shown to owners</p>
          <p class="text-sm t-text whitespace-pre-line">{{ job.notes }}</p>
        </div>
      </section>

      <section class="space-y-2">
        <h3 class="type-card">Who has held it</h3>
        <ol v-if="job.assignees.length" class="responsibility-panel__timeline">
          <li v-for="a in job.assignees" :key="a.id" class="responsibility-panel__event">
            <span class="responsibility-panel__dot" :class="{ 'responsibility-panel__dot--now': !a.end_date }" aria-hidden="true">
              <Icon :name="a.end_date ? 'lucide:circle-check' : 'lucide:circle-dot'" class="w-3.5 h-3.5" />
            </span>
            <div class="min-w-0 flex-1 space-y-0.5">
              <p class="t-text">
                {{ a.name }}
                <span v-if="a.role !== 'owner'" class="t-text-muted">· {{ roleLabel(a.role).toLowerCase() }}</span>
              </p>
              <p class="type-meta t-text-muted">{{ span(a) }}</p>
              <!-- An office row: who held the office inside it. A mid-year change is two lines. -->
              <ul v-if="a.kind === 'office' && a.terms?.length" class="space-y-0.5 pt-0.5">
                <li v-for="t in a.terms" :key="t.termId" class="type-meta t-text-secondary">
                  {{ t.name }} · {{ termSpan(t) }}<template v-if="t.endReason"> · {{ endReasonLabel(t.endReason) }}</template>
                </li>
              </ul>
              <p v-else-if="a.kind === 'office' && !a.end_date && a.vacant" class="type-meta text-warning">The office is vacant</p>
              <p v-if="a.notes" class="type-meta t-text-secondary">{{ a.notes }}</p>
            </div>
            <Button v-if="viewer.canEdit" variant="ghost" size="sm" class="shrink-0" @click="correcting = a">Correct</Button>
          </li>
          <li class="responsibility-panel__event">
            <span class="responsibility-panel__dot" aria-hidden="true"><Icon name="lucide:file-plus" class="w-3.5 h-3.5" /></span>
            <span class="t-text">Job added</span>
            <span class="type-meta t-text-muted ml-auto">{{ registerDay(job.date_created) }}</span>
          </li>
        </ol>
        <p v-else class="text-sm t-text-muted">
          Nobody has held this job yet.<template v-if="job.unassignedSince"> It has been unassigned since {{ registerDay(job.unassignedSince) }}.</template>
        </p>
      </section>

      <section v-if="job.evidence.length" class="space-y-2">
        <h3 class="type-card">Files</h3>
        <ul class="space-y-1">
          <li v-for="f in job.evidence" :key="f.id">
            <a :href="files.getUrl(f.id)" target="_blank" rel="noopener" class="text-sm text-primary underline">
              {{ f.title || "File" }}
            </a>
          </li>
        </ul>
      </section>
    </div>

    <ResponsibilitiesJobForm
      v-if="selectedOrgId"
      v-model:open="editing"
      :org-id="selectedOrgId"
      :job="job"
      :create-job="reg.createJob"
      :patch-job="reg.patchJob"
    />
    <ResponsibilitiesHolderCorrectForm v-model:open="correctSheet" :holder="correcting" :correct="reg.correctHolder" />
    <ResponsibilitiesHolderForm
      v-if="selectedOrgId"
      v-model:open="holderSheet"
      :org-id="selectedOrgId"
      :job="job"
      :mode="holderMode"
      :holder="holderTarget"
      :hand-over="reg.handOver"
      :add-holder="reg.addHolder"
    />
  </AppSlideOverShell>
</template>

<style scoped>
.responsibility-panel__summary {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 0.875rem 1rem;
  border-radius: 14px;
  background: color-mix(in srgb, var(--theme-bg-secondary) 70%, transparent);
}
.responsibility-panel__facts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.75rem 1.5rem;
}
.responsibility-panel__fact {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}
.responsibility-panel__timeline {
  list-style: none;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.responsibility-panel__event {
  display: flex;
  align-items: flex-start;
  gap: 0.625rem;
}
.responsibility-panel__dot {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 1.5rem;
  height: 1.5rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--theme-bg-secondary) 85%, transparent);
  color: var(--theme-text-secondary);
}
.responsibility-panel__dot--now {
  background: color-mix(in srgb, var(--primary) 14%, transparent);
  color: var(--primary);
}
</style>
