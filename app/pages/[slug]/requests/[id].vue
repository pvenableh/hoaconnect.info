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
const { loadMine, canManageRequestType } = useCommittees();

const requestId = computed(() => route.params.id as string);

const { data: request, pending, refresh } = await useAsyncData(
  `request-${requestId.value}`,
  () => getOne(requestId.value),
  { watch: [requestId], server: false }
);

// Committee members manage their domain's requests like the board does.
const { data: myCommittees } = await useAsyncData(
  `my-committees-${selectedOrgId.value}`,
  () => loadMine().then((s) => Array.from(s)),
  { watch: [selectedOrgId], server: false, default: () => [] }
);

const isBoard = computed(
  () =>
    isAdmin.value ||
    isBoardMember.value ||
    canManageRequestType(new Set(myCommittees.value || []), request.value?.type)
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
    <div class="p-6 max-w-3xl mx-auto space-y-6">
      <NuxtLink
        :to="buildOrgPath('/requests')"
        class="inline-flex items-center gap-1.5 text-sm t-text-muted hover:t-text transition-colors"
      >
        <Icon name="lucide:arrow-left" class="w-4 h-4" />
        My requests
      </NuxtLink>

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
    </div>
  </div>
</template>
