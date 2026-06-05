<script setup lang="ts">
import type { RequestRow } from "~/composables/useRequests";
import {
  getWorkflow,
  getStateMeta,
  availableTransitions,
} from "~/config/requestWorkflows";

const props = withDefaults(
  defineProps<{
    request: RequestRow;
    organizationId: string | null;
    isBoard?: boolean;
    isSubmitter?: boolean;
    isAssignee?: boolean;
  }>(),
  { isBoard: false, isSubmitter: false, isAssignee: false }
);

const emit = defineEmits<{ (e: "updated"): void }>();

const { applyTransition, updateRequest, currentState } = useRequests();

const local = ref<RequestRow>({ ...props.request });
watch(
  () => props.request,
  (r) => (local.value = { ...r }),
  { deep: true }
);

const workflow = computed(() => getWorkflow(local.value.type));
const state = computed(() => currentState(local.value));
const stateMeta = computed(() => getStateMeta(local.value.type, state.value));

const accentClass: Record<string, string> = {
  amber: "bg-amber-50 text-amber-700 ring-amber-200",
  violet: "bg-violet-50 text-violet-700 ring-violet-200",
  red: "bg-red-50 text-red-700 ring-red-200",
  orange: "bg-orange-50 text-orange-700 ring-orange-200",
  sky: "bg-sky-50 text-sky-700 ring-sky-200",
};

const transitions = computed(() =>
  availableTransitions(local.value.type, state.value, {
    isBoard: props.isBoard,
    isSubmitter: props.isSubmitter,
    isAssignee: props.isAssignee,
  })
);

// Metadata fields visible to this viewer (internal ones board-only).
const metaFields = computed(() =>
  workflow.value.metadata.filter((f) => !f.internal || props.isBoard)
);

const metaEdit = ref<Record<string, any>>({ ...(props.request.metadata || {}) });
watch(
  () => props.request.metadata,
  (m) => (metaEdit.value = { ...(m || {}) }),
  { deep: true }
);
const savingMeta = ref(false);
const transitioning = ref(false);

const personName = (p: RequestRow["assigned_to"]) => {
  if (!p || typeof p === "string") return null;
  return `${p.first_name || ""} ${p.last_name || ""}`.trim() || null;
};

const doTransition = async (to: string, label: string) => {
  transitioning.value = true;
  try {
    await applyTransition(local.value, to, label);
    emit("updated");
  } finally {
    transitioning.value = false;
  }
};

const saveMetadata = async () => {
  savingMeta.value = true;
  try {
    await updateRequest(local.value.id, {
      metadata: { ...(local.value.metadata || {}), ...metaEdit.value },
    } as Partial<RequestRow>);
    emit("updated");
  } finally {
    savingMeta.value = false;
  }
};

const formatDate = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) : "—";
</script>

<template>
  <div class="space-y-6">
    <!-- Workflow header -->
    <div class="ios-card p-6">
      <div class="flex items-start gap-4">
        <div
          class="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ring-1"
          :class="accentClass[workflow.accent] || 'bg-stone-50 text-stone-600 ring-stone-200'"
        >
          <Icon :name="workflow.icon" class="w-6 h-6" />
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="text-xs font-medium text-stone-500 uppercase tracking-wide">
              {{ workflow.label }}
            </span>
            <span
              class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ring-1"
              :class="accentClass[workflow.accent] || 'bg-stone-50 text-stone-600 ring-stone-200'"
            >
              {{ stateMeta.label }}
            </span>
            <span
              v-if="local.priority === 'urgent'"
              class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-red-50 text-red-700"
            >Urgent</span>
          </div>
          <h1 class="text-xl font-semibold text-stone-900 mt-1">{{ local.title }}</h1>

          <div class="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-sm text-stone-500">
            <span v-if="personName(local.submitted_by)">
              By {{ personName(local.submitted_by) }}
            </span>
            <span>Assigned: {{ personName(local.assigned_to) || "Unassigned" }}</span>
            <span v-if="local.due_date">Due {{ formatDate(local.due_date) }}</span>
          </div>
        </div>
      </div>

      <!-- Description -->
      <div
        v-if="local.description"
        class="prose prose-sm prose-stone max-w-none mt-4 pt-4 border-t border-stone-100"
        v-html="local.description"
      />

      <!-- Transitions -->
      <div v-if="transitions.length" class="flex flex-wrap gap-2 mt-4 pt-4 border-t border-stone-100">
        <Button
          v-for="t in transitions"
          :key="t.to"
          size="sm"
          variant="outline"
          class="rounded-full"
          :disabled="transitioning"
          @click="doTransition(t.to, t.label)"
        >
          {{ t.label }}
        </Button>
      </div>
    </div>

    <!-- Metadata -->
    <div v-if="metaFields.length" class="ios-card p-6">
      <h3 class="font-semibold text-stone-900 mb-3">Details</h3>
      <div class="grid grid-cols-2 gap-4">
        <div v-for="field in metaFields" :key="field.key">
          <label class="block text-xs font-medium text-stone-500 mb-1">
            {{ field.label }}
            <span v-if="field.internal" class="text-amber-600">· internal</span>
          </label>
          <template v-if="isBoard">
            <textarea
              v-if="field.type === 'textarea'"
              v-model="metaEdit[field.key]"
              rows="2"
              class="w-full px-2.5 py-1.5 border rounded-md bg-background text-sm resize-none"
            />
            <Input
              v-else
              v-model="metaEdit[field.key]"
              :type="field.type === 'date' ? 'date' : field.type === 'number' || field.type === 'currency' ? 'number' : 'text'"
            />
          </template>
          <p v-else class="text-sm text-stone-700">
            {{ request.metadata?.[field.key] || "—" }}
          </p>
        </div>
      </div>
      <div v-if="isBoard" class="flex justify-end mt-3">
        <Button size="sm" class="rounded-full" :disabled="savingMeta" @click="saveMetadata">
          <Icon v-if="savingMeta" name="lucide:loader-2" class="w-3.5 h-3.5 mr-1 animate-spin" />
          Save details
        </Button>
      </div>
    </div>

    <!-- Conversation -->
    <div class="ios-card p-6">
      <CommentsCommentThread
        :target-collection="'hoa_requests'"
        :target-id="request.id"
        :organization-id="organizationId"
        :is-board="isBoard"
        :is-member="true"
        :is-participant="isSubmitter || isAssignee || isBoard"
        title="Activity"
      />
    </div>
  </div>
</template>
