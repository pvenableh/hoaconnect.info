<script setup lang="ts">
/**
 * The plan, as numbered steps.
 *
 * There is no Board Room proposal card. A step IS an `ai_actions` row — the
 * same row the approvals queue shows, sharing one `session_id` with the rest of
 * the plan — so this renders `<AiActionCard>`, the card the assistant panel and
 * the Director pill already use. A second card would mean two places where the
 * outbound warning, the Undo affordance and the expired-vs-rejected distinction
 * could drift apart.
 *
 * All this component adds is the number in the gutter and the plan's own sense
 * of progress.
 */
import type { AiActionRow } from "#core/app/composables/useAiActions";
import type { DirectorPlanStep } from "#core/app/composables/useDirectorLayer";

const props = defineProps<{
  steps: DirectorPlanStep[];
  busyId?: string | null;
  /** Steps the planner wanted but could not queue, with the reason. */
  skipped?: Array<{ actionType: string; reason: string }>;
}>();

const emit = defineEmits<{
  (e: "approve", id: string): void;
  (e: "reject", id: string): void;
  (e: "undo", id: string): void;
  (e: "edit", id: string, payload: Record<string, any>): void;
}>();

/**
 * The plan endpoint returns camelCase; the shared card reads the row's own
 * snake_case field names. One rename, in one place, rather than a second card
 * that happens to accept the other shape.
 */
function asRow(s: DirectorPlanStep): AiActionRow {
  return {
    id: String(s.id),
    action_type: s.actionType,
    status: s.status as AiActionRow["status"],
    outbound: s.outbound,
    preview: s.preview,
    result: s.result,
    error_message: s.errorMessage,
    title: s.title,
    entity_type: s.entityType,
    entity_id: s.entityId,
    date_created: s.dateCreated,
  };
}

const decided = computed(
  () => props.steps.filter((s) => s.status !== "pending" && s.status !== "approved").length
);
const outstanding = computed(() => props.steps.length - decided.value);
</script>

<template>
  <section aria-label="Proposed steps">
    <div class="flex items-center gap-2 mb-2 flex-wrap">
      <h2 class="t-overline">The plan</h2>
      <span class="text-[11px] t-text-muted tabular-nums">
        · {{ decided }} of {{ steps.length }} decided
        <template v-if="outstanding">— {{ outstanding }} still waiting on you</template>
      </span>
    </div>

    <ol class="space-y-2">
      <li v-for="(s, i) in steps" :key="s.id" class="flex items-start gap-3">
        <span
          class="w-6 h-6 mt-3 rounded-lg t-bg-subtle text-xs font-semibold t-text-secondary flex items-center justify-center shrink-0 tabular-nums"
          aria-hidden="true"
        >{{ i + 1 }}</span>
        <div class="min-w-0 flex-1">
          <AiActionCard
            :action="asRow(s)"
            :busy="busyId === String(s.id)"
            @approve="emit('approve', $event)"
            @reject="emit('reject', $event)"
            @undo="emit('undo', $event)"
            @edit="(id, payload) => emit('edit', id, payload)"
          />
        </div>
      </li>
    </ol>

    <!-- A step the planner wanted but could not queue is reported, not hidden.
         Silence here would read as "it only proposed three things". -->
    <p v-if="skipped?.length" class="mt-3 text-xs t-text-muted">
      {{ skipped.length }}
      {{ skipped.length === 1 ? "step was" : "steps were" }} dropped before reaching the queue:
      {{ skipped.map((s) => `${s.actionType} (${s.reason})`).join("; ") }}.
    </p>
  </section>
</template>
