<!--
  MembersBoardTermSheets — the three actions a board term has (plan §3.4,
  "History: end, don't erase"), each one form in AppBottomSheet:

    End term        the last day served and why. The name stays on the term.
    Change office   ends this term the day before and opens one for the same
                    person from the date, in the new office.
    Correct         fix a typo in place. The only in-place edit, and never the
                    person: a different person is a different term.

  Each goes through its route under /api/org/board-terms/[id], which checks the
  community and writes the activity row. The route's refusal is shown as it
  comes (a term that has already ended, a date before the term began).
  Add and Delete stay on the Members page.
-->
<script setup lang="ts">
import { toast } from "vue-sonner";
import { END_REASONS, OFFICES, endReasonLabel, officeLabel } from "#core/shared/responsibilities/config";

export interface BoardTermForSheet {
  id: string;
  title: string | null;
  term_start: string | null;
  term_end: string | null;
  message: string | null;
  status: string | null;
  end_reason?: string | null;
  holder_name?: string | null;
  hoa_member?: { id: string; first_name?: string | null; last_name?: string | null } | null;
}

export type BoardTermAction = "end" | "change-office" | "correct";

const props = defineProps<{
  orgId: string;
  term: BoardTermForSheet | null;
  action: BoardTermAction | null;
}>();

const emit = defineEmits<{ "update:action": [value: BoardTermAction | null]; saved: [] }>();

const day = (v: string | null | undefined) => (v ? String(v).slice(0, 10) : "");
/** Today in the viewer's zone, as the date a picker shows. */
const today = () => new Date().toLocaleDateString("en-CA");

const person = computed(() => {
  const m = props.term?.hoa_member;
  const live = [m?.first_name, m?.last_name].filter(Boolean).join(" ");
  return live || props.term?.holder_name || "Former member";
});

const open = computed({
  get: () => props.action !== null && props.term !== null,
  set: (v: boolean) => {
    if (!v) emit("update:action", null);
  },
});

const saving = ref(false);
const form = reactive({
  lastDay: "",
  reason: "term_ended" as string,
  effective: "",
  office: "director" as string,
  title: "director" as string,
  term_start: "",
  term_end: "",
  end_reason: "" as string,
  message: "",
  status: "published" as string,
});

// Fill the form each time a sheet opens, from the term it is for.
watch(
  () => [props.action, props.term?.id] as const,
  ([action]) => {
    const t = props.term;
    if (!action || !t) return;
    form.lastDay = today();
    form.reason = "term_ended";
    form.effective = today();
    form.office = OFFICES.find((o) => o.key !== t.title)?.key ?? "director";
    form.title = t.title || "director";
    form.term_start = day(t.term_start);
    form.term_end = day(t.term_end);
    form.end_reason = t.end_reason || "";
    form.message = t.message || "";
    form.status = t.status || "published";
  },
  { immediate: true },
);

const heading = computed(() => {
  if (props.action === "end") return `End ${person.value}'s term`;
  if (props.action === "change-office") return `Change ${person.value}'s office`;
  return `Correct ${person.value}'s term`;
});

const description = computed(() => {
  const office = officeLabel(props.term?.title);
  if (props.action === "end") {
    return `${person.value}, ${office}. The term stays in the history, and their name stays on it.`;
  }
  if (props.action === "change-office") {
    return `${person.value} is ${office} now. This ends that term the day before and opens a new one from the date you pick.`;
  }
  return "For fixing a typo in place. To record a change of person or office, end the term or change the office instead.";
});

const canSave = computed(() => {
  if (saving.value) return false;
  if (props.action === "end") return !!form.lastDay && !!form.reason;
  if (props.action === "change-office") return !!form.effective && !!form.office;
  return !!form.title;
});

const messageOf = (e: any, fallback: string) => e?.data?.message || e?.statusMessage || e?.message || fallback;

async function save() {
  const t = props.term;
  if (!t || !props.action || !canSave.value) return;
  saving.value = true;
  try {
    if (props.action === "end") {
      await $fetch(`/api/org/board-terms/${t.id}/end`, {
        method: "POST",
        body: { orgId: props.orgId, lastDay: form.lastDay, reason: form.reason },
      });
      toast.success(`${person.value}'s term ended`);
    } else if (props.action === "change-office") {
      await $fetch(`/api/org/board-terms/${t.id}/change-office`, {
        method: "POST",
        body: { orgId: props.orgId, effective: form.effective, office: form.office },
      });
      toast.success(`${person.value} is now ${officeLabel(form.office)}`);
    } else {
      await $fetch(`/api/org/board-terms/${t.id}`, {
        method: "PATCH",
        body: {
          orgId: props.orgId,
          title: form.title,
          term_start: form.term_start || null,
          term_end: form.term_end || null,
          end_reason: form.end_reason || null,
          message: form.message || null,
          status: form.status,
        },
      });
      toast.success("Term corrected");
    }
    emit("saved");
    emit("update:action", null);
  } catch (e) {
    toast.error(messageOf(e, "Couldn't save that change"));
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <AppBottomSheet v-model:open="open" :title="heading" :description="description" size="md">
    <div class="grid gap-4 py-4">
      <template v-if="action === 'end'">
        <div class="grid gap-2">
          <Label for="end-last-day">Last day served</Label>
          <DateInput id="end-last-day" v-model="form.lastDay" />
        </div>
        <div class="grid gap-2">
          <Label for="end-reason">Why it ended</Label>
          <select id="end-reason" v-model="form.reason" class="w-full p-2 border rounded">
            <option v-for="r in END_REASONS.filter((x) => x.key !== 'changed_office')" :key="r.key" :value="r.key">
              {{ r.label }}
            </option>
          </select>
        </div>
      </template>

      <template v-else-if="action === 'change-office'">
        <div class="grid gap-2">
          <Label for="change-effective">New office starts</Label>
          <DateInput id="change-effective" v-model="form.effective" />
          <p class="text-xs t-text-muted">The first day in the new office.</p>
        </div>
        <div class="grid gap-2">
          <Label for="change-office">New office</Label>
          <select id="change-office" v-model="form.office" class="w-full p-2 border rounded">
            <option v-for="o in OFFICES.filter((x) => x.key !== term?.title)" :key="o.key" :value="o.key">
              {{ o.label }}
            </option>
          </select>
        </div>
      </template>

      <template v-else-if="action === 'correct'">
        <div class="grid gap-2">
          <Label for="correct-title">Position</Label>
          <select id="correct-title" v-model="form.title" class="w-full p-2 border rounded">
            <option v-for="o in OFFICES" :key="o.key" :value="o.key">{{ o.label }}</option>
          </select>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div class="grid gap-2">
            <Label for="correct-start">Term start</Label>
            <DateInput id="correct-start" v-model="form.term_start" />
          </div>
          <div class="grid gap-2">
            <Label for="correct-end">Term end</Label>
            <DateInput id="correct-end" v-model="form.term_end" />
            <p class="text-xs t-text-muted">Leave empty for ongoing</p>
          </div>
        </div>
        <div class="grid gap-2">
          <Label for="correct-reason">Why it ended</Label>
          <select id="correct-reason" v-model="form.end_reason" class="w-full p-2 border rounded">
            <option value="">Not recorded</option>
            <option v-for="r in END_REASONS" :key="r.key" :value="r.key">{{ r.label }}</option>
          </select>
          <p v-if="form.end_reason" class="text-xs t-text-muted">
            Recorded as “{{ endReasonLabel(form.end_reason) }}”. Clear it only for a term that has not ended.
          </p>
        </div>
        <div class="grid gap-2">
          <Label for="correct-message">Bio/Message (optional)</Label>
          <AppTextarea id="correct-message" v-model="form.message" rows="3" placeholder="Brief bio or message from this board member..." />
        </div>
        <div class="grid gap-2">
          <Label for="correct-status">Status</Label>
          <select id="correct-status" v-model="form.status" class="w-full p-2 border rounded">
            <option value="published">Published (Active)</option>
            <option value="draft">Draft (Hidden)</option>
            <option value="archived">Archived</option>
          </select>
        </div>
      </template>
    </div>
    <template #footer>
      <AppButton variant="outline" @click="open = false">Cancel</AppButton>
      <AppButton :disabled="!canSave" @click="save">
        {{ action === "end" ? "End term" : action === "change-office" ? "Change office" : "Save correction" }}
      </AppButton>
    </template>
  </AppBottomSheet>
</template>
