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
import { cadenceLabel } from "#core/shared/responsibilities/config";
import {
  REGISTER_GROUPS,
  isHeldRow,
  publishedHolder,
  publishedSearchText,
  unassignedSinceText,
} from "#core/shared/responsibilities/register-view";
import type { PublishedRow } from "#core/shared/responsibilities/views";

definePageMeta({
  middleware: ["auth", "subscription"],
  layout: "auth",
});

const { selectedOrgId } = await useSelectedOrg();

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

const holders = (row: PublishedRow) => (isHeldRow(row) ? row.who.map(publishedHolder) : []);
const lastVerified = (row: PublishedRow) =>
  isHeldRow(row) && row.lastVerified ? row.lastVerified : null;
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

      <AppResourceIndex
        v-else
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
