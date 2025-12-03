<script setup lang="ts">
import { ref, computed, watch } from "vue";
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
const config = useRuntimeConfig();
const session = useUserSession();
const { list: listPlans } = useDirectusItems("subscription_plans", { requireAuth: false });

// Total steps: 4 (Org Info, Plan Selection, Account Details, Payment)
// Beta mode: skips step 2 (Plan Selection), but still shows payment if plan costs money
const TOTAL_STEPS = 4;

// Form state
const currentStep = ref(1);
const loading = ref(false);

// Payment state
const paymentIntentId = ref<string | null>(null);
const paymentCompleted = ref(false);

// Step 1: Organization Details
const orgForm = ref({
  organizationName: "",
  street_address: "",
  city: "",
  state: "",
  zip: "",
  org_phone: "",
  org_email: "",
  slug: "",
});

// Slug validation state
const slugTouched = ref(false);
const slugChecking = ref(false);
const slugAvailable = ref<boolean | null>(null);
const slugMessage = ref("");
let slugCheckTimeout: NodeJS.Timeout | null = null;

// Auto-generate slug from organization name
watch(
  () => orgForm.value.organizationName,
  (newName) => {
    // Only auto-generate if slug hasn't been manually edited
    if (!slugTouched.value) {
      orgForm.value.slug = generateSlug(newName);
    }
  }
);

// Watch slug changes for validation
watch(
  () => orgForm.value.slug,
  (newSlug) => {
    if (newSlug.length > 0) {
      checkSlugAvailability(newSlug);
    } else {
      slugAvailable.value = null;
      slugMessage.value = "";
    }
  }
);

// Generate slug helper
const generateSlug = (name: string): string => {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
};

// Check slug availability with debouncing
const checkSlugAvailability = (slug: string) => {
  if (slugCheckTimeout) {
    clearTimeout(slugCheckTimeout);
  }

  slugChecking.value = true;
  slugAvailable.value = null;

  slugCheckTimeout = setTimeout(async () => {
    try {
      const response = await $fetch<{
        available: boolean;
        message: string;
      }>("/api/hoa/check-slug", {
        query: { slug },
      });

      slugAvailable.value = response.available;
      slugMessage.value = response.message;
    } catch (error) {
      slugAvailable.value = false;
      slugMessage.value = "Error checking slug availability";
    } finally {
      slugChecking.value = false;
    }
  }, 500); // 500ms debounce
};

// Mark slug as manually edited
const handleSlugInput = () => {
  slugTouched.value = true;
};

// Computed URL preview
const urlPreview = computed(() => {
  if (orgForm.value.slug) {
    return `${orgForm.value.slug}.${config.public.mainDomain}`;
  }
  return "";
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
  const data = await listPlans({
    filter: {
      is_active: { _eq: true },
      status: { _eq: "published" },
    },
    sort: ["sort"],
  });

  if (data) {
    subscriptionPlans.value = data;

    // Auto-select free plan in BETA mode
    if (props.betaMode) {
      const freePlan = data.find(
        (p: any) => parseFloat(p.price_monthly) === 0
      );
      if (freePlan) {
        selectedPlan.value = freePlan.id;
      }
    }
  }
};

// Always load plans to determine if payment is required
onMounted(() => {
  loadPlans();
});

// Get the selected plan object
const selectedPlanObject = computed(() => {
  if (!selectedPlan.value) return null;
  return subscriptionPlans.value.find((p: any) => p.id === selectedPlan.value);
});

// Check if payment is required based on selected plan price
const paymentRequired = computed(() => {
  if (!selectedPlanObject.value) return false;
  const price = parseFloat(selectedPlanObject.value.price_monthly || "0");
  return price > 0;
});

// Get the plan price for payment
const planPrice = computed(() => {
  if (!selectedPlanObject.value) return 0;
  return parseFloat(selectedPlanObject.value.price_monthly || "0");
});

// Validation
const step1Valid = computed(() => {
  return (
    orgForm.value.organizationName.trim().length > 0 &&
    orgForm.value.slug.trim().length > 0 &&
    slugAvailable.value === true
  );
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

// Step 4 is valid when payment is completed (or not required)
const step4Valid = computed(() => {
  return !paymentRequired.value || paymentCompleted.value;
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
  if (currentStep.value === 3 && !step3Valid.value) {
    toast.error("Please complete all account details");
    return;
  }

  // Handle step transitions
  if (props.betaMode && currentStep.value === 1) {
    // Skip subscription step in BETA mode: 1 -> 3
    currentStep.value = 3;
  } else if (currentStep.value === 3) {
    // After account details, go to payment step if payment is required
    if (paymentRequired.value) {
      currentStep.value = 4;
    } else {
      // No payment required, submit directly
      handleSubmit();
    }
  } else {
    currentStep.value++;
  }
};

const prevStep = () => {
  if (currentStep.value === 4) {
    // Payment step back to account details
    currentStep.value = 3;
  } else if (props.betaMode && currentStep.value === 3) {
    // Skip subscription step in BETA mode: 3 -> 1
    currentStep.value = 1;
  } else {
    currentStep.value--;
  }
};

// Payment handlers
const handlePaymentSuccess = (intentId: string) => {
  paymentIntentId.value = intentId;
  paymentCompleted.value = true;
  toast.success("Payment successful!", {
    description: "Processing your organization setup...",
  });
  // Automatically proceed to create the organization
  handleSubmit();
};

const handlePaymentError = (error: Error) => {
  toast.error("Payment failed", {
    description: error.message || "Please try again or use a different payment method.",
  });
};

// Submit
const handleSubmit = async () => {
  if (!step3Valid.value) {
    toast.error("Please complete all admin details");
    return;
  }

  // If payment is required but not completed, don't submit
  if (paymentRequired.value && !paymentCompleted.value) {
    toast.error("Please complete payment first");
    return;
  }

  loading.value = true;

  try {
    const response = await $fetch("/api/hoa/setup-organization", {
      method: "POST",
      body: {
        // Organization
        organizationName: orgForm.value.organizationName,
        street_address: orgForm.value.street_address,
        city: orgForm.value.city,
        state: orgForm.value.state,
        zip: orgForm.value.zip,
        org_phone: orgForm.value.org_phone,
        org_email: orgForm.value.org_email,
        slug: orgForm.value.slug,
        subscriptionPlanId: selectedPlan.value,

        // Admin
        firstName: adminForm.value.firstName,
        lastName: adminForm.value.lastName,
        email: adminForm.value.email,
        phone: adminForm.value.phone,
        password: adminForm.value.password,

        // Payment (if applicable)
        paymentIntentId: paymentIntentId.value,
      },
    });

    toast.success("Welcome aboard!", {
      description: "Your organization has been set up successfully.",
    });

    // Refresh the client-side session to reflect the server-side login
    await session.fetch();

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

// Computed property for visible steps in progress indicator
// In beta mode: 1 (Org Info), 3 (Account Details), 4 (Payment - if required)
// In non-beta mode: 1, 2, 3, 4 (Payment - if required)
const visibleSteps = computed(() => {
  const steps = props.betaMode ? [1, 3] : [1, 2, 3];
  if (paymentRequired.value) {
    steps.push(4);
  }
  return steps;
});

// Get display number for a step (for showing in the UI)
const getStepDisplayNumber = (step: number) => {
  const index = visibleSteps.value.indexOf(step);
  return index + 1;
};

// Check if this is the last visible step
const isLastVisibleStep = (step: number) => {
  const steps = visibleSteps.value;
  return step === steps[steps.length - 1];
};

// Get the final step number (for button logic)
const finalStep = computed(() => {
  return paymentRequired.value ? 4 : 3;
});
</script>

<template>
  <Card class="w-full max-w-2xl mx-auto">
    <CardHeader>
      <CardTitle>{{ title }}</CardTitle>
      <CardDescription>{{ description }}</CardDescription>

      <!-- Progress Indicator -->
      <div class="flex items-center justify-between mt-4">
        <div
          v-for="step in visibleSteps"
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
            {{ getStepDisplayNumber(step) }}
          </div>
          <div
            v-if="!isLastVisibleStep(step)"
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

          <FormField name="street_address">
            <FormItem>
              <FormLabel>Street Address</FormLabel>
              <FormControl>
                <Input
                  v-model="orgForm.street_address"
                  placeholder="123 Main Street"
                />
              </FormControl>
            </FormItem>
          </FormField>

          <div class="grid grid-cols-2 gap-4">
            <FormField name="city">
              <FormItem>
                <FormLabel>City</FormLabel>
                <FormControl>
                  <Input
                    v-model="orgForm.city"
                    placeholder="Miami Beach"
                  />
                </FormControl>
              </FormItem>
            </FormField>

            <FormField name="state">
              <FormItem>
                <FormLabel>State</FormLabel>
                <FormControl>
                  <Input
                    v-model="orgForm.state"
                    placeholder="FL"
                  />
                </FormControl>
              </FormItem>
            </FormField>
          </div>

          <FormField name="zip">
            <FormItem>
              <FormLabel>ZIP Code</FormLabel>
              <FormControl>
                <Input
                  v-model="orgForm.zip"
                  placeholder="33139"
                />
              </FormControl>
            </FormItem>
          </FormField>

          <FormField name="org_phone">
            <FormItem>
              <FormLabel>Phone</FormLabel>
              <FormControl>
                <Input
                  v-model="orgForm.org_phone"
                  type="tel"
                  placeholder="(305) 555-1234"
                />
              </FormControl>
              <FormDescription>
                Organization phone number (optional)
              </FormDescription>
            </FormItem>
          </FormField>

          <FormField name="org_email">
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input
                  v-model="orgForm.org_email"
                  type="email"
                  placeholder="info@example.com"
                />
              </FormControl>
              <FormDescription>
                Organization contact email (optional)
              </FormDescription>
            </FormItem>
          </FormField>

          <FormField name="slug">
            <FormItem>
              <FormLabel>Portal URL Slug *</FormLabel>
              <FormControl>
                <div class="space-y-2">
                  <Input
                    v-model="orgForm.slug"
                    @input="handleSlugInput"
                    placeholder="sunset-heights-hoa"
                    required
                  />

                  <!-- URL Preview -->
                  <div
                    v-if="urlPreview"
                    class="flex items-center gap-2 text-sm p-2 bg-muted rounded"
                  >
                    <Icon name="lucide:globe" class="w-4 h-4 text-muted-foreground" />
                    <span class="text-muted-foreground">Your portal URL:</span>
                    <code class="text-primary font-mono">{{ urlPreview }}</code>
                  </div>

                  <!-- Validation Status -->
                  <div v-if="orgForm.slug.length > 0" class="flex items-center gap-2 text-sm">
                    <div
                      v-if="slugChecking"
                      class="flex items-center gap-2 text-muted-foreground"
                    >
                      <div
                        class="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin"
                      ></div>
                      <span>Checking availability...</span>
                    </div>
                    <div
                      v-else-if="slugAvailable === true"
                      class="flex items-center gap-2 text-green-600"
                    >
                      <Icon name="lucide:check-circle" class="w-4 h-4" />
                      <span>{{ slugMessage }}</span>
                    </div>
                    <div
                      v-else-if="slugAvailable === false"
                      class="flex items-center gap-2 text-red-600"
                    >
                      <Icon name="lucide:x-circle" class="w-4 h-4" />
                      <span>{{ slugMessage }}</span>
                    </div>
                  </div>
                </div>
              </FormControl>
              <FormDescription>
                Choose a unique URL for your organization's portal (letters, numbers, and hyphens only)
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

      <!-- Step 4: Payment -->
      <div v-if="currentStep === 4" class="space-y-4">
        <h3 class="text-lg font-semibold">Complete Payment</h3>
        <p class="text-sm text-muted-foreground mb-4">
          Complete your payment to activate your {{ selectedPlanObject?.name }} subscription.
        </p>

        <PaymentMethods
          :email="adminForm.email"
          :amount="planPrice"
          :metadata="{
            organization_name: orgForm.organizationName,
            subscription_plan_id: selectedPlan,
            subscription_plan_name: selectedPlanObject?.name,
          }"
          @success="handlePaymentSuccess"
          @error="handlePaymentError"
        />
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

      <!-- Show Continue button for steps before step 3 -->
      <Button v-if="currentStep < 3" @click="nextStep"> Continue </Button>

      <!-- Step 3: Show "Continue to Payment" if payment required, otherwise "Complete Setup" -->
      <Button
        v-else-if="currentStep === 3"
        @click="nextStep"
        :disabled="loading || !step3Valid"
      >
        {{ loading ? "Setting up..." : (paymentRequired ? "Continue to Payment" : "Complete Setup") }}
      </Button>

      <!-- Step 4: No button needed - PaymentMethods handles submission -->
      <!-- Show a loading indicator if payment was successful and we're creating the org -->
      <div v-else-if="currentStep === 4 && loading" class="flex items-center gap-2 text-muted-foreground">
        <div class="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
        <span>Creating your organization...</span>
      </div>
    </CardFooter>
  </Card>
</template>
