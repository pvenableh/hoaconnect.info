<script setup lang="ts">
definePageMeta({
  middleware: ["auth", "subscription"],
  layout: "auth",
});

const route = useRoute();
const { buildOrgPath } = useOrgNavigation();
const { user } = useDirectusAuth();
const { selectedOrgId, isAdmin, isBoardMember } = await useSelectedOrg();
const { getOne } = useRequests();
const { loadMyDomains, canManageRequestType } = useTeams();

const requestId = computed(() => route.params.id as string);

const { data: request, pending, refresh } = await useAsyncData(
  `request-${requestId.value}`,
  () => getOne(requestId.value),
  { watch: [requestId], server: false }
);

// Team members manage their domain's requests like the board does.
const { data: myDomains } = await useAsyncData(
  `my-team-domains-${selectedOrgId.value}`,
  () => loadMyDomains().then((s) => Array.from(s)),
  { watch: [selectedOrgId], server: false, default: () => [] }
);

const isBoard = computed(
  () =>
    isAdmin.value ||
    isBoardMember.value ||
    canManageRequestType(new Set(myDomains.value || []), request.value?.type)
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
      <BackLink :to="buildOrgPath('/requests')" label="My requests" />

      <div v-if="pending" class="py-24 flex justify-center"><div class="spinner-ios" /></div>

      <RequestsRequestDetail
        v-else-if="request"
        :request="request"
        :organization-id="selectedOrgId"
        :is-board="isBoard"
        :is-submitter="isSubmitter"
        :is-assignee="isAssignee"
        @updated="refresh"
      />

      <p v-else class="t-text-muted py-16 text-center">Request not found.</p>
    </PageContainer>
  </div>
</template>
