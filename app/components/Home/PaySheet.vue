<script setup lang="ts">
/**
 * HomePaySheet — pay one charge from the home without leaving it
 * (docs/plan-unified-experience.md §5, owner "Pay sheet"). The same
 * `PaymentMethods` the payments page opens in its dialog, in a bottom sheet.
 * Stripe confirms by webhook, so `paid` asks the home to read again shortly.
 */
import type { PaymentRequest } from "#core/types/directus";

const props = defineProps<{ chargeId: string | null }>();
const emit = defineEmits<{ close: []; paid: [] }>();

const { user } = useDirectusAuth();
const { get } = useDirectusItems<PaymentRequest>("payment_requests");
const charge = ref<PaymentRequest | null>(null);
const failed = ref(false);

watch(
  () => props.chargeId,
  async (id) => {
    charge.value = null;
    failed.value = false;
    if (!id) return;
    try {
      charge.value = (await get(id, {
        fields: ["id", "title", "amount", "amount_remaining", "organization", "member", "status"],
      })) as PaymentRequest;
    } catch {
      failed.value = true;
    }
  },
  { immediate: true },
);

const amount = computed(() => charge.value?.amount_remaining ?? charge.value?.amount ?? 0);
const money = (v: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v || 0);
const onPaid = () => {
  emit("paid");
  emit("close");
};
</script>

<template>
  <AppBottomSheet
    :open="!!chargeId"
    :title="charge?.title ?? 'Pay'"
    :description="charge ? `${money(amount)} due` : undefined"
    @update:open="(v: boolean) => !v && emit('close')"
  >
    <div data-testid="home-pay-sheet">
      <p v-if="failed" class="text-sm t-text-muted">That charge could not be loaded. Try the Payments page.</p>
      <div v-else-if="!charge" class="flex justify-center py-8"><div class="spinner-ios" /></div>
      <PaymentMethods
        v-else
        :email="user?.email || ''"
        :amount="amount"
        :metadata="{
          organizationId: charge.organization,
          memberId: charge.member,
          paymentRequestId: charge.id,
          description: charge.title,
          routeDuesToConnect: true,
        }"
        return-url="/payments?payment_success=true"
        @success="onPaid"
      />
    </div>
  </AppBottomSheet>
</template>
