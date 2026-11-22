<script setup lang="ts">
import { requestTypeList } from "#core/app/config/requestWorkflows";

definePageMeta({
  middleware: ["admin", "subscription"],
  layout: "auth",
});

const { buildOrgPath } = useOrgNavigation();
const { selectedOrgId } = await useSelectedOrg();
const { list } = useRequests();

const basePath = computed(() => buildOrgPath("/admin/requests"));

// Table or board: remembered per person (D4); the table is the default, and the only
// choice a phone starts with.
const view = ref<string>("table");
onMounted(() => {
  try {
    const saved = localStorage.getItem("requests-view-v1");
    if (saved === "board" || saved === "table") view.value = saved;
  } catch {
    /* private mode: stay on the table */
  }
});
watch(view, (v) => {
  try {
    localStorage.setItem("requests-view-v1", v);
  } catch {
    /* not saved */
  }
});

const typeFilter = ref<string>("all");
const statusFilter = ref<string>("open");
const showNew = ref(false);
// "+ New → New Request" and Spotlight land here with ?new=request.
useCreateIntent("request", () => {
  showNew.value = true;
});

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

// Rows open in the slide-over panel; re-fetch when it closes so any status
// transitions made inside the panel land back in the list.
const route = useRoute();
watch(
  () => route.query.slide,
  (now, was) => {
    if (was && !now) refresh();
  }
);
</script>

<template>
  <div class="min-h-screen t-bg t-text t-transition">
    <PageContainer class="space-y-6">
      <div class="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <p class="text-xs uppercase tracking-widest t-text-tertiary mb-1">Action queue</p>
          <h1 class="text-3xl font-semibold tracking-tight t-text">Requests</h1>
        </div>
        <div class="flex items-center gap-2">
          <NuxtLink :to="buildOrgPath('/admin/leads')">
            <AppButton variant="outline" class="rounded-full">
              <Icon name="lucide:globe" class="w-4 h-4 mr-1.5" />
              Website leads
            </AppButton>
          </NuxtLink>
          <NuxtLink :to="buildOrgPath('/admin/teams')">
            <AppButton variant="outline" class="rounded-full">
              <Icon name="lucide:users" class="w-4 h-4 mr-1.5" />
              Teams
            </AppButton>
          </NuxtLink>
          <AppButton class="rounded-full" @click="showNew = !showNew">
            <Icon name="lucide:plus" class="w-4 h-4 mr-1.5" />
            New request
          </AppButton>
        </div>
      </div>

      <!-- The assistant's advisory strip: what needs looking at here, and
           anything waiting for a decision. Self-hides when it has nothing. -->
      <DirectorLayer />

      <!--
        Requests is where the dock now lands. The list says what is in the
        queue; this says whether the queue is being worked. Deliberately reads
        the UNFILTERED set — the health of the queue is not a property of the
        filter you happen to have on.
      -->
      <AdminRequestsGlance :requests="requests || []" :loading="pending" />

      <!-- New request inline -->
      <AppBottomSheet v-model:open="showNew" title="New request">
        <RequestsRequestForm
          :organization-id="selectedOrgId"
          :allowed-types="['maintenance','arc','violation','complaint','task']"
          @created="onCreated"
          @cancel="showNew = false"
        />
      </AppBottomSheet>

      <!-- Filters -->
      <div class="flex flex-wrap items-center gap-2">
        <div class="flex gap-1.5 overflow-x-auto">
          <button
            v-for="opt in [{ key: 'all', label: 'All types' }, ...requestTypeList.map((t) => ({ key: t.type, label: t.label }))]"
            :key="opt.key"
            @click="typeFilter = opt.key"
            class="filter-pill flex-shrink-0"
            :class="{ 'filter-pill--active': typeFilter === opt.key }"
          >{{ opt.label }}</button>
        </div>
        <AppSegmentedControl
          v-model="view"
          class="ml-auto"
          size="sm"
          label="View"
          :items="[{ value: 'table', label: 'Table' }, { value: 'board', label: 'Board' }]"
        />
        <div class="flex gap-1.5">
          <button
            v-for="opt in [{ key: 'open', label: 'Open' }, { key: 'resolved', label: 'Resolved' }, { key: 'all', label: 'All' }]"
            :key="opt.key"
            @click="statusFilter = opt.key"
            class="filter-pill"
            :class="{ 'filter-pill--active': statusFilter === opt.key }"
          >{{ opt.label }}</button>
        </div>
      </div>

      <RequestsRequestBoard v-if="view === 'board' && filtered.length" :requests="filtered" :base-path="basePath" @moved="refresh" />
      <div v-else class="ios-card p-2">
        <RequestsRequestList
          :requests="filtered"
          :base-path="basePath"
          :loading="pending"
          :filtered="!!requests?.length"
          panel
          panel-mode="board"
        >
          <template #empty-actions>
            <AppButton class="rounded-full" @click="showNew = true">New Request</AppButton>
          </template>
        </RequestsRequestList>
      </div>
    </PageContainer>
  </div>
</template>
