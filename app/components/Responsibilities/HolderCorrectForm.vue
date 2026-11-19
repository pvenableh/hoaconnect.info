<!--
  ResponsibilitiesHolderCorrectForm — fix a holder row in place: its role, its
  notes, or a wrong date (plan §3.4: correction only). Never WHO holds it: a
  different holder is a different row, which is Hand over. An open row's end is
  Hand over's too, so the end date shows only on a row that has already ended.
  The page mounts this only for someone who may edit; the route checks again.
-->
<script setup lang="ts">
import { ROLES } from "#core/shared/responsibilities/config";
import type { HolderView } from "#core/shared/responsibilities/views";

const props = defineProps<{
  open: boolean;
  holder: HolderView | null;
  correct: (assigneeId: string, body: Record<string, unknown>) => Promise<boolean>;
}>();
const emit = defineEmits<{ "update:open": [value: boolean] }>();

const isOpen = computed({ get: () => props.open, set: (v) => emit("update:open", v) });
const form = reactive({ role: "owner", start_date: "", end_date: "", notes: "" });
const saving = ref(false);
const day = (v: string | null | undefined) => (v ? String(v).slice(0, 10) : "");

watch(
  () => [props.open, props.holder?.id] as const,
  ([open]) => {
    const h = props.holder;
    if (!open || !h) return;
    Object.assign(form, { role: h.role, start_date: day(h.start_date), end_date: day(h.end_date), notes: h.notes ?? "" });
  },
  { immediate: true },
);

const ended = computed(() => !!props.holder?.end_date);
const badDates = computed(() => !!form.start_date && !!form.end_date && ended.value && form.end_date < form.start_date);

async function save() {
  const h = props.holder;
  if (!h || saving.value || badDates.value) return;
  const patch: Record<string, unknown> = {};
  if (form.role !== h.role) patch.role = form.role;
  if (form.start_date && form.start_date !== day(h.start_date)) patch.start_date = form.start_date;
  if (ended.value && form.end_date && form.end_date !== day(h.end_date)) patch.end_date = form.end_date;
  if ((form.notes.trim() || null) !== (h.notes ?? null)) patch.notes = form.notes.trim() || null;
  if (!Object.keys(patch).length) {
    isOpen.value = false;
    return;
  }
  saving.value = true;
  try {
    if (await props.correct(h.id, patch)) isOpen.value = false;
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <AppBottomSheet
    v-model:open="isOpen"
    :title="`Correct ${holder?.name ?? 'this row'}`"
    description="For a wrong date, role or note. To change who holds the job, hand it over: the history stays."
    size="md"
  >
    <div class="grid gap-4 py-4">
      <div class="grid grid-cols-2 gap-4">
        <div class="grid gap-2">
          <Label for="correct-holder-start">Started</Label>
          <DateInput id="correct-holder-start" v-model="form.start_date" />
        </div>
        <div v-if="ended" class="grid gap-2">
          <Label for="correct-holder-end">Ended</Label>
          <DateInput id="correct-holder-end" v-model="form.end_date" />
        </div>
      </div>
      <p v-if="badDates" class="text-xs text-destructive">It cannot end before it started.</p>
      <div class="grid gap-2">
        <Label for="correct-holder-role">Role</Label>
        <select id="correct-holder-role" v-model="form.role" class="w-full p-2 border rounded">
          <option v-for="r in ROLES" :key="r.key" :value="r.key">{{ r.label }}</option>
        </select>
      </div>
      <div class="grid gap-2">
        <Label for="correct-holder-notes">Note (optional)</Label>
        <AppTextarea id="correct-holder-notes" v-model="form.notes" rows="2" placeholder="Never shown to owners" />
      </div>
    </div>
    <template #footer>
      <Button variant="outline" @click="isOpen = false">Cancel</Button>
      <Button :disabled="saving || badDates" @click="save">Save correction</Button>
    </template>
  </AppBottomSheet>
</template>
