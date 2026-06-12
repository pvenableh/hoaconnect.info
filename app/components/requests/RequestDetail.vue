<script setup lang="ts">
import type { RequestRow } from "~/composables/useRequests";
import { toast } from "vue-sonner";
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

const { applyTransition, updateRequest, currentState, createRequest } = useRequests();
const { buildOrgPath } = useOrgNavigation();
const { isEnabled } = useModules();
const { list: listChannels } = useDirectusItems("hoa_channels");

const channelsEnabled = computed(() => isEnabled("channels"));

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

// ── Ticket ↔ channel / task integration (Track D) ──────────────────────────────
const idOf = (v: any): string | null =>
  v == null ? null : typeof v === "string" ? v : (v.id ?? null);

const authorUserId = computed(() => idOf(props.request.submitted_by));
const authorName = computed(() => personName(props.request.submitted_by));

// Linked discussion channel (reverse lookup hoa_channels.request === this ticket).
const linkedChannel = ref<{ id: string; name: string; slug: string } | null>(null);
const loadLinkedChannel = async () => {
  if (!channelsEnabled.value) return;
  try {
    const rows = (await listChannels({
      fields: ["id", "name", "slug"],
      filter: { request: { _eq: props.request.id } },
      limit: 1,
    })) as any[];
    linkedChannel.value = rows?.[0] || null;
  } catch {
    // `request` field may not exist yet (pre-migration) — ignore.
    linkedChannel.value = null;
  }
};
onMounted(loadLinkedChannel);
watch(() => props.request.id, loadLinkedChannel);

const showSpawnDialog = ref(false);
const inviteAuthor = ref(true);
const spawningChannel = ref(false);
const spawningTask = ref(false);

const doSpawnChannel = async () => {
  spawningChannel.value = true;
  try {
    const slug = `ticket-${props.request.id.slice(0, 8)}`;
    const invite_users =
      inviteAuthor.value && authorUserId.value ? [authorUserId.value] : [];
    const { channel } = await $fetch<{ channel: any }>(
      "/api/hoa/channels/create",
      {
        method: "POST",
        body: {
          organization: props.organizationId,
          name: props.request.title
            ? `Ticket: ${props.request.title}`.slice(0, 80)
            : slug,
          slug,
          description: `Internal discussion for ticket "${props.request.title || slug}".`,
          is_private: false,
          request: props.request.id,
          invite_users,
        },
      }
    );
    toast.success("Discussion channel created");
    showSpawnDialog.value = false;
    await navigateTo(buildOrgPath(`/admin/channels/${channel.slug}`));
  } catch (e: any) {
    toast.error(e?.data?.message || "Failed to create channel");
  } finally {
    spawningChannel.value = false;
  }
};

const spawnTask = async () => {
  spawningTask.value = true;
  try {
    const created: any = await createRequest({
      type: "task",
      title: `Follow-up: ${props.request.title || "ticket"}`.slice(0, 100),
      description: props.request.description || undefined,
      member: idOf(props.request.member),
      unit: idOf(props.request.unit),
      parent_request: props.request.id,
    });
    toast.success("Task created");
    await navigateTo(buildOrgPath(`/admin/requests/${created.id}`));
  } catch (e: any) {
    toast.error(e?.message || "Failed to create task");
  } finally {
    spawningTask.value = false;
  }
};

// ── Promote to project ────────────────────────────────────────────────────────
const { promoteRequest } = useProjects();
const { isEnabled: moduleEnabled } = useModules();
const projectsEnabled = computed(() => moduleEnabled("projects"));
const linkedProject = computed(() =>
  props.request.project && typeof props.request.project === "object" ? props.request.project : null
);
const promoting = ref(false);
const doPromote = async () => {
  if (promoting.value) return;
  promoting.value = true;
  try {
    const { projectId } = await promoteRequest(props.request.id, {});
    emit("updated");
    await navigateTo(buildOrgPath(`/admin/projects/${projectId}`));
  } catch {
    /* toast surfaced in composable */
  } finally {
    promoting.value = false;
  }
};
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

      <!-- Spawn channel / task (board + admin) -->
      <div
        v-if="isBoard && channelsEnabled"
        class="flex flex-wrap gap-2 mt-4 pt-4 border-t border-stone-100"
      >
        <NuxtLink
          v-if="linkedChannel"
          :to="buildOrgPath(`/admin/channels/${linkedChannel.slug}`)"
        >
          <Button size="sm" variant="outline" class="rounded-full">
            <Icon name="lucide:messages-square" class="w-3.5 h-3.5 mr-1" />
            Discussion
          </Button>
        </NuxtLink>
        <Button
          v-else
          size="sm"
          variant="outline"
          class="rounded-full"
          :disabled="spawningChannel"
          @click="showSpawnDialog = true"
        >
          <Icon name="lucide:message-square-plus" class="w-3.5 h-3.5 mr-1" />
          Spawn channel
        </Button>
        <Button
          size="sm"
          variant="outline"
          class="rounded-full"
          :disabled="spawningTask"
          @click="spawnTask"
        >
          <Icon name="lucide:list-plus" class="w-3.5 h-3.5 mr-1" />
          Spawn task
        </Button>
      </div>

      <!-- Promote to / view linked project (board + admin, projects module on) -->
      <div
        v-if="isBoard && projectsEnabled"
        class="flex flex-wrap items-center gap-2 mt-4 pt-4 border-t border-stone-100"
      >
        <NuxtLink v-if="linkedProject" :to="buildOrgPath(`/admin/projects/${linkedProject.id}`)">
          <Button size="sm" variant="outline" class="rounded-full">
            <Icon name="lucide:kanban-square" class="w-3.5 h-3.5 mr-1" />
            {{ linkedProject.title || "View project" }}
          </Button>
        </NuxtLink>
        <Button
          v-else
          size="sm"
          variant="outline"
          class="rounded-full"
          :disabled="promoting"
          @click="doPromote"
        >
          <Icon name="lucide:rocket" class="w-3.5 h-3.5 mr-1" />
          Promote to project
        </Button>
      </div>
    </div>

    <!-- Spawn channel dialog -->
    <Dialog v-model:open="showSpawnDialog">
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Spawn discussion channel</DialogTitle>
          <DialogDescription>
            Creates an internal channel linked to this ticket. Admins and active
            board members are added automatically.
          </DialogDescription>
        </DialogHeader>
        <label
          v-if="authorUserId"
          class="flex items-center gap-2 text-sm t-text"
        >
          <input v-model="inviteAuthor" type="checkbox" class="rounded" />
          Invite the ticket author{{ authorName ? ` (${authorName})` : "" }}
        </label>
        <DialogFooter class="gap-2">
          <Button
            variant="outline"
            :disabled="spawningChannel"
            @click="showSpawnDialog = false"
          >
            Cancel
          </Button>
          <Button :disabled="spawningChannel" @click="doSpawnChannel">
            <Icon
              v-if="spawningChannel"
              name="lucide:loader-2"
              class="w-4 h-4 mr-1 animate-spin"
            />
            Create channel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

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
