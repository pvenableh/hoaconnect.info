<!--
  RequestPanel — slide-over quick-look for a request (?slide=request:id).

  Fetches its own data by id and renders the existing RequestsRequestDetail
  inside the shared AppSlideOverShell chrome. `mode: "board"` (set by admin
  pages when opening) lights up the board affordances — actual writes are
  still enforced server/Directus-side, the flag only shapes the UI.
-->
<script setup lang="ts">
import type { FlipFromPayload } from "~/composables/useFlipFromRow";
import { getWorkflow } from "~/config/requestWorkflows";

const props = defineProps<{
  id: string;
  mode?: string;
  flipFrom?: FlipFromPayload | null;
}>();

defineEmits<{ (e: "close"): void }>();

const { user } = useDirectusAuth();
const { selectedOrgId } = await useSelectedOrg();
const { getOne } = useRequests();

const {
  data: request,
  pending,
  refresh,
} = await useAsyncData(`panel-request-${props.id}`, () => getOne(props.id), {
  server: false,
});

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
const isBoard = computed(() => props.mode === "board");

const workflow = computed(() => (request.value ? getWorkflow(request.value.type) : null));
</script>

<template>
  <AppSlideOverShell
    :title="request?.title || 'Request'"
    :subtitle="workflow?.label"
    :flip-from="flipFrom"
    @close="$emit('close')"
  >
    <template v-if="flipFrom && request" #hero>
      <div class="flex items-center gap-3 px-2">
        <Icon v-if="workflow" :name="workflow.icon" class="w-5 h-5 t-text-accent shrink-0" />
        <div class="min-w-0">
          <p class="font-medium t-text truncate">{{ request.title }}</p>
          <p class="text-xs t-text-muted">{{ workflow?.label }}</p>
        </div>
      </div>
    </template>

    <div v-if="pending" class="py-16 flex justify-center">
      <div class="spinner-ios" />
    </div>

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
  </AppSlideOverShell>
</template>
