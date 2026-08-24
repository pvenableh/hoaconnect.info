<script setup lang="ts">
definePageMeta({
  middleware: ["admin", "subscription"],
  layout: "auth",
});

const route = useRoute();
const { buildOrgPath } = useOrgNavigation();
const { user } = useDirectusAuth();
const { selectedOrgId } = await useSelectedOrg();
const { getOne } = useRequests();

const requestId = computed(() => route.params.id as string);

const { data: request, pending, refresh } = await useAsyncData(
  `admin-request-${requestId.value}`,
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

// Anchor the AI assistant to this request/violation while the page is open, so
// the assistant answers about THIS ticket and keeps its own thread for it.
const { setContext, clearContext } = useAiContext();
watch(
  request,
  (r) => {
    if (r) {
      setContext({
        entityType: (r as any).type === "violation" ? "violation" : "request",
        entityId: String(r.id),
        label: r.title || "Request",
      });
    }
  },
  { immediate: true }
);
onBeforeUnmount(clearContext);
</script>

<template>
  <div class="min-h-screen t-bg t-text t-transition">
    <PageContainer class="space-y-6">
      <BackLink :to="buildOrgPath('/admin/requests')" label="All requests" />

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

      <!-- Notices about THIS request, plus anything proposed on it awaiting a
           decision. `violation` is the page's word; the layer translates it to
           the `request` the notices engine and ai_actions both use. -->
      <DirectorLayer
        v-if="request"
        :entity-type="(request as any).type === 'violation' ? 'violation' : 'request'"
        :entity-id="String(request.id)"
        :label="request.title"
      />

      <AiEntityCard
        v-if="request"
        :entity-type="(request as any).type === 'violation' ? 'violation' : 'request'"
        :label="request.title"
      />

      <p v-if="!pending && !request" class="t-text-muted py-16 text-center">Request not found.</p>
    </PageContainer>
  </div>
</template>
