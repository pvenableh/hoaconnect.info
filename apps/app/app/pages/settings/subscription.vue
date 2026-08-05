<script setup lang="ts">
import { toast } from "vue-sonner";

definePageMeta({
  middleware: ["auth"],
  layout: "auth",
});

const config = useRuntimeConfig();
const { user } = useDirectusAuth();
const { currentOrg, selectedOrgId } = await useSelectedOrg();
const { list: listPlans } = useDirectusItems("subscription_plans");

// Fetch subscription plans
const { data: plans, pending: plansPending } = await useAsyncData(
  "subscription-plans",
  async () => {
    try {
      const result = await listPlans({
        fields: [
          "id",
          "name",
          "slug",
          "description",
          "price_monthly",
          "price_yearly",
          "stripe_price_id_monthly",
          "stripe_price_id_yearly",
          "features",
          "max_members",
          "max_storage_gb",
          "max_documents",
          "is_active",
          "is_featured",
          "trial_days",
        ],
        filter: {
          is_active: { _eq: true },
        },
        sort: ["price_monthly"],
      });
      return result || [];
    } catch (error) {
      console.error("Error fetching plans:", error);
      return [];
    }
  }
);

const billingCycle = ref<"monthly" | "yearly">("monthly");
const isProcessing = ref(false);

// When set, the Stripe checkout overlay is shown to confirm payment for a
// just-created (incomplete) subscription.
const checkout = ref<{
  clientSecret: string;
  email: string;
  amountCents: number;
  planName: string;
} | null>(null);
const returnUrl = computed(() =>
  import.meta.client ? `${window.location.origin}/settings/subscription` : undefined
);

// Current subscription info
const currentSubscription = computed(() => {
  return {
    status: currentOrg.value?.organization?.subscription_status,
    trialEndsAt: currentOrg.value?.organization?.trial_ends_at,
    plan: currentOrg.value?.organization?.subscription_plan,
    isFreeAccount: currentOrg.value?.organization?.is_free_account === true,
  };
});

// Get days remaining in trial
const trialDaysRemaining = computed(() => {
  if (!currentSubscription.value.trialEndsAt) return null;
  const endDate = new Date(currentSubscription.value.trialEndsAt);
  const now = new Date();
  const diffTime = endDate.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays > 0 ? diffDays : 0;
});

const formatDate = (dateString: string | null | undefined) => {
  if (!dateString) return "N/A";
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
};

const formatPrice = (price: number | null | undefined) => {
  if (!price) return "$0";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
  }).format(price);
};

const getStatusColor = (status: string | null | undefined, isFree?: boolean) => {
  // Free accounts get a special purple badge
  if (isFree) return "bg-purple-100 text-purple-800 dark:bg-purple-500/20 dark:text-purple-200";

  switch (status) {
    case "active":
      return "bg-green-100 text-green-800 dark:bg-green-500/20 dark:text-green-200";
    case "trial":
      return "bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-200";
    case "expired":
      return "bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-200";
    case "canceled":
      return "t-bg-subtle t-text";
    default:
      return "t-bg-subtle t-text-muted";
  }
};

const getStatusLabel = (status: string | null | undefined, isFree?: boolean) => {
  // Free accounts show as "Free Account"
  if (isFree) return "Free Account";

  switch (status) {
    case "active":
      return "Active";
    case "trial":
      return "Trial";
    case "expired":
      return "Expired";
    case "canceled":
      return "Canceled";
    default:
      return "Unknown";
  }
};

// Handle subscription upgrade/renewal
const handleSubscribe = async (plan: any) => {
  if (isProcessing.value) return;

  isProcessing.value = true;

  try {
    const priceId =
      billingCycle.value === "yearly"
        ? plan.stripe_price_id_yearly
        : plan.stripe_price_id_monthly;

    if (!priceId) {
      toast.error("This plan is not available for the selected billing cycle");
      return;
    }

    // Create Stripe checkout session
    const response = await $fetch("/api/stripe/subscription", {
      method: "POST",
      body: {
        email: user.value?.email,
        priceId,
        organizationId: selectedOrgId.value,
        trialDays: 0, // No trial for renewals
      },
    });

    if (response?.clientSecret) {
      // Open the Stripe Elements overlay to confirm payment for the newly
      // created (incomplete) subscription.
      const price = billingCycle.value === "yearly" ? plan.price_yearly : plan.price_monthly;
      checkout.value = {
        clientSecret: response.clientSecret,
        email: user.value?.email || "",
        amountCents: Math.round((Number(price) || 0) * 100),
        planName: plan.name,
      };
    } else {
      toast.error("Failed to create subscription");
    }
  } catch (error: any) {
    console.error("Subscription error:", error);
    toast.error(error?.data?.message || error.message || "Failed to process subscription");
  } finally {
    isProcessing.value = false;
  }
};

const onCheckoutError = (err: Error) => {
  toast.error(err?.message || "Payment failed");
};

// Open the Stripe-hosted billing portal (update payment method, invoices, cancel).
const handleManageBilling = async () => {
  try {
    const { url } = await $fetch<{ url: string }>("/api/stripe/portal", {
      method: "POST",
      body: { organizationId: selectedOrgId.value },
    });
    if (url && import.meta.client) window.location.href = url;
  } catch (error: any) {
    console.error("Billing portal error:", error);
    toast.error(error?.data?.message || "Failed to open billing portal");
  }
};
</script>

<template>
  <div class="ui-kit accent-blue max-w-6xl mx-auto px-6 py-8">
    <!-- Header -->
    <WidgetGlass strong class="mb-8">
      <div class="flex items-center gap-3">
        <h1 class="text-2xl font-semibold tracking-tight t-text">Subscription</h1>
        <PaymentStripeModeBadge />
      </div>
      <p class="t-text-secondary mt-1">
        Manage your organization's subscription and billing
      </p>
    </WidgetGlass>

    <!-- Current Subscription Status -->
    <div class="ios-card p-6 mb-8">
      <h2 class="text-lg font-semibold t-text mb-4">
        Current Subscription
      </h2>

      <div class="grid md:grid-cols-3 gap-6">
        <!-- Status -->
        <div>
          <p class="text-sm t-text-muted mb-1">Status</p>
          <span
            :class="[
              'inline-flex items-center px-3 py-1 rounded-full text-sm font-medium',
              getStatusColor(currentSubscription.status, currentSubscription.isFreeAccount),
            ]"
          >
            {{ getStatusLabel(currentSubscription.status, currentSubscription.isFreeAccount) }}
          </span>
        </div>

        <!-- Plan -->
        <div>
          <p class="text-sm t-text-muted mb-1">Plan</p>
          <p class="font-medium t-text">
            {{ currentSubscription.plan?.name || "No plan selected" }}
          </p>
        </div>

        <!-- Trial/Expiry -->
        <div v-if="currentSubscription.status === 'trial'">
          <p class="text-sm t-text-muted mb-1">Trial Ends</p>
          <p class="font-medium t-text">
            {{ formatDate(currentSubscription.trialEndsAt) }}
            <span
              v-if="trialDaysRemaining !== null"
              class="text-sm text-blue-600 ml-1"
            >
              ({{ trialDaysRemaining }} days left)
            </span>
          </p>
        </div>
      </div>

      <!-- Free account notice -->
      <div
        v-if="currentSubscription.isFreeAccount"
        class="mt-4 p-4 bg-purple-50 border border-purple-200 rounded-lg"
      >
        <div class="flex items-start gap-3">
          <Icon
            name="i-lucide-gift"
            class="w-5 h-5 text-purple-600 flex-shrink-0 mt-0.5"
          />
          <div>
            <p class="font-medium text-purple-800">Free Account</p>
            <p class="text-sm text-purple-700 mt-1">
              Your organization has a free account with full access to all features.
              No subscription payment is required.
            </p>
          </div>
        </div>
      </div>

      <!-- Warning for expired/canceled -->
      <div
        v-else-if="
          currentSubscription.status === 'expired' ||
          currentSubscription.status === 'canceled'
        "
        class="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg"
      >
        <div class="flex items-start gap-3">
          <Icon
            name="i-lucide-alert-circle"
            class="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5"
          />
          <div>
            <p class="font-medium text-red-800">Subscription Not Active</p>
            <p class="text-sm text-red-700 mt-1">
              Your subscription is
              {{ currentSubscription.status }}. Select a plan below to restore
              full access to all features.
            </p>
          </div>
        </div>
      </div>

      <!-- Manage Billing Button (for active subscriptions) -->
      <div v-if="currentSubscription.status === 'active'" class="mt-4">
        <button
          @click="handleManageBilling"
          class="text-sm text-blue-600 hover:text-blue-700 font-medium"
        >
          Manage Billing & Payment Methods
        </button>
      </div>
    </div>

    <!-- Billing Cycle Toggle (hidden for free accounts) -->
    <div v-if="!currentSubscription.isFreeAccount" class="flex justify-center mb-8">
      <div class="t-bg-subtle rounded-lg p-1 inline-flex">
        <button
          @click="billingCycle = 'monthly'"
          :class="[
            'px-4 py-2 text-sm font-medium rounded-md transition',
            billingCycle === 'monthly'
              ? 'bg-white t-text shadow'
              : 't-text-secondary hover:t-text',
          ]"
        >
          Monthly
        </button>
        <button
          @click="billingCycle = 'yearly'"
          :class="[
            'px-4 py-2 text-sm font-medium rounded-md transition',
            billingCycle === 'yearly'
              ? 'bg-white t-text shadow'
              : 't-text-secondary hover:t-text',
          ]"
        >
          Yearly
          <span class="ml-1 text-xs text-green-600">(Save 20%)</span>
        </button>
      </div>
    </div>

    <!-- Plans Loading (hidden for free accounts) -->
    <div v-if="!currentSubscription.isFreeAccount && plansPending" class="flex justify-center py-12">
      <span class="spinner-ios spinner-ios--lg" />
    </div>

    <!-- Plans Grid (hidden for free accounts) -->
    <div
      v-else-if="!currentSubscription.isFreeAccount && plans && plans.length > 0"
      class="grid md:grid-cols-3 gap-6"
    >
      <div
        v-for="plan in plans"
        :key="plan.id"
        :class="[
          'ios-card border-2 p-6 relative',
          plan.is_featured
            ? 'border-blue-500 shadow-lg'
            : 't-border hover:t-border',
        ]"
      >
        <!-- Featured Badge -->
        <div
          v-if="plan.is_featured"
          class="absolute -top-3 left-1/2 -translate-x-1/2"
        >
          <span
            class="bg-blue-500 text-white text-xs font-medium px-3 py-1 rounded-full"
          >
            Most Popular
          </span>
        </div>

        <!-- Plan Name -->
        <h3 class="text-xl font-semibold t-text mb-2">
          {{ plan.name }}
        </h3>
        <p class="t-text-secondary text-sm mb-4">{{ plan.description }}</p>

        <!-- Price -->
        <div class="mb-6">
          <span class="text-3xl font-bold t-text">
            {{
              formatPrice(
                billingCycle === "yearly"
                  ? plan.price_yearly
                  : plan.price_monthly
              )
            }}
          </span>
          <span class="t-text-muted">/{{ billingCycle === "yearly" ? "year" : "month" }}</span>
        </div>

        <!-- Features -->
        <ul class="space-y-3 mb-6">
          <li
            v-if="plan.max_members"
            class="flex items-center gap-2 text-sm t-text-secondary"
          >
            <Icon name="i-lucide-check" class="w-4 h-4 text-green-500" />
            Up to {{ plan.max_members }} members
          </li>
          <li
            v-if="plan.max_documents"
            class="flex items-center gap-2 text-sm t-text-secondary"
          >
            <Icon name="i-lucide-check" class="w-4 h-4 text-green-500" />
            {{ plan.max_documents }} documents
          </li>
          <li
            v-if="plan.max_storage_gb"
            class="flex items-center gap-2 text-sm t-text-secondary"
          >
            <Icon name="i-lucide-check" class="w-4 h-4 text-green-500" />
            {{ plan.max_storage_gb }}GB storage
          </li>
          <template v-if="plan.features && typeof plan.features === 'object'">
            <li
              v-for="(feature, index) in Object.values(plan.features)"
              :key="index"
              class="flex items-center gap-2 text-sm t-text-secondary"
            >
              <Icon name="i-lucide-check" class="w-4 h-4 text-green-500" />
              {{ feature }}
            </li>
          </template>
        </ul>

        <!-- Subscribe Button -->
        <button
          @click="handleSubscribe(plan)"
          :disabled="isProcessing"
          :class="[
            'w-full py-2.5 rounded-lg font-medium transition',
            plan.is_featured
              ? 'bg-blue-600 text-white hover:bg-blue-700'
              : 't-bg-subtle t-text hover:t-bg-subtle',
            isProcessing && 'opacity-50 cursor-not-allowed',
          ]"
        >
          {{
            currentSubscription.status === "active"
              ? "Switch to this plan"
              : currentSubscription.status === "trial"
              ? "Upgrade Now"
              : "Subscribe"
          }}
        </button>
      </div>
    </div>

    <!-- No Plans Available (hidden for free accounts) -->
    <div
      v-else-if="!currentSubscription.isFreeAccount"
      class="text-center py-12 ios-card"
    >
      <Icon
        name="i-lucide-package"
        class="w-12 h-12 mx-auto t-text-muted mb-4"
      />
      <h3 class="text-lg font-medium t-text mb-2">
        No Plans Available
      </h3>
      <p class="t-text-secondary">
        Please contact support for subscription options.
      </p>
    </div>

    <!-- Help Section -->
    <div class="mt-8 p-6 t-bg-subtle rounded-xl">
      <h3 class="font-medium t-text mb-2">Need Help?</h3>
      <p class="text-sm t-text-secondary mb-3">
        Have questions about billing or need to make changes to your
        subscription?
      </p>
      <a
        href="mailto:support@hoaconnect.com"
        class="text-sm text-blue-600 hover:text-blue-700 font-medium"
      >
        Contact Support
      </a>
    </div>

    <!-- Stripe checkout overlay -->
    <div
      v-if="checkout"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      @click.self="checkout = null"
    >
      <div class="ios-card w-full max-w-lg p-6 bg-background max-h-[90vh] overflow-y-auto">
        <div class="flex items-start justify-between mb-4">
          <div>
            <h2 class="text-lg font-semibold t-text">Complete your subscription</h2>
            <p class="text-sm t-text-muted">{{ checkout.planName }}</p>
          </div>
          <button
            @click="checkout = null"
            class="inline-flex items-center justify-center w-8 h-8 rounded-full t-bg-subtle hover:opacity-80"
            aria-label="Close"
          >
            <Icon name="lucide:x" class="w-4 h-4" />
          </button>
        </div>
        <PaymentStripeCard
          :client-secret="checkout.clientSecret"
          :email="checkout.email"
          :amount="checkout.amountCents"
          payment-type="card"
          :return-url="returnUrl"
          @error="onCheckoutError"
        />
      </div>
    </div>
  </div>
</template>
