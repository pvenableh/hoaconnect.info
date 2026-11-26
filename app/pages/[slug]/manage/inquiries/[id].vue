<script setup lang="ts">
definePageMeta({
  middleware: ["manager", "subscription"],
  layout: "auth",
  managerCapability: ["inquiries", "violations"],
});

const route = useRoute();
const { buildOrgPath } = useOrgNavigation();
const { user } = useDirectusAuth();
const { selectedOrgId } = await useSelectedOrg();
const { getOne } = useInquiries();

const requestId = computed(() => route.params.id as string);

// Through /api/org/inquiries/:id (docs/spec-delegation.md): a helper holding
// the area reads it with the app's token, as a manager does.
const { data, pending, refresh } = await useAsyncData(
  `manage-inquiry-${requestId.value}`,
  () => getOne(requestId.value).catch(() => null),
  { watch: [requestId], server: false }
);
const request = computed(() => data.value?.request ?? null);

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
        via="area"
        :channel="data?.channel ?? null"
        :is-submitter="isSubmitter"
        :is-assignee="isAssignee"
        @updated="refresh"
      />

      <p v-else class="t-text-muted py-16 text-center">Inquiry not found.</p>
    </PageContainer>
  </div>
</template>
