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
//
// Two modes over the same rows and the same as-of day (plan §3.4, Phase 2c):
// Grid (the index) and Map (holders beside jobs, with a slider through time),
// kept in the URL as `?view=map`. Everyone who reads the register gets both.
// The map resolves any day from the rows already loaded (every holder row ever,
// with its office terms), so the slider makes no request; the grid and the panel
// draw what the route built for one day, so they read once for the slider's day
// before they show.
//
// Focus (Session 18): picking a holder FILTERS, in both modes, to the jobs
// they hold (a person directly or through an office), and "Unassigned" is its
// own switch, shown by default here (they are the work to do). Both live in
// the URL (`?holder=`, `?unassigned=0`), so Grid and Map share them and a link
// reopens them; the rules are pure (core/shared/responsibilities/focus.ts).
import { CATEGORIES, FLORIDA_CONDOMINIUM, cadenceLabel, basisLabel } from "#core/shared/responsibilities/config";
import { REGISTER_GROUPS, whoLine } from "#core/shared/responsibilities/register-view";
import { changeDays, mapModel } from "#core/shared/responsibilities/map";
import { focusLabel, focusMap, focusOptions } from "#core/shared/responsibilities/focus";
import type { RegisterRow } from "#core/shared/responsibilities/views";

definePageMeta({
  middleware: ["nav-gate", "subscription"],
  layout: "auth",
});

const { selectedOrgId } = await useSelectedOrg();
const reg = useResponsibilitiesResource(selectedOrgId);
const { resource: register, viewer, visibility, asOf, asOfIsToday, meta } = reg;
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

// ── Grid | Map ──────────────────────────────────────────────────────────────
const view = useTabQuery({ key: "view", values: ["grid", "map"], fallback: "grid" });
const viewItems = [
  { value: "grid", label: "Grid", icon: "lucide:rows-3" },
  { value: "map", label: "Map", icon: "lucide:waypoints" },
];

const today = registerToday();
const day = computed(() => asOf.value || today);

// The slider snaps to the days anything changes, and today. A day typed into the
// field (or brought from the grid) joins them until another is typed, so the
// thumb has somewhere to sit without the list shifting under a drag.
const baseDays = computed(() => [...new Set([...changeDays(register.rows), today])].sort());
const pinned = ref(day.value);
watch(day, (d) => {
  if (!baseDays.value.includes(d)) pinned.value = d;
});
const snapDays = computed(() => [...new Set([...baseDays.value, pinned.value])].sort());

const map = computed(() => mapModel(register.rows, day.value));

// ── Focus: a holder, and the Unassigned switch ──────────────────────────────
const { holder, unassigned, focus, showAll } = useRegisterFocus({ unassignedDefault: true });
const focused = computed(() => focusMap(map.value, focus.value));
const holders = computed(() => focusOptions(map.value));
const holderLabel = computed(() => (focused.value.holder ? focusLabel(focused.value.holder, focused.value.shown) : null));
// The last name the pick resolved to, for a day it holds nothing (it is not on the map then).
const lastHolderName = ref<string | null>(null);
watch(
  () => focused.value.holder,
  (h) => {
    if (h) lastHolderName.value = h.label;
  },
  { immediate: true },
);
const emptyFocus = computed(() => {
  const f = focused.value;
  if (f.empty === "holder") return { title: `Nothing for ${f.holder?.label ?? lastHolderName.value ?? "that holder"} on this day`, description: "They hold no jobs on the day shown. Move the day, or show everyone." };
  if (f.empty === "unassigned-hidden") return { title: "Only unassigned jobs on this day", description: "Every job on the day shown is unassigned, and the Unassigned switch is hiding them." };
  return null;
});

// The grid's filters mirror the URL (and a filter cleared in the grid clears it there).
watch(
  focus,
  (f) => {
    register.filters.holder = f.holder ?? "any";
    register.filters.unassigned = f.unassigned ? "show" : "hide";
  },
  { immediate: true },
);
watch(
  () => register.filters.holder,
  (v) => {
    const next = !v || v === "any" ? null : v;
    if (next !== holder.value) holder.value = next;
  },
);
watch(
  () => register.filters.unassigned,
  (v) => {
    const next = v !== "hide";
    if (next !== unassigned.value) unassigned.value = next;
  },
);

/** The slider: a snap day, no request. */
const slideTo = (d: string) => {
  asOf.value = d;
};

/** A typed day: inside the days the rows cover, no request; outside, one read. */
function typeDay(d: string) {
  pinned.value = d;
  const days = baseDays.value;
  if (d >= days[0]! && d <= days[days.length - 1]!) asOf.value = d;
  else void reg.setAsOf(d);
}

// The grid and the panel show the rows the route built for `meta.asOf`.
const stale = computed(() => !!meta.value && meta.value.asOf !== day.value);
watch(view, (v) => {
  if (v === "grid" && stale.value) void reg.setAsOf(day.value);
});

async function openJob(id: string) {
  if (stale.value) await reg.setAsOf(day.value);
  const row = register.rows.find((r) => r.id === id);
  if (row) await register.open(row);
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
      <AppPageHeader title="Responsibilities" description="Who handles what in the community, how often, and who did before.">
        <template #meta>
          <span v-if="!asOfIsToday" class="type-meta text-warning">As of {{ registerDay(asOf) }}</span>
        </template>
        <template #actions>
          <AppButton v-if="viewer.canEdit" variant="outline" class="rounded-full" @click="applyFlorida">
            <Icon name="lucide:list-plus" class="w-4 h-4 mr-1.5" />
            Start from the Florida condominium list
          </AppButton>
          <AppButton variant="outline" class="rounded-full" as-child>
            <a :href="pdfHref" target="_blank" rel="noopener">
              <Icon name="lucide:file-down" class="w-4 h-4 mr-1.5" />
              Export PDF
            </a>
          </AppButton>
          <ResponsibilitiesVisibilityMenu
            v-if="viewer.isAdmin"
            :visibility="visibility"
            :rows="register.rows"
            :set-visibility="reg.setVisibility"
          />
          <AppButton v-if="viewer.canEdit" class="rounded-full" @click="creating = true">
            <Icon name="lucide:plus" class="w-4 h-4 mr-1.5" />
            New job
          </AppButton>
        </template>
      </AppPageHeader>

      <AppSegmentedControl v-model="view" :items="viewItems" label="Register views" />

      <ResponsibilitiesFocusBar
        v-if="register.total"
        v-model:unassigned="unassigned"
        :holder-label="holderLabel"
        :unassigned-count="map.unassigned.length"
        @clear="holder = null"
      />

      <AppEmptyState v-if="view === 'grid' && emptyFocus" :title="emptyFocus.title" :description="emptyFocus.description" icon="lucide:filter-x" size="sm">
        <template #actions>
          <AppButton variant="outline" size="sm" class="rounded-full" @click="showAll">Show All</AppButton>
        </template>
      </AppEmptyState>

      <AppResourceIndex
        v-if="view === 'grid' && !emptyFocus"
        :resource="register"
        :columns="columns"
        :noun="{ one: 'job', other: 'jobs' }"
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

        <template #filters>
          <Select v-model="register.filters.category">
            <AppSelectTrigger class="w-44 rounded-full" aria-label="Section">
              <SelectValue />
            </AppSelectTrigger>
            <AppSelectContent>
              <SelectItem value="all">All sections</SelectItem>
              <SelectItem v-for="c in CATEGORIES" :key="c.key" :value="c.key">{{ c.label }}</SelectItem>
            </AppSelectContent>
          </Select>
          <Select v-model="register.filters.holder">
            <AppSelectTrigger class="w-44 rounded-full" aria-label="Holder">
              <SelectValue />
            </AppSelectTrigger>
            <AppSelectContent>
              <SelectItem value="any">Any holder</SelectItem>
              <SelectItem v-for="h in holders" :key="h.value" :value="h.value">{{ h.label }}</SelectItem>
            </AppSelectContent>
          </Select>
          <Select v-model="register.filters.basis">
            <AppSelectTrigger class="w-40 rounded-full" aria-label="Basis">
              <SelectValue />
            </AppSelectTrigger>
            <AppSelectContent>
              <SelectItem value="any">Any basis</SelectItem>
              <SelectItem value="unknown">Basis unknown</SelectItem>
            </AppSelectContent>
          </Select>
          <Select v-model="register.filters.review">
            <AppSelectTrigger class="w-40 rounded-full" aria-label="Review">
              <SelectValue />
            </AppSelectTrigger>
            <AppSelectContent>
              <SelectItem value="any">Any review</SelectItem>
              <SelectItem value="overdue">Review overdue</SelectItem>
            </AppSelectContent>
          </Select>
          <div class="flex items-center gap-2">
            <Label for="register-as-of" class="type-meta t-text-muted">As of</Label>
            <DateInput id="register-as-of" :model-value="asOf" class="w-40" @update:model-value="onAsOf" />
            <AppButton v-if="!asOfIsToday" variant="ghost" size="sm" @click="reg.setAsOf(null)">Today</AppButton>
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

      <div v-else-if="view === 'map'" class="space-y-4">
        <ResponsibilitiesMapSlider :days="snapDays" :model-value="day" :today="today" @update:model-value="slideTo" @type="typeDay" />
        <AppEmptyState v-if="register.error" title="Could not load" :description="register.error" icon="lucide:cloud-off" size="sm">
          <template #actions>
            <AppButton variant="outline" size="sm" @click="register.refresh()">Try Again</AppButton>
          </template>
        </AppEmptyState>
        <p v-else-if="register.pending && !register.total" class="type-meta t-text-muted">Loading…</p>
        <AppEmptyState v-else-if="!register.total" title="No jobs yet" :description="emptyDescription" icon="lucide:list-checks">
          <template v-if="viewer.canEdit" #actions>
            <AppButton class="rounded-full" @click="creating = true">
              <Icon name="lucide:plus" class="w-4 h-4 mr-1.5" />
              New job
            </AppButton>
          </template>
        </AppEmptyState>
        <AppEmptyState v-else-if="emptyFocus" :title="emptyFocus.title" :description="emptyFocus.description" icon="lucide:filter-x" size="sm">
          <template #actions>
            <AppButton variant="outline" size="sm" class="rounded-full" @click="showAll">Show All</AppButton>
          </template>
        </AppEmptyState>
        <ResponsibilitiesMap
          v-else
          v-model:holder="holder"
          :model="focused.model"
          :total="focused.total"
          can-open
          @open="openJob"
        />
      </div>

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
