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

const requestId = computed(() => route.params.id as string);

// Opening the thing marks the bell row about it read. `status: "archived"` is
// durable, so this clears on the member's phone too, and the dock badge and the
// bell both recompute off the same list.
useMarkItemRead("hoa_requests", requestId);

const { data: request, status, refresh } = await useAsyncData(
  `request-${requestId.value}`,
  () => getOne(requestId.value),
  { watch: [requestId], server: false }
);
// server: false, so the server renders "idle": count it as loading, or the
// server's empty state and the client's first-render spinner disagree at hydration.
const pending = computed(() => status.value === "idle" || status.value === "pending");

// Admin or a board seat. A team's domain used to add its members here too, but
// no route checked it: promote and "Start a channel" refused them, and the rest
// wrote with their own token (docs/spec-delegation.md). A committee works
// requests once the inquiries and violations areas can be given to helpers.
const isBoard = computed(() => isAdmin.value || isBoardMember.value);

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
