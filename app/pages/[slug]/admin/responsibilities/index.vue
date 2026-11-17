<script setup lang="ts">
// The responsibilities register (plan §3.4, docs/spec-responsibilities.md): who
// handles what, in five sections, as of any day. On the resource scaffold, so it
// reads like every other index: header, search, one status control, the rows,
// and a panel for one job.
//
// nav-gate: admins, every board seat (responsibilities:read) and managers with
// the responsibilities grant. Reading is all a board seat does here; the
// editors' controls (New job, the template, hand-over, edit, retire) show only
// when the route says `viewer.canEdit`, and the visibility switches only for an
// admin. Each route checks again.
import { CATEGORIES, FLORIDA_CONDOMINIUM, cadenceLabel, basisLabel } from "#core/shared/responsibilities/config";
import { REGISTER_GROUPS, holderOptions, whoLine } from "#core/shared/responsibilities/register-view";
import type { RegisterRow } from "#core/shared/responsibilities/views";

definePageMeta({
  middleware: ["nav-gate", "subscription"],
  layout: "auth",
});

const { selectedOrgId } = await useSelectedOrg();
const reg = useResponsibilitiesResource(selectedOrgId);
const { resource: register, viewer, visibility, asOf, asOfIsToday } = reg;
const { confirm } = useConfirm();

const creating = ref(false);

const columns = [
  { key: "title", label: "Job", sortable: true },
  { key: "who", label: "Who", value: (r: RegisterRow) => whoLine(r) },
  { key: "cadence", label: "Cadence", hideOnMobile: true, value: (r: RegisterRow) => cadenceLabel(r.cadence) },
  { key: "basis", label: "Basis", hideOnMobile: true, value: (r: RegisterRow) => basisLabel(r.basis || "unknown") },
  { key: "last_verified", label: "Last verified", sortable: true, hideOnMobile: true },
  { key: "status", label: "Status" },
];

// Two lines per job, the same at every width: the job and its status on top; who,
// cadence, basis and last verified beneath, inline. A long "who" wraps inside
// its own row instead of squeezing a column.
const stack = {
  primary: "title",
  end: "status",
  meta: ["who", "cadence", "basis", "last_verified"],
  bare: ["who"],
};

const holders = computed(() => holderOptions(register.rows));

// The as-of control reads the register as it stood on a day. A date half typed
// into the field is not a date yet, so only a whole one reloads.
const onAsOf = (v: string) => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(v) && v !== asOf.value) void reg.setAsOf(v);
};

async function applyFlorida() {
  const ok = await confirm({
    title: "Add the Florida condominium list?",
    body: `Adds up to ${FLORIDA_CONDOMINIUM.rows.length} standing jobs in five sections, with no one assigned yet. Jobs you already have are skipped, so applying it again adds nothing.`,
    confirmLabel: "Add Jobs",
  });
  if (ok) await reg.applyTemplate(FLORIDA_CONDOMINIUM.key);
}

const pdfHref = computed(
  () => `/api/org/responsibilities/export.pdf?orgId=${encodeURIComponent(selectedOrgId.value ?? "")}&asOf=${encodeURIComponent(asOf.value)}`,
);

const emptyDescription = computed(() =>
  viewer.value.canEdit
    ? "Start from the Florida condominium list, or add jobs one at a time. Then say who holds each."
    : "The board hasn't added any jobs yet.",
);
</script>

<template>
  <div class="min-h-screen t-bg t-text t-transition">
    <PageContainer class="space-y-6">
      <!--
        The grid is the only mode today. The Map mode (Phase 2c) joins it here as
        a second view of the same rows and the same as-of day: holders on one
        side, jobs on the other. It reads `register.rows`; nothing below changes.
      -->
      <AppResourceIndex
        :resource="register"
        :columns="columns"
        :noun="{ one: 'job', other: 'jobs' }"
        title="Responsibilities"
        description="Who handles what in the community, how often, and who did before."
        :can-create="viewer.canEdit"
        create-label="New job"
        search-placeholder="Search job, section or holder"
        empty-title="No jobs yet"
        :empty-description="emptyDescription"
        empty-icon="lucide:list-checks"
        :group="(r: RegisterRow) => r.category"
        :groups="REGISTER_GROUPS"
        :stack="stack"
        :row-class="(r: RegisterRow) => (r.status === 'retired' ? 'opacity-70' : undefined)"
        data-register-view="grid"
        @create="creating = true"
      >
        <template #meta>
          <span v-if="!asOfIsToday" class="type-meta text-warning">As of {{ registerDay(asOf) }}</span>
        </template>

        <template #actions>
          <Button v-if="viewer.canEdit" variant="outline" class="rounded-full" @click="applyFlorida">
            <Icon name="lucide:list-plus" class="w-4 h-4 mr-1.5" />
            Start from the Florida condominium list
          </Button>
          <Button variant="outline" class="rounded-full" as-child>
            <a :href="pdfHref" target="_blank" rel="noopener">
              <Icon name="lucide:file-down" class="w-4 h-4 mr-1.5" />
              Export PDF
            </a>
          </Button>
          <ResponsibilitiesVisibilityMenu
            v-if="viewer.isAdmin"
            :visibility="visibility"
            :rows="register.rows"
            :set-visibility="reg.setVisibility"
          />
        </template>

        <template #filters>
          <Select v-model="register.filters.category">
            <SelectTrigger class="w-44 rounded-full" aria-label="Section">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sections</SelectItem>
              <SelectItem v-for="c in CATEGORIES" :key="c.key" :value="c.key">{{ c.label }}</SelectItem>
            </SelectContent>
          </Select>
          <Select v-model="register.filters.holder">
            <SelectTrigger class="w-44 rounded-full" aria-label="Holder">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any holder</SelectItem>
              <SelectItem v-for="h in holders" :key="h.value" :value="h.value">{{ h.label }}</SelectItem>
            </SelectContent>
          </Select>
          <Select v-model="register.filters.basis">
            <SelectTrigger class="w-40 rounded-full" aria-label="Basis">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any basis</SelectItem>
              <SelectItem value="unknown">Basis unknown</SelectItem>
            </SelectContent>
          </Select>
          <Select v-model="register.filters.review">
            <SelectTrigger class="w-40 rounded-full" aria-label="Review">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any review</SelectItem>
              <SelectItem value="overdue">Review overdue</SelectItem>
            </SelectContent>
          </Select>
          <div class="flex items-center gap-2">
            <Label for="register-as-of" class="type-meta t-text-muted">As of</Label>
            <DateInput id="register-as-of" :model-value="asOf" class="w-40" @update:model-value="onAsOf" />
            <Button v-if="!asOfIsToday" variant="ghost" size="sm" @click="reg.setAsOf(null)">Today</Button>
          </div>
        </template>

        <template #cell-title="{ row }">
          <span class="t-text" :class="{ 'line-through': row.status === 'retired' }">{{ row.title }}</span>
        </template>
        <template #cell-who="{ row }">
          <span v-if="row.status === 'retired'" class="t-text-muted">—</span>
          <ResponsibilitiesHolderChips v-else :holders="row.holders" :unassigned-since="row.unassignedSince" />
        </template>
        <template #cell-basis="{ row }">
          <span :class="(row.basis || 'unknown') === 'unknown' ? 'text-warning' : 't-text-muted'">
            {{ basisLabel(row.basis || "unknown") }}
          </span>
        </template>
        <template #cell-cadence="{ value }">
          <span class="t-text-muted">{{ value || "—" }}</span>
        </template>
        <template #cell-last_verified="{ row }">
          <span :class="row.reviewOverdue ? 'text-warning' : 't-text-muted'">
            {{ row.last_verified ? registerDay(row.last_verified) : "Never" }}
          </span>
        </template>
        <template #cell-status="{ row }">
          <span
            class="inline-flex px-2 py-0.5 rounded-full text-xs font-medium capitalize"
            :class="RESPONSIBILITY_STATUS_CLASS[row.status as string]"
          >
            {{ row.status }}
          </span>
        </template>
      </AppResourceIndex>

      <ResponsibilitiesJobForm
        v-if="viewer.canEdit && selectedOrgId"
        v-model:open="creating"
        :org-id="selectedOrgId"
        :job="null"
        :create-job="reg.createJob"
        :patch-job="reg.patchJob"
      />
    </PageContainer>
  </div>
</template>
