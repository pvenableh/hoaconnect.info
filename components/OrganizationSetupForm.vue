<script setup lang="ts">
import { ref, computed } from "vue";
import { toast } from "vue-sonner";
import { useDirectusItems } from "#imports";

interface Props {
  title?: string;
  description?: string;
  redirectTo?: string;
  betaMode?: boolean; // Skip subscription selection in BETA
}

const props = withDefaults(defineProps<Props>(), {
  title: "Set up your HOA",
  description: "Get started by creating your organization",
  redirectTo: "/dashboard",
  betaMode: true, // Enable BETA mode by default
});

const emit = defineEmits<{
  success: [data: any];
  error: [error: Error];
}>();

const router = useRouter();
const { fetchItems } = useDirectusItems();

// Form state
const currentStep = ref(1);
const loading = ref(false);

// Step 1: Organization Details
const orgForm = ref({
  organizationName: "",
  organizationAddress: "",
});

// Step 2: Subscription Selection (optional in BETA)
const selectedPlan = ref<string | null>(null);
const subscriptionPlans = ref<any[]>([]);

// Step 3: Admin Details
const adminForm = ref({
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  password: "",
  confirmPassword: "",
});

// Load subscription plans
const loadPlans = async () => {
  const { data } = await fetchItems("subscription_plans", {
    filter: {
      is_active: { _eq: true },
      status: { _eq: "published" },
    },
    sort: ["sort"],
  });

  if (data.value) {
    subscriptionPlans.value = data.value;

    // Auto-select free plan in BETA mode
    if (props.betaMode) {
      const freePlan = data.value.find(
        (p: any) => parseFloat(p.price_monthly) === 0
      );
      if (freePlan) {
        selectedPlan.value = freePlan.id;
      }
    }
  }
};

onMounted(() => {
  if (!props.betaMode) {
    loadPlans();
  }
});

// Validation
const step1Valid = computed(() => {
  return orgForm.value.organizationName.trim().length > 0;
});

const step2Valid = computed(() => {
  return props.betaMode || selectedPlan.value !== null;
});

const step3Valid = computed(() => {
  const { firstName, lastName, email, password, confirmPassword } =
    adminForm.value;
  return (
    firstName.trim().length >= 2 &&
    lastName.trim().length >= 2 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) &&
    password.length >= 8 &&
    password === confirmPassword
  );
});

// Navigation
const nextStep = () => {
  if (currentStep.value === 1 && !step1Valid.value) {
    toast.error("Please complete all organization details");
    return;
  }
  if (currentStep.value === 2 && !step2Valid.value) {
    toast.error("Please select a subscription plan");
    return;
  }

  // Skip subscription step in BETA mode
  if (props.betaMode && currentStep.value === 1) {
    currentStep.value = 3;
  } else {
    currentStep.value++;
  }
};

const prevStep = () => {
  // Skip subscription step in BETA mode
  if (props.betaMode && currentStep.value === 3) {
    currentStep.value = 1;
  } else {
    currentStep.value--;
  }
};

// Submit
const handleSubmit = async () => {
  if (!step3Valid.value) {
    toast.error("Please complete all admin details");
    return;
  }

  loading.value = true;

  try {
    const response = await $fetch("/api/hoa/setup-organization", {
      method: "POST",
      body: {
        // Organization
        organizationName: orgForm.value.organizationName,
        organizationAddress: orgForm.value.organizationAddress,
        subscriptionPlanId: props.betaMode ? null : selectedPlan.value,

        // Admin
        firstName: adminForm.value.firstName,
        lastName: adminForm.value.lastName,
        email: adminForm.value.email,
        phone: adminForm.value.phone,
        password: adminForm.value.password,
      },
    });

    toast.success("Welcome aboard!", {
      description: "Your organization has been set up successfully.",
    });

    emit("success", response);
    await router.push(props.redirectTo);
  } catch (err: any) {
    const errorMessage =
      err.data?.message || "Failed to set up organization. Please try again.";

    toast.error("Setup failed", {
      description: errorMessage,
    });

    emit("error", err);
  } finally {
    loading.value = false;
  }
};
</script>

<template>
  <Card class="w-full max-w-2xl mx-auto">
    <CardHeader>
      <CardTitle>{{ title }}</CardTitle>
      <CardDescription>{{ description }}</CardDescription>

      <!-- Progress Indicator -->
      <div class="flex items-center justify-between mt-4">
        <div
          v-for="step in betaMode ? [1, 3] : [1, 2, 3]"
          :key="step"
          class="flex items-center flex-1"
        >
          <div
            class="flex items-center justify-center w-8 h-8 rounded-full transition-colors"
            :class="[
              currentStep >= step
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground',
            ]"
          >
            {{
              betaMode && step === 3 ? 2 : step === 3 ? 3 : step === 2 ? 2 : 1
            }}
          </div>
          <div
            v-if="step !== (betaMode ? 3 : 3)"
            class="flex-1 h-1 mx-2 transition-colors"
            :class="[currentStep > step ? 'bg-primary' : 'bg-muted']"
          />
        </div>
      </div>
    </CardHeader>

    <CardContent class="space-y-6">
      <!-- Step 1: Organization Details -->
      <div v-if="currentStep === 1" class="space-y-4">
        <h3 class="text-lg font-semibold">Organization Information</h3>

        <div class="space-y-4">
          <FormField name="organizationName">
            <FormItem>
              <FormLabel>Organization Name *</FormLabel>
              <FormControl>
                <Input
                  v-model="orgForm.organizationName"
                  placeholder="Sunset Heights HOA"
                  required
                />
              </FormControl>
              <FormDescription>
                The official name of your homeowners association
              </FormDescription>
            </FormItem>
          </FormField>

          <FormField name="organizationAddress">
            <FormItem>
              <FormLabel>Address</FormLabel>
              <FormControl>
                <Textarea
                  v-model="orgForm.organizationAddress"
                  placeholder="123 Main Street&#10;Miami Beach, FL 33139"
                  rows="3"
                />
              </FormControl>
              <FormDescription>
                The physical address of your HOA property
              </FormDescription>
            </FormItem>
          </FormField>
        </div>
      </div>

      <!-- Step 2: Subscription Selection (skip in BETA) -->
      <div v-if="currentStep === 2 && !betaMode" class="space-y-4">
        <h3 class="text-lg font-semibold">Choose Your Plan</h3>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div
            v-for="plan in subscriptionPlans"
            :key="plan.id"
            class="border rounded-lg p-4 cursor-pointer transition-all"
            :class="[
              selectedPlan === plan.id
                ? 'border-primary bg-primary/5'
                : 'hover:border-primary/50',
            ]"
            @click="selectedPlan = plan.id"
          >
            <div class="flex items-start justify-between mb-2">
              <h4 class="font-semibold">{{ plan.name }}</h4>
              <Checkbox
                :checked="selectedPlan === plan.id"
                @update:checked="() => (selectedPlan = plan.id)"
              />
            </div>

            <p class="text-2xl font-bold mb-2">
              ${{ plan.price_monthly }}
              <span class="text-sm font-normal text-muted-foreground"
                >/month</span
              >
            </p>

            <p class="text-sm text-muted-foreground mb-3">
              {{ plan.description }}
            </p>

            <ul class="space-y-1">
              <li
                v-for="(feature, idx) in plan.features"
                :key="idx"
                class="text-sm flex items-center gap-2"
              >
                <Icon name="lucide:check" class="w-4 h-4 text-primary" />
                {{ feature }}
              </li>
            </ul>
          </div>
        </div>
      </div>

      <!-- Step 3: Admin Details -->
      <div v-if="currentStep === 3" class="space-y-4">
        <h3 class="text-lg font-semibold">Your Account Details</h3>

        <div class="grid grid-cols-2 gap-4">
          <FormField name="firstName">
            <FormItem>
              <FormLabel>First Name *</FormLabel>
              <FormControl>
                <Input
                  v-model="adminForm.firstName"
                  placeholder="John"
                  required
                />
              </FormControl>
            </FormItem>
          </FormField>

          <FormField name="lastName">
            <FormItem>
              <FormLabel>Last Name *</FormLabel>
              <FormControl>
                <Input
                  v-model="adminForm.lastName"
                  placeholder="Doe"
                  required
                />
              </FormControl>
            </FormItem>
          </FormField>
        </div>

        <FormField name="email">
          <FormItem>
            <FormLabel>Email *</FormLabel>
            <FormControl>
              <Input
                v-model="adminForm.email"
                type="email"
                placeholder="john@example.com"
                required
              />
            </FormControl>
          </FormItem>
        </FormField>

        <FormField name="phone">
          <FormItem>
            <FormLabel>Phone</FormLabel>
            <FormControl>
              <Input
                v-model="adminForm.phone"
                type="tel"
                placeholder="(305) 555-1234"
              />
            </FormControl>
          </FormItem>
        </FormField>

        <FormField name="password">
          <FormItem>
            <FormLabel>Password *</FormLabel>
            <FormControl>
              <Input
                v-model="adminForm.password"
                type="password"
                placeholder="••••••••"
                required
              />
            </FormControl>
            <FormDescription> At least 8 characters </FormDescription>
          </FormItem>
        </FormField>

        <FormField name="confirmPassword">
          <FormItem>
            <FormLabel>Confirm Password *</FormLabel>
            <FormControl>
              <Input
                v-model="adminForm.confirmPassword"
                type="password"
                placeholder="••••••••"
                required
              />
            </FormControl>
          </FormItem>
        </FormField>
      </div>
    </CardContent>

    <CardFooter class="flex justify-between">
      <Button
        v-if="currentStep > 1"
        variant="outline"
        @click="prevStep"
        :disabled="loading"
      >
        Back
      </Button>

      <div class="flex-1" />

      <Button v-if="currentStep < 3" @click="nextStep"> Continue </Button>

      <Button v-else @click="handleSubmit" :disabled="loading || !step3Valid">
        {{ loading ? "Setting up..." : "Complete Setup" }}
      </Button>
    </CardFooter>
  </Card>
</template>
