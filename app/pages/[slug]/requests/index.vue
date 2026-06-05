<script setup lang="ts">
definePageMeta({
  middleware: ["auth", "subscription"],
  layout: "auth",
});

const { buildOrgPath } = useOrgNavigation();
const { user } = useDirectusAuth();
const { selectedOrgId } = await useSelectedOrg();
const { list } = useRequests();

const basePath = computed(() => buildOrgPath("/requests"));
const showNew = ref(false);

// Members see only their own requests (the API enforces this too).
const { data: requests, pending, refresh } = await useAsyncData(
  `my-requests-${selectedOrgId.value}`,
  () =>
    list(
      {
        _or: [
          { submitted_by: { _eq: user.value?.id } },
          { member: { user: { _eq: user.value?.id } } },
        ],
      },
      ["-date_updated"]
    ),
  { watch: [selectedOrgId], server: false }
);

const onCreated = async (id: string) => {
  showNew.value = false;
  await refresh();
  navigateTo(`${basePath.value}/${id}`);
};
</script>

<template>
  <div class="min-h-screen t-bg t-text t-transition">
    <div class="p-6 max-w-3xl mx-auto space-y-6">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-semibold t-text">My Requests</h1>
          <p class="text-sm t-text-muted mt-0.5">
            Maintenance, architectural review, and complaints.
          </p>
        </div>
        <Button class="rounded-full" @click="showNew = !showNew">
          <Icon name="lucide:plus" class="w-4 h-4 mr-1.5" />
          New request
        </Button>
      </div>

      <div v-if="showNew" class="ios-card p-6">
        <RequestsRequestForm
          :organization-id="selectedOrgId"
          :allowed-types="['maintenance','arc','complaint']"
          @created="onCreated"
          @cancel="showNew = false"
        />
      </div>

      <div class="ios-card p-2">
        <RequestsRequestList :requests="requests || []" :base-path="basePath" :loading="pending" />
      </div>
    </div>
  </div>
</template>
