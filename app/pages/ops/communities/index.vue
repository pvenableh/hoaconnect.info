<script setup lang="ts">
// Operator console: every community, searchable and filterable (plan §5, Phase 1).
import { money, shortDate } from "#core/shared/ops/format";

definePageMeta({ middleware: ["auth"], layout: "auth" });
useHead({ title: "Communities · Operations" });

const route = useRoute();
const router = useRouter();

const q = ref(String(route.query.q ?? ""));
const filter = computed(() => String(route.query.filter ?? "all"));
const sort = computed(() => String(route.query.sort ?? "name"));
const page = computed(() => Math.max(1, Number(route.query.page) || 1));

const query = computed(() => ({ q: route.query.q, filter: filter.value, sort: sort.value, page: page.value, pageSize: 25 }));
const { data, pending, error } = await useFetch<any>("/api/ops/communities", { query });

function setQuery(next: Record<string, string | number | undefined>) {
  const merged: Record<string, any> = { ...route.query, ...next };
  for (const k of Object.keys(merged)) if (merged[k] === undefined || merged[k] === "" || merged[k] === "all") delete merged[k];
  void router.replace({ query: merged });
}

let searchTimer: ReturnType<typeof setTimeout> | undefined;
watch(q, (v) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => setQuery({ q: v.trim() || undefined, page: undefined }), 250);
});

const filters = computed(() => {
  const c = data.value?.counts ?? {};
  return [
    { value: "all", label: "All", count: c.total },
    { value: "trial_ending", label: "Trial ending", count: c.trial_ending },
    { value: "past_due", label: "Past due", count: c.past_due },
    { value: "no_units", label: "No units", count: c.no_units },
    { value: "free", label: "Free", count: c.free },
    { value: "agency", label: "Agency", count: c.agency },
    { value: "trial", label: "Trial", count: c.trial },
    { value: "expired", label: "Expired", count: c.expired },
    { value: "canceled", label: "Canceled", count: c.canceled },
  ];
});

const sorts = [
  { value: "name", label: "Name" },
  { value: "signup", label: "Newest" },
  { value: "value", label: "Value" },
  { value: "trial_end", label: "Trial end" },
  { value: "units", label: "Units" },
];

const columns = [
  { key: "name", label: "Community" },
  { key: "status", label: "Status" },
  { key: "band", label: "Band", hideOnMobile: true },
  { key: "units", label: "Units (real / declared)", hideOnMobile: true },
  { key: "billedBy", label: "Billed", hideOnMobile: true },
  { key: "monthlyValueCents", label: "Per month", align: "right" as const },
  { key: "trialEndsAt", label: "Trial ends", hideOnMobile: true },
  { key: "signupAt", label: "Signed up", hideOnMobile: true },
  { key: "primaryContact", label: "Primary contact", hideOnMobile: true },
];
</script>

<template>
  <OpsShell title="Communities" description="Every community on HOA Connect, with its band, status and contact.">
    <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
      <Input v-model="q" type="search" placeholder="Search name or slug" class="sm:max-w-xs" aria-label="Search communities" />
      <div class="flex items-center gap-2">
        <span class="type-meta t-text-muted">Sort</span>
        <AppSegmentedControl :items="sorts" :model-value="sort" size="sm" label="Sort" @update:model-value="(v: string) => setQuery({ sort: v === 'name' ? undefined : v, page: undefined })" />
      </div>
    </div>

    <div class="-mx-4 mt-3 overflow-x-auto px-4">
      <AppSegmentedControl :items="filters" :model-value="filter" size="sm" label="Quick filters" @update:model-value="(v: string) => setQuery({ filter: v, page: undefined })" />
    </div>

    <p v-if="data?.warning" class="mt-3 rounded-xl bg-warning/15 px-4 py-2 type-meta text-warning">{{ data.warning }}</p>

    <div v-if="error" class="py-10">
      <AppEmptyState title="Couldn't load communities" :description="error.statusMessage || error.message" icon="lucide:triangle-alert" />
    </div>

    <div v-else class="mt-4">
      <AppDataTable
        :columns="columns"
        :rows="data?.rows ?? []"
        :loading="pending && !data"
        :filtered="filter !== 'all' || !!route.query.q"
        empty-title="No communities match"
        empty-icon="lucide:building-2"
        @row-click="(row: any) => navigateTo(`/ops/communities/${row.id}`)"
      >
        <template #cell-name="{ row }">
          <span class="font-medium t-text">{{ row.name }}</span>
          <span class="ml-1 type-micro t-text-muted">/{{ row.slug }}</span>
        </template>
        <template #cell-status="{ row }">
          <span class="inline-flex flex-wrap items-center gap-1">
            <OpsStatusPill :status="row.status" />
            <span v-if="row.trialEndingSoon" class="type-micro text-warning">ends soon</span>
            <span v-if="row.inGrace" class="type-micro text-info">grace</span>
          </span>
        </template>
        <template #cell-band="{ row }">{{ row.band?.name ?? "—" }}</template>
        <template #cell-units="{ row }">
          <span class="tabular-nums">{{ row.realUnits }} / {{ row.declaredUnits || "—" }}</span>
        </template>
        <template #cell-billedBy="{ row }">
          <span v-if="row.billedBy === 'agency'" class="type-meta">{{ row.billingAccount?.name ?? "Agency" }}</span>
          <span v-else class="type-meta t-text-muted">Self</span>
        </template>
        <template #cell-monthlyValueCents="{ row }">
          <span class="tabular-nums">{{ row.billedBy === "agency" ? "via agency" : money(row.monthlyValueCents) }}</span>
        </template>
        <template #cell-trialEndsAt="{ row }">{{ row.status === "trial" ? shortDate(row.trialEndsAt) : "—" }}</template>
        <template #cell-signupAt="{ row }">{{ shortDate(row.signupAt) }}</template>
        <template #cell-primaryContact="{ row }">
          <span v-if="row.primaryContact" class="block min-w-0">
            <span class="block truncate">{{ row.primaryContact.name || "—" }}</span>
            <span class="block truncate type-micro t-text-muted">{{ row.primaryContact.email }}</span>
          </span>
          <span v-else class="type-micro text-warning">No HOA Admin</span>
        </template>
      </AppDataTable>

      <div v-if="data && data.pages > 1" class="mt-4 flex items-center justify-between gap-2">
        <Button variant="outline" size="sm" :disabled="page <= 1" @click="setQuery({ page: page - 1 > 1 ? page - 1 : undefined })">Previous</Button>
        <span class="type-meta t-text-muted">Page {{ data.page }} of {{ data.pages }} · {{ data.total }} communities</span>
        <Button variant="outline" size="sm" :disabled="page >= data.pages" @click="setQuery({ page: page + 1 })">Next</Button>
      </div>
      <p v-else-if="data" class="mt-3 type-micro t-text-muted">{{ data.total }} communities</p>
    </div>
  </OpsShell>
</template>
