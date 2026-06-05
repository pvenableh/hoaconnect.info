<script setup lang="ts">
import { requestTypeList } from "~/config/requestWorkflows";

definePageMeta({
  middleware: ["admin", "subscription"],
  layout: "auth",
});

const { buildOrgPath } = useOrgNavigation();
const { selectedOrgId } = await useSelectedOrg();
const { list } = useRequests();

const basePath = computed(() => buildOrgPath("/admin/requests"));

const typeFilter = ref<string>("all");
const statusFilter = ref<string>("open");
const showNew = ref(false);

const { data: requests, pending, refresh } = await useAsyncData(
  `admin-requests-${selectedOrgId.value}`,
  () => list({}, ["-date_updated"]),
  { watch: [selectedOrgId], server: false }
);

const filtered = computed(() => {
  let rows = requests.value || [];
  if (typeFilter.value !== "all") rows = rows.filter((r) => r.type === typeFilter.value);
  if (statusFilter.value === "open") rows = rows.filter((r) => r.status !== "closed" && r.status !== "resolved");
  else if (statusFilter.value === "resolved") rows = rows.filter((r) => r.status === "resolved" || r.status === "closed");
  return rows;
});

const onCreated = async (id: string) => {
  showNew.value = false;
  await refresh();
  navigateTo(`${basePath.value}/${id}`);
};
</script>

<template>
  <div class="min-h-screen t-bg t-text t-transition">
    <div class="p-6 max-w-4xl mx-auto space-y-6">
      <div class="flex items-center justify-between">
        <h1 class="text-2xl font-semibold t-text">Requests</h1>
        <Button class="rounded-full" @click="showNew = !showNew">
          <Icon name="lucide:plus" class="w-4 h-4 mr-1.5" />
          New request
        </Button>
      </div>

      <!-- New request inline -->
      <div v-if="showNew" class="ios-card p-6">
        <RequestsRequestForm
          :organization-id="selectedOrgId"
          :allowed-types="['maintenance','arc','violation','complaint','task']"
          @created="onCreated"
          @cancel="showNew = false"
        />
      </div>

      <!-- Filters -->
      <div class="flex flex-wrap items-center gap-2">
        <div class="flex gap-1.5 overflow-x-auto">
          <button
            v-for="opt in [{ key: 'all', label: 'All types' }, ...requestTypeList.map((t) => ({ key: t.type, label: t.label }))]"
            :key="opt.key"
            @click="typeFilter = opt.key"
            class="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors"
            :class="typeFilter === opt.key ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'"
          >{{ opt.label }}</button>
        </div>
        <div class="flex gap-1.5 ml-auto">
          <button
            v-for="opt in [{ key: 'open', label: 'Open' }, { key: 'resolved', label: 'Resolved' }, { key: 'all', label: 'All' }]"
            :key="opt.key"
            @click="statusFilter = opt.key"
            class="px-3 py-1.5 rounded-full text-xs font-medium transition-colors"
            :class="statusFilter === opt.key ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'"
          >{{ opt.label }}</button>
        </div>
      </div>

      <div class="ios-card p-2">
        <RequestsRequestList :requests="filtered" :base-path="basePath" :loading="pending" />
      </div>
    </div>
  </div>
</template>
