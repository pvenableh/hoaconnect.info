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
            <Button variant="outline" class="rounded-full">
              <Icon name="lucide:globe" class="w-4 h-4 mr-1.5" />
              Website leads
            </Button>
          </NuxtLink>
          <NuxtLink :to="buildOrgPath('/admin/teams')">
            <Button variant="outline" class="rounded-full">
              <Icon name="lucide:users" class="w-4 h-4 mr-1.5" />
              Teams
            </Button>
          </NuxtLink>
          <Button class="rounded-full" @click="showNew = !showNew">
            <Icon name="lucide:plus" class="w-4 h-4 mr-1.5" />
            New request
          </Button>
        </div>
      </div>

      <!--
        Requests is where the dock now lands. The list says what is in the
        queue; this says whether the queue is being worked. Deliberately reads
        the UNFILTERED set — the health of the queue is not a property of the
        filter you happen to have on.
      -->
      <AdminRequestsGlance :requests="requests || []" :loading="pending" />

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
            :class="typeFilter === opt.key ? 't-bg-accent/20 t-text-accent' : 't-bg-alt t-text-muted hover:t-bg-subtle'"
          >{{ opt.label }}</button>
        </div>
        <div class="flex gap-1.5 ml-auto">
          <button
            v-for="opt in [{ key: 'open', label: 'Open' }, { key: 'resolved', label: 'Resolved' }, { key: 'all', label: 'All' }]"
            :key="opt.key"
            @click="statusFilter = opt.key"
            class="px-3 py-1.5 rounded-full text-xs font-medium transition-colors"
            :class="statusFilter === opt.key ? 't-bg-accent/20 t-text-accent' : 't-bg-alt t-text-muted hover:t-bg-subtle'"
          >{{ opt.label }}</button>
        </div>
      </div>

      <div class="ios-card p-2">
        <RequestsRequestList
          :requests="filtered"
          :base-path="basePath"
          :loading="pending"
          panel
          panel-mode="board"
        />
      </div>
    </PageContainer>
  </div>
</template>
