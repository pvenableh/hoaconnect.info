<!--
  ResponsibilitiesHolderForm — the two ways a job gets a holder (plan §3.4,
  "History: end, don't erase"), one form in AppBottomSheet:

    hand-over  ends the holder it is given the day before the date, and opens
               the next one from the date, in one call. Leave the next holder
               empty and the job simply reads unassigned from that day.
    assign     opens another holder beside the others: the first one on an
               empty job, a backup, a second performer.

  Nothing is overwritten or deleted either way: the ended row keeps its dates
  and the holder's name. The page mounts this only for someone who may edit.
-->
<script setup lang="ts">
import { ROLES } from "#core/shared/responsibilities/config";
import { targetFromPick, type HolderPick } from "#core/shared/responsibilities/register-view";
import type { HolderView, RegisterRow } from "#core/shared/responsibilities/views";
import { registerToday } from "#core/app/composables/useResponsibilitiesResource";

const props = defineProps<{
  open: boolean;
  orgId: string;
  job: RegisterRow | null;
  mode: "hand-over" | "assign";
  /** hand-over: the holder row being ended. */
  holder: HolderView | null;
  handOver: (id: string, body: Record<string, unknown>) => Promise<boolean>;
  addHolder: (id: string, body: Record<string, unknown>) => Promise<boolean>;
}>();
const emit = defineEmits<{ "update:open": [value: boolean] }>();

const isOpen = computed({ get: () => props.open, set: (v) => emit("update:open", v) });
const handing = computed(() => props.mode === "hand-over");

const date = ref(registerToday());
const next = ref<HolderPick>({ kind: "none", value: "" });
const role = ref("owner");
const saving = ref(false);

watch(
  () => [props.open, props.mode, props.holder?.id] as const,
  ([open]) => {
    if (!open) return;
    date.value = registerToday();
    // A hand-over may leave the job empty; an assign must name someone.
    next.value = { kind: handing.value ? "none" : "member", value: "" };
    role.value = props.holder?.role ?? "owner";
  },
  { immediate: true },
);

const target = computed(() => targetFromPick(next.value));
const canSave = computed(() => !saving.value && !!date.value && (handing.value ? !!props.holder : !!target.value));

const heading = computed(() => (handing.value ? "Hand over" : "Add a holder"));
const description = computed(() => {
  const job = props.job?.title ?? "this job";
  if (handing.value) {
    return `“${job}”: ${props.holder?.name ?? "the holder"} ends the day before the date below, and the next holder starts on it. Both stay in the history.`;
  }
  return `“${job}”: another holder beside the ones it has now.`;
});

async function save() {
  if (!props.job || !canSave.value) return;
  saving.value = true;
  try {
    let ok: boolean;
    if (handing.value && props.holder) {
      ok = await props.handOver(props.job.id, {
        assignee: props.holder.id,
        effective: date.value,
        ...(target.value ? { next: { ...target.value, role: role.value } } : {}),
      });
    } else {
      ok = await props.addHolder(props.job.id, { ...target.value, role: role.value, start_date: date.value });
    }
    if (ok) isOpen.value = false;
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <AppBottomSheet v-model:open="isOpen" :title="heading" :description="description" size="md">
    <div class="grid gap-4 py-4">
      <div class="grid gap-2">
        <Label for="holder-date">{{ handing ? "The next holder starts" : "Starts" }}</Label>
        <DateInput id="holder-date" v-model="date" />
        <p v-if="handing" class="text-xs t-text-muted">The first day of the new state. {{ holder?.name }} ends the day before.</p>
      </div>

      <ResponsibilitiesHolderPicker v-model="next" :org-id="orgId" :optional="handing" id-prefix="holder-next" />

      <div v-if="next.kind !== 'none'" class="grid gap-2">
        <Label for="holder-role">Role</Label>
        <select id="holder-role" v-model="role" class="w-full p-2 border rounded">
          <option v-for="r in ROLES" :key="r.key" :value="r.key">{{ r.label }}</option>
        </select>
        <p class="text-xs t-text-muted">Owner answers for the job; performs does it; backup covers; oversight checks.</p>
      </div>
    </div>
    <template #footer>
      <Button variant="outline" @click="isOpen = false">Cancel</Button>
      <Button :disabled="!canSave" @click="save">
        {{ handing ? (target ? "Hand over" : "End holder") : "Add holder" }}
      </Button>
    </template>
  </AppBottomSheet>
</template>
