<template>
  <div class="space-y-6">
    <!-- Monthly Dues -->
    <Card>
      <CardHeader>
        <CardTitle>Monthly Dues</CardTitle>
        <CardDescription>
          Configure default monthly dues for your HOA members
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form @submit.prevent="saveChanges" class="space-y-4">
          <!-- Default Monthly Dues -->
          <div class="space-y-2">
            <Label for="monthlyDues">Default Monthly Dues Amount</Label>
            <div class="relative">
              <span class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                $
              </span>
              <Input
                id="monthlyDues"
                v-model.number="form.defaultMonthlyDues"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                class="pl-7"
                :disabled="isSaving"
              />
            </div>
            <p class="text-xs text-muted-foreground">
              This amount will be used as the default when creating payment requests
            </p>
          </div>

          <!-- Payment Instructions -->
          <div class="space-y-2">
            <Label for="paymentInstructions">Payment Instructions</Label>
            <textarea
              id="paymentInstructions"
              v-model="form.paymentInstructions"
              rows="3"
              class="w-full px-3 py-2 border rounded-md bg-background resize-none"
              placeholder="Add any special instructions for members when making payments..."
              :disabled="isSaving"
            />
            <p class="text-xs text-muted-foreground">
              These instructions will be shown to members on payment pages
            </p>
          </div>
        </form>
      </CardContent>
    </Card>

    <!-- Late Fees -->
    <Card>
      <CardHeader>
        <CardTitle>Late Fee Settings</CardTitle>
        <CardDescription>
          Configure late payment penalties
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div class="space-y-4">
          <!-- Enable Late Fees -->
          <div class="flex items-center justify-between">
            <div class="space-y-0.5">
              <Label>Enable Late Fees</Label>
              <p class="text-sm text-muted-foreground">
                Automatically apply late fees to overdue payments
              </p>
            </div>
            <Switch v-model="form.lateFeeEnabled" :disabled="isSaving" />
          </div>

          <!-- Late Fee Amount -->
          <div v-if="form.lateFeeEnabled" class="space-y-4 pt-4 border-t">
            <div class="space-y-2">
              <Label for="lateFeeAmount">Late Fee Amount</Label>
              <div class="relative">
                <span class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  $
                </span>
                <Input
                  id="lateFeeAmount"
                  v-model.number="form.lateFeeAmount"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  class="pl-7"
                  :disabled="isSaving"
                />
              </div>
            </div>

            <!-- Grace Period -->
            <div class="space-y-2">
              <Label for="gracePeriod">Grace Period (Days)</Label>
              <Input
                id="gracePeriod"
                v-model.number="form.gracePeriodDays"
                type="number"
                min="0"
                max="90"
                placeholder="15"
                :disabled="isSaving"
              />
              <p class="text-xs text-muted-foreground">
                Number of days after due date before late fees are applied
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>

    <!-- Payment Summary Preview -->
    <Card>
      <CardHeader>
        <CardTitle>Payment Preview</CardTitle>
        <CardDescription>
          How a typical payment request would look with these settings
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div class="p-4 rounded-lg border bg-muted/30">
          <div class="space-y-3">
            <div class="flex justify-between">
              <span>Monthly Dues</span>
              <span class="font-medium">${{ (form.defaultMonthlyDues || 0).toFixed(2) }}</span>
            </div>
            <div v-if="form.lateFeeEnabled" class="flex justify-between text-destructive">
              <span>Late Fee (after {{ form.gracePeriodDays }} days)</span>
              <span class="font-medium">${{ (form.lateFeeAmount || 0).toFixed(2) }}</span>
            </div>
            <div class="pt-3 border-t flex justify-between font-bold">
              <span>Maximum Total</span>
              <span>${{ maxTotal.toFixed(2) }}</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>

    <!-- Save Button -->
    <div class="flex justify-end">
      <Button @click="saveChanges" :disabled="isSaving || !hasChanges">
        <Icon
          v-if="isSaving"
          name="lucide:loader-2"
          class="mr-2 h-4 w-4 animate-spin"
        />
        {{ isSaving ? "Saving..." : "Save Payment Settings" }}
      </Button>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { HoaOrganization } from "~~/types/directus";
import { toast } from "vue-sonner";

const props = defineProps<{
  organization: HoaOrganization;
}>();

const emit = defineEmits<{
  updated: [organization: HoaOrganization];
}>();

const { update: updateOrganization } = useDirectusItems<HoaOrganization>("hoa_organizations");

const isSaving = ref(false);

// Form data
const form = ref({
  defaultMonthlyDues: props.organization.default_monthly_dues || 0,
  paymentInstructions: props.organization.payment_instructions || "",
  lateFeeEnabled: props.organization.late_fee_enabled || false,
  lateFeeAmount: props.organization.late_fee_amount || 0,
  gracePeriodDays: props.organization.payment_grace_period_days || 15,
});

// Calculate max total
const maxTotal = computed(() => {
  let total = form.value.defaultMonthlyDues || 0;
  if (form.value.lateFeeEnabled) {
    total += form.value.lateFeeAmount || 0;
  }
  return total;
});

// Check if form has changes
const hasChanges = computed(() => {
  return (
    form.value.defaultMonthlyDues !== (props.organization.default_monthly_dues || 0) ||
    form.value.paymentInstructions !== (props.organization.payment_instructions || "") ||
    form.value.lateFeeEnabled !== (props.organization.late_fee_enabled || false) ||
    form.value.lateFeeAmount !== (props.organization.late_fee_amount || 0) ||
    form.value.gracePeriodDays !== (props.organization.payment_grace_period_days || 15)
  );
});

// Watch for prop changes
watch(
  () => props.organization,
  (newOrg) => {
    form.value = {
      defaultMonthlyDues: newOrg.default_monthly_dues || 0,
      paymentInstructions: newOrg.payment_instructions || "",
      lateFeeEnabled: newOrg.late_fee_enabled || false,
      lateFeeAmount: newOrg.late_fee_amount || 0,
      gracePeriodDays: newOrg.payment_grace_period_days || 15,
    };
  },
  { deep: true }
);

// Save changes
const saveChanges = async () => {
  if (!hasChanges.value) return;

  isSaving.value = true;

  try {
    const updated = await updateOrganization(props.organization.id, {
      default_monthly_dues: form.value.defaultMonthlyDues,
      payment_instructions: form.value.paymentInstructions,
      late_fee_enabled: form.value.lateFeeEnabled,
      late_fee_amount: form.value.lateFeeAmount,
      payment_grace_period_days: form.value.gracePeriodDays,
    });

    emit("updated", { ...props.organization, ...updated });
  } catch (error: any) {
    console.error("Failed to save payment settings:", error);
    toast.error(error.message || "Failed to save payment settings");
  } finally {
    isSaving.value = false;
  }
};
</script>
