<!--
  ExpensesPaySheet — record that an expense's money went out: the date and the
  check number or transfer reference (POST /api/org/expenses/[id]/pay,
  docs/spec-money-approvals.md). Before approval the sheet says what happens:
  the expense is flagged for good and every board seat is told.
-->
<script setup lang="ts">
import { toast } from "vue-sonner";
import type { ExpenseRow } from "#core/app/composables/useExpenses";

const props = defineProps<{ orgId: string; expense: ExpenseRow | null }>();
const emit = defineEmits<{ "update:expense": [value: ExpenseRow | null]; saved: [] }>();

const { pay } = useExpenses();

const open = computed({
  get: () => props.expense !== null,
  set: (v: boolean) => {
    if (!v) emit("update:expense", null);
  },
});

/** Today in the viewer's zone, as the date a picker shows. */
const today = () => new Date().toLocaleDateString("en-CA");
const form = reactive({ paidDate: "", reference: "" });
const saving = ref(false);

watch(
  () => props.expense?.id,
  (id) => {
    if (!id) return;
    form.paidDate = props.expense?.paid_date ? String(props.expense.paid_date).slice(0, 10) : today();
    form.reference = props.expense?.paid_reference ?? "";
  },
  { immediate: true }
);

const early = computed(() => props.expense?.status !== "approved");
const canSave = computed(() => !!form.paidDate && !!form.reference.trim() && !saving.value);

const save = async () => {
  if (!props.expense || !canSave.value) return;
  saving.value = true;
  try {
    const res = await pay(props.expense.id, { paidDate: form.paidDate, reference: form.reference.trim() }, props.orgId);
    if (res.paidWithoutApproval) toast.warning("Recorded paid before approval. The board has been told.");
    else toast.success("Recorded paid");
    if (res.recordError) toast.error(res.recordError);
    emit("saved");
    open.value = false;
  } catch (e: any) {
    toast.error(e?.data?.message || e?.message || "Couldn't record the payment");
  } finally {
    saving.value = false;
  }
};
</script>

<template>
  <AppBottomSheet v-model:open="open" title="Record paid" :description="expense?.title" size="sm">
    <div class="grid gap-4 py-4">
      <div class="grid gap-2">
        <Label for="pay-date">Paid on</Label>
        <DateInput id="pay-date" v-model="form.paidDate" />
      </div>
      <div class="grid gap-2">
        <Label for="pay-reference">Check number or transfer reference</Label>
        <AppInput id="pay-reference" v-model="form.reference" maxlength="120" placeholder="e.g. Check 1042" />
      </div>
      <p v-if="early" class="rounded-lg bg-warning/10 p-3 text-sm text-warning">
        This expense isn't approved yet. Recording it paid marks it "Paid before approval" for good, and every board
        member is told. The board still has to approve it.
      </p>
    </div>
    <template #footer>
      <Button variant="outline" @click="open = false">Cancel</Button>
      <Button :disabled="!canSave" @click="save">
        <Icon v-if="saving" name="lucide:loader-2" class="w-4 h-4 mr-1.5 animate-spin" />
        Record Paid
      </Button>
    </template>
  </AppBottomSheet>
</template>
