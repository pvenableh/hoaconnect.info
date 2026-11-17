<!--
  RestrictionsPauseForm — pause a member's posting in this community
  (docs/spec-member-restrictions.md). A sheet on phones, a dialog on desktop.

  The admin picks the day posting resumes (default 30 days on) or "until
  lifted", writes the note the member will see, and optionally a note only
  admins read. The route checks who can be paused; the parent mounts this only
  when the read said they can.
-->
<script setup lang="ts">
import { DEFAULT_RESTRICTION_DAYS, INTERNAL_NOTE_MAX, MEMBER_NOTE_MAX } from "#core/shared/members/restrictions";

const props = defineProps<{ open: boolean; name: string; save: (body: { endsOn: string | null; memberNote: string; internalNote: string | null }) => Promise<boolean> }>();
const emit = defineEmits<{ "update:open": [value: boolean] }>();

const isOpen = computed({ get: () => props.open, set: (v) => emit("update:open", v) });
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const inDays = (n: number) => ymd(new Date(Date.now() + n * 86_400_000));
const form = reactive({ endsOn: inDays(DEFAULT_RESTRICTION_DAYS), untilLifted: false, memberNote: "", internalNote: "" });
const saving = ref(false);

watch(
  () => props.open,
  (open) => {
    if (open) Object.assign(form, { endsOn: inDays(DEFAULT_RESTRICTION_DAYS), untilLifted: false, memberNote: "", internalNote: "" });
  },
);

const tomorrow = computed(() => inDays(1));
const badDate = computed(() => !form.untilLifted && (!form.endsOn || form.endsOn < tomorrow.value));
const canSave = computed(() => !saving.value && !badDate.value && !!form.memberNote.trim());

async function submit() {
  if (!canSave.value) return;
  saving.value = true;
  try {
    const ok = await props.save({
      endsOn: form.untilLifted ? null : form.endsOn,
      memberNote: form.memberNote.trim(),
      internalNote: form.internalNote.trim() || null,
    });
    if (ok) isOpen.value = false;
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <AppBottomSheet
    v-model:open="isOpen"
    :title="`Pause ${name}'s posting`"
    description="They keep reading, paying dues, their household and requests to the board. Their chat messages, comments, reactions and reports stop until it ends."
    size="md"
  >
    <div class="grid gap-4 py-4">
      <p class="text-sm t-text-muted">Check your governing documents before pausing a member's posting.</p>

      <div class="grid gap-2">
        <Label for="pause-ends-on">Posting resumes on</Label>
        <DateInput id="pause-ends-on" v-model="form.endsOn" :disabled="form.untilLifted" :min="tomorrow" />
        <div class="flex items-center gap-2">
          <Switch id="pause-until-lifted" v-model="form.untilLifted" />
          <Label for="pause-until-lifted" class="text-sm font-normal">Until an admin lifts it</Label>
        </div>
        <p v-if="badDate" class="text-xs text-destructive">Pick a day after today.</p>
      </div>

      <div class="grid gap-2">
        <Label for="pause-member-note">Note to {{ name }}</Label>
        <Textarea id="pause-member-note" v-model="form.memberNote" rows="3" :maxlength="MEMBER_NOTE_MAX" placeholder="Shown to them on every page while their posting is paused" />
      </div>

      <div class="grid gap-2">
        <Label for="pause-internal-note">Note for admins (optional)</Label>
        <Textarea id="pause-internal-note" v-model="form.internalNote" rows="2" :maxlength="INTERNAL_NOTE_MAX" placeholder="Never shown to them, and kept out of the ledger" />
      </div>
    </div>
    <template #footer>
      <Button variant="outline" @click="isOpen = false">Cancel</Button>
      <Button :disabled="!canSave" @click="submit">Pause posting</Button>
    </template>
  </AppBottomSheet>
</template>
