<script setup lang="ts">
const props = defineProps<{
  subscriptionStatus?: string | null;
  trialEndsAt?: string | null;
  organizationName?: string | null;
}>();

const emit = defineEmits<{
  (e: "renew"): void;
  (e: "dismiss"): void;
}>();

const isDismissed = ref(false);

// Get days remaining in trial
const trialDaysRemaining = computed(() => {
  if (!props.trialEndsAt) return null;
  const endDate = new Date(props.trialEndsAt);
  const now = new Date();
  const diffTime = endDate.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays > 0 ? diffDays : 0;
});

// Determine if we should show the banner
const shouldShow = computed(() => {
  if (isDismissed.value) return false;

  // Show for expired subscriptions
  if (props.subscriptionStatus === "expired") return true;

  // Show for canceled subscriptions
  if (props.subscriptionStatus === "canceled") return true;

  // Show for trials ending within 7 days
  if (
    props.subscriptionStatus === "trial" &&
    trialDaysRemaining.value !== null &&
    trialDaysRemaining.value <= 7
  ) {
    return true;
  }

  return false;
});

// Banner type determines styling
const bannerType = computed(() => {
  if (props.subscriptionStatus === "expired") return "error";
  if (props.subscriptionStatus === "canceled") return "warning";
  if (trialDaysRemaining.value !== null && trialDaysRemaining.value <= 3)
    return "warning";
  return "info";
});

const bannerStyles = computed(() => {
  switch (bannerType.value) {
    case "error":
      return {
        bg: "bg-red-50",
        border: "border-red-200",
        icon: "text-red-600",
        text: "text-red-800",
        button: "bg-red-600 hover:bg-red-700 text-white",
      };
    case "warning":
      return {
        bg: "bg-amber-50",
        border: "border-amber-200",
        icon: "text-amber-600",
        text: "text-amber-800",
        button: "bg-amber-600 hover:bg-amber-700 text-white",
      };
    default:
      return {
        bg: "bg-blue-50",
        border: "border-blue-200",
        icon: "text-blue-600",
        text: "text-blue-800",
        button: "bg-blue-600 hover:bg-blue-700 text-white",
      };
  }
});

const bannerMessage = computed(() => {
  if (props.subscriptionStatus === "expired") {
    return {
      title: "Subscription Expired",
      description:
        "Your subscription has expired. Some features may be limited. Renew now to restore full access.",
      action: "Renew Subscription",
    };
  }

  if (props.subscriptionStatus === "canceled") {
    return {
      title: "Subscription Canceled",
      description:
        "Your subscription has been canceled. Reactivate to continue using all features.",
      action: "Reactivate",
    };
  }

  if (trialDaysRemaining.value !== null) {
    if (trialDaysRemaining.value === 0) {
      return {
        title: "Trial Ends Today",
        description:
          "Your free trial ends today. Add a payment method to keep using all features.",
        action: "Upgrade Now",
      };
    }
    if (trialDaysRemaining.value === 1) {
      return {
        title: "Trial Ends Tomorrow",
        description:
          "Your free trial ends tomorrow. Add a payment method to continue without interruption.",
        action: "Upgrade Now",
      };
    }
    return {
      title: `Trial Ends in ${trialDaysRemaining.value} Days`,
      description:
        "Add a payment method now to ensure uninterrupted access when your trial ends.",
      action: "Add Payment Method",
    };
  }

  return {
    title: "",
    description: "",
    action: "",
  };
});

const formatDate = (dateString: string | null | undefined) => {
  if (!dateString) return "";
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const handleRenew = () => {
  emit("renew");
};

const handleDismiss = () => {
  isDismissed.value = true;
  emit("dismiss");
};
</script>

<template>
  <div
    v-if="shouldShow"
    :class="[
      'border-b px-4 py-3',
      bannerStyles.bg,
      bannerStyles.border,
    ]"
  >
    <div class="max-w-7xl mx-auto flex items-center justify-between gap-4">
      <div class="flex items-center gap-3">
        <Icon
          :name="
            bannerType === 'error'
              ? 'i-lucide-alert-circle'
              : bannerType === 'warning'
              ? 'i-lucide-alert-triangle'
              : 'i-lucide-clock'
          "
          :class="['w-5 h-5 flex-shrink-0', bannerStyles.icon]"
        />
        <div :class="bannerStyles.text">
          <span class="font-medium">{{ bannerMessage.title }}</span>
          <span class="hidden sm:inline"> — {{ bannerMessage.description }}</span>
        </div>
      </div>

      <div class="flex items-center gap-2">
        <NuxtLink
          to="/settings/subscription"
          :class="[
            'px-4 py-1.5 text-sm font-medium rounded-lg transition',
            bannerStyles.button,
          ]"
        >
          {{ bannerMessage.action }}
        </NuxtLink>
        <button
          v-if="bannerType !== 'error'"
          @click="handleDismiss"
          :class="['p-1 rounded hover:bg-black/5 transition', bannerStyles.text]"
          title="Dismiss"
        >
          <Icon name="i-lucide-x" class="w-4 h-4" />
        </button>
      </div>
    </div>
  </div>
</template>
