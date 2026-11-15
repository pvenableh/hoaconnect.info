<!--
  PaymentChargeForm — the one form for a charge (plan §2.3: one form component
  per resource, in AppBottomSheet). A one-off charge or, with Recurring on, a
  schedule that bills on its own. Admin-only: the page mounts it only for
  `canWrite`, and Directus refuses the write to anyone else.

  Edit is not offered for charges yet; when it is, it opens this form filled in.
-->
<script setup lang="ts">
import type { PaymentRequest, PaymentSchedule, HoaMember } from "#core/types/directus";
import { toast } from "vue-sonner";

const props = defineProps<{
  orgId: string | null;
  members: HoaMember[];
}>();

const emit = defineEmits<{ saved: [kind: "charge" | "schedule"]; cancel: [] }>();

const { create: createRequest } = useDirectusItems<PaymentRequest>("payment_requests");
const { create: createSchedule } = useDirectusItems<PaymentSchedule>("payment_schedules");

const recurring = ref(false);
const saving = ref(false);
const blank = () => ({
  memberId: "",
  request_type: "monthly_dues" as PaymentRequest["request_type"],
  title: "",
  amount: null as number | null,
  due_date: "",
  description: "",
  frequency: "monthly" as PaymentSchedule["frequency"],
  start_date: "",
});
const form = ref(blank());

const reset = () => {
  form.value = blank();
  recurring.value = false;
};

const canSave = computed(
  () =>
    !!form.value.memberId &&
    !!form.value.title.trim() &&
    (form.value.amount || 0) > 0 &&
    (!recurring.value || !!form.value.start_date),
);

const save = async () => {
  if (!canSave.value || !props.orgId) return;
  saving.value = true;
  try {
    if (recurring.value) {
      await createSchedule({
        organization: props.orgId,
        member: form.value.memberId,
        title: form.value.title.trim(),
        amount: form.value.amount,
        frequency: form.value.frequency,
        start_date: form.value.start_date,
        next_payment_date: form.value.start_date,
        status: "active",
      } as Partial<PaymentSchedule>);
      toast.success("Recurring charge created");
      emit("saved", "schedule");
    } else {
      await createRequest({
        organization: props.orgId,
        member: form.value.memberId,
        request_type: form.value.request_type,
        title: form.value.title.trim(),
        amount: form.value.amount,
        amount_paid: 0,
        amount_remaining: form.value.amount,
        due_date: form.value.due_date || null,
        description: form.value.description || null,
        status: "active",
      } as Partial<PaymentRequest>);
      toast.success("Charge created");
      emit("saved", "charge");
    }
    reset();
  } catch (e: any) {
    console.error("Failed to create charge:", e);
    toast.error(e?.message || "Failed to create charge");
  } finally {
    saving.value = false;
  }
};

const cancel = () => {
  reset();
  emit("cancel");
};

const memberName = (m: HoaMember) =>
  [m.first_name, m.last_name].filter(Boolean).join(" ") || m.email || "—";
</script>

<template>
  <div class="space-y-4">
    <label class="flex items-center justify-end gap-2 text-sm t-text-muted">
      Recurring
      <Switch v-model="recurring" />
    </label>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div class="space-y-1.5">
        <Label>Member</Label>
        <select v-model="form.memberId" class="w-full px-3 py-2 border rounded-md bg-background">
          <option value="" disabled>Select a member…</option>
          <option v-for="m in members" :key="m.id" :value="m.id">{{ memberName(m) }}</option>
        </select>
      </div>

      <div class="space-y-1.5">
        <Label>{{ recurring ? "Description" : "Type" }}</Label>
        <select v-if="!recurring" v-model="form.request_type" class="w-full px-3 py-2 border rounded-md bg-background">
          <option value="monthly_dues">Monthly Dues</option>
          <option value="assessment">Assessment</option>
          <option value="late_fee">Late Fee</option>
          <option value="other">Other</option>
        </select>
        <select v-else v-model="form.frequency" class="w-full px-3 py-2 border rounded-md bg-background">
          <option value="monthly">Monthly</option>
          <option value="quarterly">Quarterly</option>
          <option value="annually">Annually</option>
        </select>
      </div>

      <div class="space-y-1.5 md:col-span-2">
        <Label>Title</Label>
        <Input v-model="form.title" placeholder="e.g. October Dues" />
      </div>

      <div class="space-y-1.5">
        <Label>Amount</Label>
        <div class="relative">
          <span class="absolute left-3 top-1/2 -translate-y-1/2 t-text-muted">$</span>
          <Input v-model.number="form.amount" type="number" min="0" step="0.01" placeholder="0.00" class="pl-7" />
        </div>
      </div>

      <div class="space-y-1.5">
        <Label>{{ recurring ? "Start date" : "Due date" }}</Label>
        <DateInput v-if="recurring" v-model="form.start_date" />
        <DateInput v-else v-model="form.due_date" />
      </div>

      <div v-if="!recurring" class="space-y-1.5 md:col-span-2">
        <Label>Description (optional)</Label>
        <Input v-model="form.description" placeholder="Add a note for the member…" />
      </div>
    </div>

    <div class="flex justify-end gap-2">
      <Button variant="outline" class="rounded-full" @click="cancel">Cancel</Button>
      <Button class="rounded-full" :disabled="!canSave || saving" @click="save">
        <Icon v-if="saving" name="lucide:loader-2" class="w-4 h-4 mr-1.5 animate-spin" />
        {{ recurring ? "Create recurring charge" : "Create charge" }}
      </Button>
    </div>
  </div>
</template>
