<script setup lang="ts">
definePageMeta({
  middleware: ["manager", "subscription"],
  layout: "auth",
  managerCapability: "inquiries",
});

const route = useRoute();
const { buildOrgPath } = useOrgNavigation();
const { user } = useDirectusAuth();
const { selectedOrgId } = await useSelectedOrg();
const { getOne } = useRequests();

const requestId = computed(() => route.params.id as string);

const { data: request, pending, refresh } = await useAsyncData(
  `manage-inquiry-${requestId.value}`,
  () => getOne(requestId.value),
  { watch: [requestId], server: false }
);

const submittedById = computed(() => {
  const s = request.value?.submitted_by;
  return typeof s === "string" ? s : s?.id;
});
const assignedById = computed(() => {
  const a = request.value?.assigned_to;
  return typeof a === "string" ? a : a?.id;
});
const isSubmitter = computed(() => !!user.value?.id && submittedById.value === user.value.id);
const isAssignee = computed(() => !!user.value?.id && assignedById.value === user.value.id);
</script>

<template>
  <div class="min-h-screen t-bg t-text t-transition">
    <PageContainer class="space-y-6">
      <BackLink :to="buildOrgPath('/manage/inquiries')" label="All inquiries" />

      <div v-if="pending" class="py-24 flex justify-center"><div class="spinner-ios" /></div>

      <RequestsRequestDetail
        v-else-if="request"
        :request="request"
        :organization-id="selectedOrgId"
        :is-board="true"
        :is-submitter="isSubmitter"
        :is-assignee="isAssignee"
        @updated="refresh"
      />

      <p v-else class="t-text-muted py-16 text-center">Inquiry not found.</p>
    </PageContainer>
  </div>
</template>
