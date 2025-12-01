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

const { data: plansData, pending } = await list({
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

const plans = computed(() => plansData.value?.plans || []);

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
      <div class="inline-flex rounded-lg border p-1">
        <button
          @click="toggleBillingCycle('monthly')"
          class="px-4 py-2 rounded-md transition-colors"
          :class="
            localBillingCycle === 'monthly'
              ? 'bg-primary text-primary-foreground'
              : 'hover:bg-muted'
          "
        >
          Monthly
        </button>
        <button
          @click="toggleBillingCycle('yearly')"
          class="px-4 py-2 rounded-md transition-colors relative"
          :class="
            localBillingCycle === 'yearly'
              ? 'bg-primary text-primary-foreground'
              : 'hover:bg-muted'
          "
        >
          Yearly
          <span
            class="absolute -top-2 -right-2 bg-green-500 text-white text-xs px-2 py-0.5 rounded-full"
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
      <Card v-for="i in 4" :key="i" class="animate-pulse">
        <CardHeader class="h-32 bg-muted" />
        <CardContent class="h-48 bg-muted/50" />
      </Card>
    </div>

    <!-- Plans Grid -->
    <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <Card
        v-for="plan in plans"
        :key="plan.id"
        class="cursor-pointer transition-all relative"
        :class="[
          localSelectedPlan === plan.id
            ? 'ring-2 ring-primary shadow-lg scale-105'
            : 'hover:shadow-md',
          plan.is_featured ? 'border-primary' : '',
        ]"
        @click="selectPlan(plan.id)"
      >
        <!-- Featured Badge -->
        <div
          v-if="plan.is_featured"
          class="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-primary text-primary-foreground px-3 py-1 rounded-full text-xs font-semibold"
        >
          Most Popular
        </div>

        <CardHeader>
          <CardTitle class="text-xl">{{ plan.name }}</CardTitle>
          <CardDescription class="text-sm">
            {{ plan.description }}
          </CardDescription>
        </CardHeader>

        <CardContent class="space-y-4">
          <!-- Price -->
          <div class="text-center">
            <div class="text-4xl font-bold">
              ${{ getPrice(plan) }}
              <span class="text-sm text-muted-foreground font-normal">
                /{{ localBillingCycle === "yearly" ? "year" : "month" }}
              </span>
            </div>
            <div
              v-if="plan.trial_days > 0"
              class="text-sm text-muted-foreground mt-1"
            >
              {{ plan.trial_days }}-day free trial
            </div>
          </div>

          <!-- Key Limits -->
          <div class="space-y-1 text-sm text-muted-foreground">
            <div>{{ getMemberLimit(plan) }}</div>
            <div>{{ getStorageLimit(plan) }}</div>
          </div>

          <!-- Features -->
          <ul class="space-y-2 text-sm">
            <li
              v-for="(feature, index) in plan.features"
              :key="index"
              class="flex items-start gap-2"
            >
              <Icon
                name="lucide:check"
                class="w-4 h-4 text-primary mt-0.5 shrink-0"
              />
              <span>{{ feature }}</span>
            </li>
          </ul>

          <!-- Selection Indicator -->
          <div
            v-if="localSelectedPlan === plan.id"
            class="flex items-center justify-center gap-2 text-primary font-medium mt-4"
          >
            <Icon name="lucide:check-circle" class="w-5 h-5" />
            <span>Selected</span>
          </div>
        </CardContent>
      </Card>
    </div>
  </div>
</template>
