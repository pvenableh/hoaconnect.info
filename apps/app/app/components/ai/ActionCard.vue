<script setup lang="ts">
// One HITL proposal card: what the assistant wants to do, and the human's
// controls. Pending → Approve / Reject / Edit; executed → Undo (when reversible).
// Renders generically from the proposal's preview so every action type is
// covered without a per-type template. (Phase 4.)
import type { AiActionRow } from "#core/app/composables/useAiActions";

const props = defineProps<{ action: AiActionRow; busy?: boolean }>();
const emit = defineEmits<{
  (e: "approve", id: string): void;
  (e: "reject", id: string): void;
  (e: "undo", id: string): void;
  (e: "edit", id: string, payload: Record<string, any>): void;
}>();

const ACTION_ICON: Record<string, string> = {
  create_task: "lucide:check-square", add_comment: "lucide:message-square",
  create_request: "lucide:clipboard-list", update_request_status: "lucide:refresh-cw",
  assign_request: "lucide:user-plus", update_member_field: "lucide:user-cog",
  log_violation: "lucide:alert-triangle", assign_vendor: "lucide:hard-hat",
  schedule_meeting: "lucide:calendar-plus", set_due_date: "lucide:calendar-clock",
  send_email: "lucide:mail", post_announcement: "lucide:megaphone", notify_board: "lucide:users",
};
const icon = computed(() => ACTION_ICON[props.action.action_type] || "lucide:sparkles");

const STATUS_STYLE: Record<string, string> = {
  pending: "text-amber-700 bg-amber-100 dark:text-amber-300 dark:bg-amber-500/15",
  executed: "text-emerald-700 bg-emerald-100 dark:text-emerald-300 dark:bg-emerald-500/15",
  rejected: "t-text-muted t-bg-subtle",
  failed: "text-red-700 bg-red-100 dark:text-red-300 dark:bg-red-500/15",
  approved: "text-blue-700 bg-blue-100 dark:text-blue-300 dark:bg-blue-500/15",
};

// Human-readable preview lines (skip meta + long body fields, which render below).
const BODY_KEYS = new Set(["bodyHtml", "body", "content", "description", "agenda"]);
const previewLines = computed(() => {
  const p = props.action.preview || {};
  return Object.entries(p)
    .filter(([k, v]) => !["kind", "label", "note"].includes(k) && !BODY_KEYS.has(k) && v != null && v !== "")
    .map(([k, v]) => ({ label: k.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()), value: String(v) }));
});
const bodyText = computed(() => {
  const p = props.action.preview || {};
  return p.bodyHtml || p.body || p.content || p.description || p.agenda || "";
});
const note = computed(() => (props.action.preview as any)?.note || "");

const isUndoable = computed(
  () => props.action.status === "executed" && props.action.result?._undo && !props.action.result?._undone
);
const wasUndone = computed(() => props.action.status === "executed" && props.action.result?._undone);

// ── inline edit (pending only) ──────────────────────────────────────────────
const EDIT_KEYS = ["title", "subject", "body_html", "body", "content", "description", "value", "due_date", "meeting_date", "agenda", "priority", "status"];
const editing = ref(false);
const draft = ref<Record<string, any>>({});
function startEdit() {
  draft.value = { ...(props.action.payload || {}) };
  editing.value = true;
}
function saveEdit() {
  emit("edit", props.action.id, { ...draft.value });
  editing.value = false;
}
const editableFields = computed(() =>
  EDIT_KEYS.filter((k) => props.action.payload && k in (props.action.payload as any))
);
const isLong = (k: string) => ["body_html", "body", "content", "description", "agenda"].includes(k);
const showBody = ref(false);
</script>

<template>
  <div class="rounded-xl border t-border t-bg overflow-hidden">
    <div class="flex items-start gap-2.5 p-3">
      <span class="t-icon-chip shrink-0 mt-0.5"><Icon :name="icon" class="w-4 h-4" /></span>
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2 flex-wrap">
          <span class="text-sm font-medium t-text">{{ action.title || action.action_type }}</span>
          <span class="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded" :class="STATUS_STYLE[action.status] || 't-bg-subtle'">
            {{ wasUndone ? "undone" : action.status }}
          </span>
          <span v-if="action.outbound" class="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded text-purple-700 bg-purple-100 dark:text-purple-300 dark:bg-purple-500/15" title="Reaches residents or the board — always needs approval">
            outbound
          </span>
        </div>

        <!-- Read view -->
        <template v-if="!editing">
          <dl v-if="previewLines.length" class="mt-1.5 space-y-0.5">
            <div v-for="l in previewLines" :key="l.label" class="flex gap-1.5 text-xs">
              <dt class="t-text-muted shrink-0">{{ l.label }}:</dt>
              <dd class="t-text truncate">{{ l.value }}</dd>
            </div>
          </dl>
          <div v-if="bodyText" class="mt-1.5">
            <button type="button" class="text-xs text-primary hover:underline" @click="showBody = !showBody">
              {{ showBody ? "Hide" : "Show" }} content
            </button>
            <div v-if="showBody" class="mt-1 rounded-lg t-bg-subtle p-2 text-xs t-text max-h-48 overflow-y-auto whitespace-pre-wrap break-words" v-html="bodyText" />
          </div>
          <p v-if="note" class="mt-1.5 text-[11px] t-text-muted italic">{{ note }}</p>
          <p v-if="action.error_message" class="mt-1.5 text-[11px] text-red-600">{{ action.error_message }}</p>
        </template>

        <!-- Edit view -->
        <div v-else class="mt-2 space-y-2">
          <div v-for="k in editableFields" :key="k" class="space-y-1">
            <Label class="text-[11px] t-text-muted capitalize">{{ k.replace(/_/g, " ") }}</Label>
            <textarea v-if="isLong(k)" v-model="draft[k]" rows="4" class="w-full rounded-lg border t-border t-bg-subtle p-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/40" />
            <Input v-else v-model="draft[k]" class="h-8 text-sm" />
          </div>
        </div>
      </div>
    </div>

    <!-- Controls -->
    <div v-if="action.status === 'pending'" class="flex items-center gap-2 px-3 py-2 border-t t-border t-bg-subtle/40">
      <template v-if="!editing">
        <Button type="button" size="sm" :disabled="busy" @click="emit('approve', action.id)">
          <Icon name="lucide:check" class="w-3.5 h-3.5 mr-1" /> Approve
        </Button>
        <Button type="button" size="sm" variant="ghost" :disabled="busy" @click="emit('reject', action.id)">
          Reject
        </Button>
        <Button v-if="editableFields.length" type="button" size="sm" variant="ghost" class="ml-auto" :disabled="busy" @click="startEdit">
          <Icon name="lucide:pencil" class="w-3.5 h-3.5 mr-1" /> Edit
        </Button>
      </template>
      <template v-else>
        <Button type="button" size="sm" :disabled="busy" @click="saveEdit">Save changes</Button>
        <Button type="button" size="sm" variant="ghost" @click="editing = false">Cancel</Button>
      </template>
    </div>
    <div v-else-if="isUndoable" class="flex items-center px-3 py-2 border-t t-border t-bg-subtle/40">
      <Button type="button" size="sm" variant="ghost" :disabled="busy" @click="emit('undo', action.id)">
        <Icon name="lucide:undo-2" class="w-3.5 h-3.5 mr-1" /> Undo
      </Button>
    </div>
  </div>
</template>
