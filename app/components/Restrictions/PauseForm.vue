<!--
  RestrictionsPauseForm — pause a member's posting in this community
  (docs/spec-member-restrictions.md). Inline, inside the member's sheet: the
  sheet is already the overlay, and a sheet opened from a sheet closed itself
  under the first click (seen 2026-11-17).

  The admin picks the day posting resumes (default 30 days on) or "until
  lifted", writes the note the member will see, and optionally a note only
  admins read. The route checks who can be paused; the parent mounts this only
  when the read said they can.
-->
<script setup lang="ts">
import { DEFAULT_RESTRICTION_DAYS, INTERNAL_NOTE_MAX, MEMBER_NOTE_MAX } from "#core/shared/members/restrictions";

const props = defineProps<{ name: string; save: (body: { endsOn: string | null; memberNote: string; internalNote: string | null }) => Promise<boolean> }>();
const emit = defineEmits<{ cancel: [] }>();

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const inDays = (n: number) => ymd(new Date(Date.now() + n * 86_400_000));
const form = reactive({ endsOn: inDays(DEFAULT_RESTRICTION_DAYS), untilLifted: false, memberNote: "", internalNote: "" });
const saving = ref(false);

const tomorrow = computed(() => inDays(1));
const badDate = computed(() => !form.untilLifted && (!form.endsOn || form.endsOn < tomorrow.value));
const canSave = computed(() => !saving.value && !badDate.value && !!form.memberNote.trim());

async function submit() {
  if (!canSave.value) return;
  saving.value = true;
  try {
    await props.save({
      endsOn: form.untilLifted ? null : form.endsOn,
      memberNote: form.memberNote.trim(),
      internalNote: form.internalNote.trim() || null,
    });
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <!-- A div, not a form: it sits inside the member sheet, which may be a form itself. -->
  <div class="grid gap-4" data-pause-form>
    <div class="grid gap-1">
      <p class="text-sm font-medium t-text">Pause {{ name }}'s posting</p>
      <p class="text-sm t-text-muted">
        They keep reading, paying dues, their household and requests to the board. Their chat messages, comments,
        reactions and reports stop until it ends. Check your governing documents before pausing a member's posting.
      </p>
    </div>

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
      <AppTextarea id="pause-member-note" v-model="form.memberNote" rows="3" :maxlength="MEMBER_NOTE_MAX" placeholder="Shown to them on every page while their posting is paused" />
    </div>

    <div class="grid gap-2">
      <Label for="pause-internal-note">Note for admins (optional)</Label>
      <AppTextarea id="pause-internal-note" v-model="form.internalNote" rows="2" :maxlength="INTERNAL_NOTE_MAX" placeholder="Never shown to them, and kept out of the ledger" />
    </div>

    <div class="flex justify-end gap-2">
      <AppButton type="button" variant="outline" size="sm" @click="emit('cancel')">Cancel</AppButton>
      <AppButton type="button" size="sm" :disabled="!canSave" @click="submit">Pause posting</AppButton>
    </div>
  </div>
</template>
