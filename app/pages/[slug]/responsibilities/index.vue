<script setup lang="ts">
// Who handles what — the owners' and tenants' view of the responsibilities
// register (plan §3.4, docs/spec-responsibilities.md). Today only, and only what
// the board has published: job, who, how often, last verified. Never the basis,
// notes, files, history or a dispute: the route (GET .../published) leaves them
// out, so this page cannot show what it was never sent.
//
// Until the board publishes, the page says so. When it also chooses to show the
// gap, a job nobody holds leads its section as "Unassigned since 12 October 2026".
//
// Gated by `auth` and the `responsibilities` module (module.global reads the
// registry); the route checks membership again.
//
// Grid | Map (plan §3.4 "Map view"): the map draws the same rows, today only,
// with no slider. It is built from what the route sent and nothing else
// (`publishedMapRows`), so it cannot show history, a basis or a name the route
// left out.
//
// Focus (Session 18): picking a holder filters both modes to their jobs, and
// the jobs nobody holds (sent only when the board shows the gap) are hidden
// by default here, behind their own switch. Both in the URL (`?holder=`,
// `?unassigned=1`), shared by Grid and Map.
import { cadenceLabel } from "#core/shared/responsibilities/config";
import {
  REGISTER_GROUPS,
  isHeldRow,
  publishedHolder,
  publishedSearchText,
  unassignedSinceText,
} from "#core/shared/responsibilities/register-view";
import { mapModel, publishedMapRows } from "#core/shared/responsibilities/map";
import { focusLabel, focusMap, focusOptions, rowInFocus } from "#core/shared/responsibilities/focus";
import type { PublishedRow } from "#core/shared/responsibilities/views";

definePageMeta({
  middleware: ["auth", "subscription"],
  layout: "auth",
});

const { selectedOrgId } = await useSelectedOrg();

/** A published row's holders, keyed as the map keys them. */
const holdersOf = (row: PublishedRow) => (isHeldRow(row) ? row.who.map(publishedHolder) : []);

// null until the first read answers: "not published" must not flash while loading.
const published = ref<boolean | null>(null);

const resource = useResource<PublishedRow>(
  {
    key: "responsibilities-published",
    load: async (orgId) => {
      const res = await $fetch<{ published: boolean; responsibilities: PublishedRow[] }>("/api/org/responsibilities/published", {
        query: { orgId },
      });
      published.value = res.published;
      return res.responsibilities;
    },
    search: publishedSearchText,
    filters: {
      holder: { initial: "any", match: (r, v) => rowInFocus({ holders: holdersOf(r) }, { holder: v, unassigned: true }) },
      unassigned: { initial: "show", match: (r) => isHeldRow(r) },
    },
  },
  { orgId: selectedOrgId },
);

// The order the route sends is the order shown: unassigned jobs lead their section.
const columns = [
  { key: "title", label: "Job" },
  { key: "who", label: "Who" },
  { key: "cadence", label: "Cadence", hideOnMobile: true },
  { key: "lastVerified", label: "Last verified", hideOnMobile: true },
];

// The register's layout: the job on top; who, cadence and last verified beneath.
const stack = { primary: "title", meta: ["who", "cadence", "lastVerified"], bare: ["who"] };

const holders = (row: PublishedRow) => holdersOf(row);
const lastVerified = (row: PublishedRow) =>
  isHeldRow(row) && row.lastVerified ? row.lastVerified : null;
const view = useTabQuery({ key: "view", values: ["grid", "map"], fallback: "grid" });
const viewItems = [
  { value: "grid", label: "Grid", icon: "lucide:rows-3" },
  { value: "map", label: "Map", icon: "lucide:waypoints" },
];
const map = computed(() => mapModel(publishedMapRows(resource.rows), registerToday()));

// ── Focus: a holder, and the Unassigned switch (hidden by default here) ──────
const { holder, unassigned, focus, showAll } = useRegisterFocus({ unassignedDefault: false });
const focused = computed(() => focusMap(map.value, focus.value));
const holderOptionsList = computed(() => focusOptions(map.value));
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
  if (f.empty === "holder") return { title: `Nothing for ${f.holder?.label ?? lastHolderName.value ?? "that holder"}`, description: "They look after no jobs today." };
  if (f.empty === "unassigned-hidden") return { title: "Only unassigned jobs", description: "Every job listed is unassigned, and the Unassigned switch is hiding them." };
  return null;
});
watch(
  focus,
  (f) => {
    resource.filters.holder = f.holder ?? "any";
    resource.filters.unassigned = f.unassigned ? "show" : "hide";
  },
  { immediate: true },
);
watch(
  () => resource.filters.holder,
  (v) => {
    const next = !v || v === "any" ? null : v;
    if (next !== holder.value) holder.value = next;
  },
);
watch(
  () => resource.filters.unassigned,
  (v) => {
    const next = v !== "hide";
    if (next !== unassigned.value) unassigned.value = next;
  },
);

const day = (d: string) => {
  const [y, m, dd] = d.split("-").map(Number);
  return new Date(y!, m! - 1, dd).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
};
</script>

<template>
  <div class="min-h-screen t-bg t-text t-transition">
    <PageContainer class="space-y-6">
      <AppPageHeader
        title="Who handles what"
        description="The standing jobs that keep the community running, and who looks after each one."
      />

      <AppEmptyState
        v-if="published === false"
        title="The board hasn't published who handles what yet."
        description="When it does, you'll find each job here, who looks after it, and how often."
        icon="lucide:list-checks"
      />

      <AppSegmentedControl v-if="published" v-model="view" :items="viewItems" label="Views" />

      <ResponsibilitiesFocusBar
        v-if="published && resource.total"
        v-model:unassigned="unassigned"
        :holder-label="holderLabel"
        :unassigned-count="map.unassigned.length"
        @clear="holder = null"
      />

      <AppEmptyState
        v-if="published && emptyFocus"
        :title="emptyFocus.title"
        :description="emptyFocus.description"
        icon="lucide:filter-x"
        size="sm"
      >
        <template #actions>
          <AppButton variant="outline" size="sm" class="rounded-full" @click="showAll">Show All</AppButton>
        </template>
      </AppEmptyState>

      <template v-if="published && view === 'map' && !emptyFocus">
        <p v-if="resource.pending && !resource.total" class="type-meta t-text-muted">Loading…</p>
        <AppEmptyState
          v-else-if="!resource.total"
          title="No jobs are listed yet"
          description="The board has published the register, and no jobs are on it yet."
          icon="lucide:list-checks"
        />
        <ResponsibilitiesMap v-else v-model:holder="holder" :model="focused.model" :total="focused.total" />
      </template>

      <AppResourceIndex
        v-else-if="published !== false && !emptyFocus"
        :resource="resource"
        :columns="columns"
        :noun="{ one: 'job', other: 'jobs' }"
        search-placeholder="Search job or person"
        empty-title="No jobs are listed yet"
        empty-description="The board has published the register, and no jobs are on it yet."
        empty-icon="lucide:list-checks"
        :group="(r: PublishedRow) => r.category"
        :groups="REGISTER_GROUPS"
        :stack="stack"
      >
        <template #filters>
          <Select v-model="resource.filters.holder">
            <AppSelectTrigger class="w-48 rounded-full" aria-label="Who">
              <SelectValue />
            </AppSelectTrigger>
            <AppSelectContent>
              <SelectItem value="any">Anyone</SelectItem>
              <SelectItem v-for="h in holderOptionsList" :key="h.value" :value="h.value">{{ h.label }}</SelectItem>
            </AppSelectContent>
          </Select>
        </template>
        <template #cell-title="{ row }">
          <span class="t-text">{{ row.title }}</span>
        </template>
        <template #cell-who="{ row }">
          <span v-if="!isHeldRow(row)" class="inline-flex items-center gap-1.5 text-warning font-medium">
            <Icon name="lucide:circle-dashed" class="w-4 h-4" aria-hidden="true" />
            Unassigned since {{ unassignedSinceText(row.unassignedSince) }}
          </span>
          <ResponsibilitiesHolderChips v-else :holders="holders(row)" />
        </template>
        <template #cell-cadence="{ row }">
          <span class="t-text-muted">{{ isHeldRow(row) ? cadenceLabel(row.cadence) || "—" : "—" }}</span>
        </template>
        <template #cell-lastVerified="{ row }">
          <span class="t-text-muted">{{ lastVerified(row) ? day(lastVerified(row)!) : "—" }}</span>
        </template>
      </AppResourceIndex>
    </PageContainer>
  </div>
</template>
