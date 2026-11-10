<script setup lang="ts">
// Refund one HOA Connect charge, in full or in part (plan §5, Phase 2). Above
// $500 the amount has to be typed out again; the server checks that too.
import { needsTypedAmount, parseDollars, refundProblem } from "#core/shared/ops/actions";
import { money } from "#core/shared/ops/format";

const props = defineProps<{
  charge: { id: string; amount: number; amountRefunded: number; currency: string; last4?: string | null } | null;
  /** Who it's refunded to, for the confirmation. */
  payer?: string | null;
}>();
const open = defineModel<boolean>("open", { default: false });
const emit = defineEmits<{ (e: "done", res: any): void }>();

const amount = ref("");
const typed = ref("");
const remaining = computed(() => (props.charge ? props.charge.amount - (props.charge.amountRefunded ?? 0) : 0));
const cents = computed(() => parseDollars(amount.value) ?? 0);
const mustType = computed(() => needsTypedAmount(cents.value));
const currency = computed(() => props.charge?.currency ?? "usd");

watch(open, (v) => {
  if (!v) return;
  amount.value = (remaining.value / 100).toFixed(2);
  typed.value = "";
});
</script>

<template>
  <OpsActionDialog
    v-model:open="open"
    :title="charge && remaining < charge.amount ? 'Refund the rest of a charge' : 'Refund a charge'"
    :description="charge ? `${money(charge.amount, currency)} charge${charge.amountRefunded ? `, ${money(charge.amountRefunded, currency)} already refunded` : ''}. Up to ${money(remaining, currency)} can go back.` : undefined"
    :endpoint="`/api/ops/charges/${charge?.id}/refund`"
    submit-label="Refund"
    destructive
    :body="() => ({ amountCents: cents, ...(mustType ? { typedAmount: typed } : {}) })"
    :problem="() => refundProblem({ amountCents: cents, remainingCents: remaining, typedAmount: typed })"
    :confirmation="() => ({
      title: `Refund ${money(cents, currency)}${payer ? ` to ${payer}` : ''}?`,
      body: `Stripe sends it back to ${charge?.last4 ? `the card ending ${charge.last4}` : 'the original payment method'}. A refund can't be undone.`,
    })"
    :done-message="(res) => `Refunded ${money(res.result?.amountCents ?? cents, currency)}.`"
    @done="(res) => emit('done', res)"
  >
    <div class="space-y-1.5">
      <Label for="ops-refund-amount">Amount (USD)</Label>
      <Input id="ops-refund-amount" v-model="amount" inputmode="decimal" autocomplete="off" />
      <p class="type-micro t-text-muted">Leave it at {{ money(remaining, currency) }} for a full refund.</p>
    </div>
    <div v-if="mustType" class="space-y-1.5">
      <Label for="ops-refund-typed">Type {{ money(cents, currency) }} to confirm</Label>
      <Input id="ops-refund-typed" v-model="typed" inputmode="decimal" autocomplete="off" />
      <p class="type-micro text-warning">Refunds over $500 need the amount typed out.</p>
    </div>
  </OpsActionDialog>
</template>
