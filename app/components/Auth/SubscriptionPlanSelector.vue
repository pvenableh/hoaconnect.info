<script setup lang="ts">
const { list } = useDirectusItems("subscription_plans");
const props = defineProps<{
  selectedPlan?: string;
  billingCycle?: "monthly" | "yearly";
}>();

const emit = defineEmits<{
  "update:selectedPlan": [planId: string];
  "update:billingCycle": [cycle: "monthly" | "yearly"];
}>();

const plansData = await list({
  fields: [
    "id",
    "name",
    "price_monthly",
    "price_yearly",
    "max_members",
    "max_storage_gb",
  ],
  filter: {
    status: { _eq: "published" },
  },
});
const pending = false;

const plans = computed(() => plansData || []);

const localSelectedPlan = ref(props.selectedPlan || "");
const localBillingCycle = ref<"monthly" | "yearly">(
  props.billingCycle || "monthly"
);

const selectPlan = (planId: string) => {
  localSelectedPlan.value = planId;
  emit("update:selectedPlan", planId);
};

const toggleBillingCycle = (cycle: "monthly" | "yearly") => {
  localBillingCycle.value = cycle;
  emit("update:billingCycle", cycle);
};

const getPrice = (plan: any) => {
  return localBillingCycle.value === "yearly"
    ? plan.price_yearly
    : plan.price_monthly;
};

const getMemberLimit = (plan: any) => {
  return plan.max_members
    ? `Up to ${plan.max_members} members`
    : "Unlimited members";
};

const getStorageLimit = (plan: any) => {
  return plan.max_storage_gb
    ? `${plan.max_storage_gb}GB storage`
    : "Unlimited storage";
};
</script>

<template>
  <div class="space-y-6">
    <!-- Billing Cycle Toggle -->
    <div class="flex justify-center">
      <div class="inline-flex rounded-full t-border border p-1">
        <button
          @click="toggleBillingCycle('monthly')"
          class="px-4 py-1.5 rounded-full text-sm font-medium transition-colors"
          :class="
            localBillingCycle === 'monthly'
              ? 'bg-primary text-primary-foreground'
              : 't-text-muted hover:t-text'
          "
        >
          Monthly
        </button>
        <button
          @click="toggleBillingCycle('yearly')"
          class="px-4 py-1.5 rounded-full text-sm font-medium transition-colors relative"
          :class="
            localBillingCycle === 'yearly'
              ? 'bg-primary text-primary-foreground'
              : 't-text-muted hover:t-text'
          "
        >
          Yearly
          <span
            class="absolute -top-2 -right-2 bg-green-500 text-white text-[10px] px-2 py-0.5 rounded-full"
          >
            Save 17%
          </span>
        </button>
      </div>
    </div>

    <!-- Loading State -->
    <div
      v-if="pending"
      class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"
    >
      <div v-for="i in 4" :key="i" class="ios-card h-80 animate-pulse" />
    </div>

    <!-- Plans Grid -->
    <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <button
        v-for="plan in plans"
        :key="plan.id"
        type="button"
        class="ios-card p-5 text-left cursor-pointer transition-all relative space-y-4"
        :class="
          localSelectedPlan === plan.id
            ? 'ring-2 ring-primary shadow-lg'
            : 'hover:shadow-md'
        "
        @click="selectPlan(plan.id)"
      >
        <!-- Featured Badge -->
        <div
          v-if="plan.is_featured"
          class="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground px-3 py-1 rounded-full text-xs font-semibold"
        >
          Most Popular
        </div>

        <div class="space-y-1">
          <h3 class="text-xl font-semibold t-text">{{ plan.name }}</h3>
          <p class="text-sm t-text-muted">{{ plan.description }}</p>
        </div>

        <!-- Price -->
        <div class="text-center">
          <div class="text-4xl font-bold t-text">
            ${{ getPrice(plan) }}
            <span class="text-sm t-text-muted font-normal">
              /{{ localBillingCycle === "yearly" ? "year" : "month" }}
            </span>
          </div>
          <div v-if="plan.trial_days > 0" class="text-sm t-text-muted mt-1">
            {{ plan.trial_days }}-day free trial
          </div>
        </div>

        <!-- Key Limits -->
        <div class="space-y-1 text-sm t-text-muted">
          <div>{{ getMemberLimit(plan) }}</div>
          <div>{{ getStorageLimit(plan) }}</div>
        </div>

        <!-- Features -->
        <ul class="space-y-2 text-sm t-text">
          <li
            v-for="(feature, index) in plan.features"
            :key="index"
            class="flex items-start gap-2"
          >
            <Icon name="lucide:check" class="w-4 h-4 text-primary mt-0.5 shrink-0" />
            <span>{{ feature }}</span>
          </li>
        </ul>

        <!-- Selection Indicator -->
        <div
          v-if="localSelectedPlan === plan.id"
          class="flex items-center justify-center gap-2 text-primary font-medium pt-1"
        >
          <Icon name="lucide:check-circle" class="w-5 h-5" />
          <span>Selected</span>
        </div>
      </button>
    </div>
  </div>
</template>
