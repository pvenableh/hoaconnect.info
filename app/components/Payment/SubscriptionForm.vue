<template>
  <form id="subscription-form" @submit.prevent="handleSubmit">
    <!-- Error Alert -->
    <div
      v-if="error"
      class="mb-4 rounded-md border border-red-500 bg-red-50 p-4 dark:bg-red-900/20"
    >
      <div class="flex items-start">
        <Icon
          name="heroicons:exclamation-circle"
          class="h-5 w-5 text-red-500 mt-0.5 mr-3"
        />
        <div>
          <h3 class="text-sm font-medium text-red-800 dark:text-red-300">
            {{ error.title }}
          </h3>
          <p class="mt-1 text-sm text-red-700 dark:text-red-400">
            {{ error.message }}
          </p>
        </div>
      </div>
    </div>

    <!-- Trial Information -->
    <div
      v-if="trialDays && trialDays > 0"
      class="mb-4 rounded-md border border-blue-200 bg-blue-50 p-4 dark:bg-blue-900/20 dark:border-blue-800"
    >
      <div class="flex items-start">
        <Icon
          name="heroicons:gift"
          class="h-5 w-5 text-blue-500 mt-0.5 mr-3"
        />
        <div>
          <h3 class="text-sm font-medium text-blue-800 dark:text-blue-300">
            {{ trialDays }}-Day Free Trial
          </h3>
          <p class="mt-1 text-sm text-blue-700 dark:text-blue-400">
            Your card won't be charged until the trial ends. You can cancel anytime.
          </p>
        </div>
      </div>
    </div>

    <!-- Loading State -->
    <div
      v-if="isElementLoading"
      class="w-full flex justify-center items-center py-12"
    >
      <div class="flex items-center space-x-2">
        <div
          class="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-900 dark:border-gray-100"
        ></div>
        <span class="text-sm text-gray-600 dark:text-gray-400"
          >Loading payment form...</span
        >
      </div>
    </div>

    <!-- Stripe Payment Element -->
    <div v-show="!isElementLoading">
      <div id="subscription-payment-element" class="mb-6" />

      <div class="mt-6 space-y-4">
        <Button
          type="submit"
          class="w-full"
          :disabled="!isElementReady || isSubmitting"
        >
          <Icon
            v-if="!isSubmitting"
            name="heroicons:lock-closed"
            class="mr-2 h-4 w-4"
          />
          <div v-if="isSubmitting" class="flex items-center">
            <div
              class="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"
            ></div>
            Processing...
          </div>
          <span v-else>{{ submitButtonText }}</span>
        </Button>

        <p
          v-if="isElementReady"
          class="text-xs text-gray-500 dark:text-gray-400 text-center"
        >
          <Icon
            name="heroicons:shield-check"
            class="inline-block w-4 h-4 mr-1"
          />
          Secure payment processed by Stripe
        </p>
      </div>
    </div>
  </form>
</template>

<script setup lang="ts">
import { loadStripe } from "@stripe/stripe-js";
import type { Stripe, StripeElements } from "@stripe/stripe-js";

const props = defineProps({
  email: {
    type: String,
    required: true,
    validator: (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
  },
  name: {
    type: String,
    default: "",
  },
  priceId: {
    type: String,
    required: true,
  },
  trialDays: {
    type: Number,
    default: 0,
  },
  planName: {
    type: String,
    default: "Subscription",
  },
  planPrice: {
    type: Number,
    default: 0,
  },
  billingCycle: {
    type: String as PropType<"monthly" | "yearly">,
    default: "monthly",
  },
  metadata: {
    type: Object as PropType<Record<string, any>>,
    default: () => ({}),
  },
  returnUrl: {
    type: String,
    default: null,
  },
});

const emit = defineEmits<{
  success: [data: { subscriptionId: string; customerId: string; status: string; trialEnd: string | null }];
  error: [error: Error];
}>();

const config = useRuntimeConfig();

// State
const isElementLoading = ref(true);
const isElementReady = ref(false);
const isSubmitting = ref(false);
const error = ref<{ title: string; message: string } | null>(null);
const subscriptionData = ref<{
  subscriptionId: string;
  customerId: string;
  clientSecret: string;
  type: 'setup_intent' | 'payment_intent';
  status: string;
  trialEnd: string | null;
} | null>(null);

let stripe: Stripe | null = null;
let elements: StripeElements | null = null;

// Computed
const submitButtonText = computed(() => {
  if (isSubmitting.value) return "Processing...";
  if (props.trialDays && props.trialDays > 0) {
    return `Start ${props.trialDays}-Day Free Trial`;
  }
  return `Subscribe for ${formatAmount(props.planPrice)}/${props.billingCycle === "yearly" ? "year" : "mo"}`;
});

const defaultReturnUrl = computed(() => {
  return props.returnUrl || `${window.location.origin}/setup/complete`;
});

// Methods
const formatAmount = (amount: number) => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
};

const handleError = (message: string, err: any = null) => {
  console.error("Subscription Error:", err || message);
  error.value = {
    title: "Error",
    message: message,
  };
  isSubmitting.value = false;
  emit("error", err || new Error(message));
};

const createSubscription = async () => {
  try {
    const data = await $fetch<{
      subscriptionId: string;
      customerId: string;
      clientSecret: string;
      type: 'setup_intent' | 'payment_intent';
      status: string;
      trialEnd: string | null;
    }>("/api/stripe/subscription", {
      method: "POST",
      body: {
        email: props.email,
        name: props.name,
        priceId: props.priceId,
        trialDays: props.trialDays,
        metadata: {
          ...props.metadata,
          plan_name: props.planName,
          billing_cycle: props.billingCycle,
        },
      },
    });

    console.log("Subscription created:", data);
    subscriptionData.value = data;
    return data;
  } catch (err: any) {
    console.error("Subscription creation error:", err);
    handleError(err.data?.message || err.message || "Failed to create subscription", err);
    throw err;
  }
};

const setupStripeElement = async (clientSecret: string) => {
  if (!clientSecret) {
    throw new Error("Missing client secret for Stripe Elements");
  }

  if (!stripe) {
    throw new Error("Stripe not initialized");
  }

  try {
    const options = {
      clientSecret,
      appearance: {
        variables: {
          colorPrimary: "#502989",
          colorBackground: "#ffffff",
          colorText: "#502989",
          colorDanger: "#df1b41",
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
          borderRadius: "8px",
          spacingUnit: "4px",
        },
        rules: {
          ".Label": {
            textTransform: "uppercase" as const,
            letterSpacing: "0.05em",
            fontSize: "12px",
            fontWeight: "600",
            marginBottom: "8px",
          },
          ".Input": {
            padding: "12px",
            fontSize: "14px",
            border: "1px solid #d1d5db",
          },
          ".Input:focus": {
            borderColor: "#502989",
            boxShadow: "0 0 0 3px rgba(80, 41, 137, 0.1)",
          },
          ".Error": {
            fontSize: "12px",
            marginTop: "4px",
          },
        },
      },
    };

    elements = stripe.elements(options);
    const paymentElement = elements.create("payment", {
      defaultValues: {
        billingDetails: {
          email: props.email,
          name: props.name,
        },
      },
    });

    paymentElement.on("ready", () => {
      isElementReady.value = true;
      isElementLoading.value = false;
    });

    paymentElement.on("change", (event: any) => {
      if (event.error) {
        handleError(event.error.message);
      } else {
        error.value = null;
      }
    });

    paymentElement.mount("#subscription-payment-element");
  } catch (err: any) {
    handleError("Failed to setup payment form", err);
    throw err;
  }
};

const handleSubmit = async () => {
  try {
    if (!stripe || !elements || !subscriptionData.value) {
      throw new Error("Payment not initialized");
    }

    if (isSubmitting.value) {
      return;
    }

    error.value = null;
    isSubmitting.value = true;

    const { type, clientSecret } = subscriptionData.value;

    if (type === 'setup_intent') {
      // For trials - confirm the SetupIntent to save payment method
      const { error: setupError, setupIntent } = await stripe.confirmSetup({
        elements,
        confirmParams: {
          return_url: defaultReturnUrl.value,
        },
        redirect: 'if_required',
      });

      if (setupError) {
        throw setupError;
      }

      // If we get here without redirect, setup completed inline
      if (setupIntent && setupIntent.status === 'succeeded') {
        // Emit success with subscription data
        emit("success", {
          subscriptionId: subscriptionData.value.subscriptionId,
          customerId: subscriptionData.value.customerId,
          status: subscriptionData.value.status,
          trialEnd: subscriptionData.value.trialEnd,
        });
        return;
      }
    } else {
      // For immediate payment - confirm the PaymentIntent
      const { error: paymentError, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: defaultReturnUrl.value,
          payment_method_data: {
            billing_details: {
              email: props.email,
              name: props.name,
            },
          },
        },
        redirect: 'if_required',
      });

      if (paymentError) {
        throw paymentError;
      }

      // If we get here without redirect, payment completed inline
      if (paymentIntent) {
        if (paymentIntent.status === 'succeeded' || paymentIntent.status === 'processing') {
          emit("success", {
            subscriptionId: subscriptionData.value.subscriptionId,
            customerId: subscriptionData.value.customerId,
            status: 'active',
            trialEnd: null,
          });
          return;
        } else if (paymentIntent.status === 'requires_action') {
          throw new Error('Additional verification required. Please try again.');
        } else {
          throw new Error(`Payment not completed. Status: ${paymentIntent.status}`);
        }
      }
    }
  } catch (err: any) {
    handleError(err.message || "Payment failed", err);
  }
};

// Initialize
onMounted(async () => {
  try {
    // Initialize Stripe
    const publicKey = config.public.stripePublicKey;
    if (!publicKey) {
      throw new Error("Stripe public key not configured");
    }

    console.log("Initializing Stripe for subscription...");
    stripe = await loadStripe(publicKey);
    if (!stripe) {
      throw new Error("Failed to load Stripe");
    }

    // Create subscription and get client secret
    const subData = await createSubscription();

    if (!subData.clientSecret) {
      throw new Error("No client secret returned from subscription creation");
    }

    // Setup Stripe Elements with client secret
    await setupStripeElement(subData.clientSecret);
  } catch (err: any) {
    isElementLoading.value = false;
    handleError("Payment setup failed", err);
  }
});

// Cleanup
onBeforeUnmount(() => {
  if (elements) {
    const paymentElement = elements.getElement("payment");
    paymentElement?.destroy();
  }
});
</script>

<style scoped>
#subscription-form {
  width: 100%;
  max-width: 600px;
  margin: 0 auto;
}

#subscription-payment-element {
  min-height: 100px;
}

/* Dark mode support */
:deep(.dark) #subscription-payment-element {
  color-scheme: dark;
}
</style>
