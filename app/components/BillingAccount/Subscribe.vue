<script setup lang="ts">
// Agency billing — initial subscribe flow (docs/plan-agency-multi-property-billing.md
// §7). Creates the ONE subscription for the account (quantity = active property
// count) and confirms the SetupIntent (trial) / PaymentIntent (no trial) inline
// with a Stripe Payment Element — mirrors Payment/SubscriptionForm.vue, but
// targets /api/stripe/billing-account/subscribe.
import { loadStripe } from "@stripe/stripe-js";
import type { Stripe, StripeElements } from "@stripe/stripe-js";

const props = defineProps<{
  accountId: string;
  priceId: string;
  billingCycle: "monthly" | "yearly";
  email: string;
  name?: string;
  trialDays?: number;
}>();

const emit = defineEmits<{ success: []; error: [error: Error] }>();

const config = useRuntimeConfig();

const isElementLoading = ref(true);
const isElementReady = ref(false);
const isSubmitting = ref(false);
const error = ref<string | null>(null);
const subData = ref<{
  clientSecret: string;
  type: "setup_intent" | "payment_intent";
  seats: number;
} | null>(null);

let stripe: Stripe | null = null;
let elements: StripeElements | null = null;

const submitLabel = computed(() => {
  if (isSubmitting.value) return "Processing…";
  return props.trialDays && props.trialDays > 0
    ? `Start ${props.trialDays}-day trial`
    : "Subscribe";
});

const fail = (message: string, err?: any) => {
  console.error("[BillingAccount/Subscribe]", err || message);
  error.value = message;
  isSubmitting.value = false;
  emit("error", err instanceof Error ? err : new Error(message));
};

const handleSubmit = async () => {
  if (!stripe || !elements || !subData.value || isSubmitting.value) return;
  error.value = null;
  isSubmitting.value = true;
  try {
    const returnUrl = `${window.location.origin}/billing/${props.accountId}`;
    if (subData.value.type === "setup_intent") {
      const { error: e, setupIntent } = await stripe.confirmSetup({
        elements,
        confirmParams: { return_url: returnUrl },
        redirect: "if_required",
      });
      if (e) throw e;
      if (setupIntent && setupIntent.status === "succeeded") return emit("success");
    } else {
      const { error: e, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: { return_url: returnUrl },
        redirect: "if_required",
      });
      if (e) throw e;
      if (paymentIntent && ["succeeded", "processing"].includes(paymentIntent.status)) {
        return emit("success");
      }
    }
  } catch (err: any) {
    fail(err?.message || "Payment failed", err);
  } finally {
    isSubmitting.value = false;
  }
};

onMounted(async () => {
  try {
    const publicKey = config.public.stripePublicKey;
    if (!publicKey) throw new Error("Stripe public key not configured");
    stripe = await loadStripe(publicKey);
    if (!stripe) throw new Error("Failed to load Stripe");

    const res = await $fetch<{
      clientSecret: string;
      type: "setup_intent" | "payment_intent";
      seats: number;
    }>("/api/stripe/billing-account/subscribe", {
      method: "POST",
      body: {
        accountId: props.accountId,
        priceId: props.priceId,
        billingCycle: props.billingCycle,
        trialDays: props.trialDays,
      },
    });
    if (!res.clientSecret) throw new Error("No client secret returned");
    subData.value = res;

    elements = stripe.elements({
      clientSecret: res.clientSecret,
      appearance: { variables: { borderRadius: "8px" } },
    });
    const paymentElement = elements.create("payment", {
      defaultValues: { billingDetails: { email: props.email, name: props.name } },
    });
    paymentElement.on("ready", () => {
      isElementReady.value = true;
      isElementLoading.value = false;
    });
    paymentElement.on("change", (ev: any) => {
      error.value = ev.error ? ev.error.message : null;
    });
    paymentElement.mount("#billing-account-payment-element");
  } catch (err: any) {
    isElementLoading.value = false;
    fail(err?.data?.message || err?.message || "Payment setup failed", err);
  }
});

onBeforeUnmount(() => {
  elements?.getElement("payment")?.destroy();
});
</script>

<template>
  <form class="space-y-4" @submit.prevent="handleSubmit">
    <p v-if="subData" class="text-sm t-text-secondary">
      Billing for <strong>{{ subData.seats }}</strong>
      {{ subData.seats === 1 ? "property" : "properties" }} ({{ billingCycle }}).
    </p>

    <div
      v-if="error"
      class="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700"
    >
      {{ error }}
    </div>

    <div v-if="isElementLoading" class="flex items-center gap-2 py-8 text-sm t-text-muted">
      <span class="spinner-ios" />
      Loading payment form…
    </div>

    <div v-show="!isElementLoading">
      <div id="billing-account-payment-element" class="mb-4 min-h-[100px]" />
      <!-- The shared Button rather than a hand-rolled one: its `default`
           variant is bg-primary, which IS the theme accent, so it follows the
           org's colour and both modes. The hand-rolled version was a fixed
           near-black that stayed near-black on a dark background. -->
      <Button
        type="submit"
        class="w-full"
        :disabled="!isElementReady || isSubmitting"
      >
        {{ submitLabel }}
      </Button>
    </div>
  </form>
</template>
