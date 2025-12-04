<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { toast } from "vue-sonner";
import { useDirectusItems } from "#imports";
import type { SubscriptionPlan } from "~/types/directus";

interface Props {
  title?: string;
  description?: string;
  redirectTo?: string;
  betaMode?: boolean; // Skip subscription selection in BETA
  isLoggedIn?: boolean; // For existing users creating additional orgs
}

const props = withDefaults(defineProps<Props>(), {
  title: "Set up your HOA",
  description: "Get started by creating your organization",
  redirectTo: "/dashboard",
  betaMode: true, // Enable BETA mode by default
  isLoggedIn: false,
});

const emit = defineEmits<{
  success: [data: any];
  error: [error: Error];
}>();

const router = useRouter();
const config = useRuntimeConfig();
const session = useUserSession();
const { list: listPlans } = useDirectusItems<SubscriptionPlan>("subscription_plans", { requireAuth: false });

// Total steps: 4 (Org Info, Plan Selection, Account Details, Payment)
// Beta mode: skips step 2 (Plan Selection), but still shows payment if plan costs money
// Logged in mode: skips step 3 (Account Details)
const TOTAL_STEPS = 4;

// Form state
const currentStep = ref(1);
const loading = ref(false);

// Subscription state
const subscriptionId = ref<string | null>(null);
const customerId = ref<string | null>(null);
const subscriptionStatus = ref<string | null>(null);
const trialEndDate = ref<string | null>(null);
const paymentCompleted = ref(false);
const pendingSetupToken = ref<string | null>(null);

// Billing cycle selection
const billingCycle = ref<"monthly" | "yearly">("monthly");

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

// Computed URL preview (path-based, not subdomain)
const urlPreview = computed(() => {
  if (orgForm.value.slug) {
    return `${config.public.mainDomain}/${orgForm.value.slug}`;
  }
  return "";
});

// Step 2: Subscription Selection (optional in BETA)
const selectedPlan = ref<string | null>(null);
const subscriptionPlans = ref<SubscriptionPlan[]>([]);

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
    subscriptionPlans.value = data as SubscriptionPlan[];

    // Auto-select free plan in BETA mode
    if (props.betaMode) {
      const freePlan = data.find(
        (p) => parseFloat(String(p.price_monthly || 0)) === 0
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
  return subscriptionPlans.value.find((p) => p.id === selectedPlan.value);
});

// Check if payment is required based on selected plan price
// A paid plan requires payment info even for trials (to charge after trial ends)
const paymentRequired = computed(() => {
  if (!selectedPlanObject.value) return false;
  const price = billingCycle.value === "yearly"
    ? parseFloat(String(selectedPlanObject.value.price_yearly || 0))
    : parseFloat(String(selectedPlanObject.value.price_monthly || 0));
  return price > 0;
});

// Get the plan price for payment (in dollars)
const planPrice = computed(() => {
  if (!selectedPlanObject.value) return 0;
  return billingCycle.value === "yearly"
    ? parseFloat(String(selectedPlanObject.value.price_yearly || 0))
    : parseFloat(String(selectedPlanObject.value.price_monthly || 0));
});

// Get the Stripe price ID based on billing cycle
const stripePriceId = computed(() => {
  if (!selectedPlanObject.value) return null;
  return billingCycle.value === "yearly"
    ? selectedPlanObject.value.stripe_price_id_yearly
    : selectedPlanObject.value.stripe_price_id_monthly;
});

// Get trial days from selected plan
const trialDays = computed(() => {
  if (!selectedPlanObject.value) return 0;
  return selectedPlanObject.value.trial_days || 0;
});

// Check if this plan has a free trial
const hasFreeTrial = computed(() => {
  return trialDays.value > 0;
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
  // If user is already logged in, skip admin details validation
  if (props.isLoggedIn) return true;

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

// Get email for payment - use session email if logged in
const paymentEmail = computed(() => {
  if (props.isLoggedIn && session.user.value?.email) {
    return session.user.value.email;
  }
  return adminForm.value.email;
});

// Get name for payment
const paymentName = computed(() => {
  if (props.isLoggedIn && session.user.value) {
    return `${session.user.value.firstName || ''} ${session.user.value.lastName || ''}`.trim();
  }
  return `${adminForm.value.firstName} ${adminForm.value.lastName}`.trim();
});

// Step 4 is valid when payment is completed (or not required)
const step4Valid = computed(() => {
  return !paymentRequired.value || paymentCompleted.value;
});

// Get the next step based on current mode
const getNextStep = (current: number): number => {
  if (current === 1) {
    // After org info
    if (props.betaMode) {
      // Beta mode skips plan selection
      return props.isLoggedIn ? 4 : 3; // Skip to payment or account details
    }
    return 2; // Go to plan selection
  }
  if (current === 2) {
    // After plan selection
    return props.isLoggedIn ? 4 : 3; // Skip to payment or account details
  }
  if (current === 3) {
    // After account details - always go to payment if required
    return 4;
  }
  return current + 1;
};

// Get the previous step based on current mode
const getPrevStep = (current: number): number => {
  if (current === 4) {
    // Going back from payment
    if (props.isLoggedIn) {
      return props.betaMode ? 1 : 2; // Skip account details for logged in users
    }
    return 3; // Go to account details
  }
  if (current === 3) {
    // Going back from account details
    return props.betaMode ? 1 : 2;
  }
  if (current === 2) {
    return 1;
  }
  return current - 1;
};

// Navigation
const nextStep = async () => {
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

  const nextStepNumber = getNextStep(currentStep.value);

  // If going to payment step
  if (nextStepNumber === 4) {
    if (paymentRequired.value) {
      // Save setup data before going to payment step
      loading.value = true;
      try {
        await saveSetupDataForPayment();
        currentStep.value = 4;
      } catch (err) {
        toast.error("Failed to prepare payment. Please try again.");
        console.error('Error saving setup data:', err);
      } finally {
        loading.value = false;
      }
    } else {
      // No payment required, submit directly
      handleSubmit();
    }
  } else {
    currentStep.value = nextStepNumber;
  }
};

const prevStep = () => {
  currentStep.value = getPrevStep(currentStep.value);
};

// Save setup data to sessionStorage AND server before payment is initiated
// This is needed because Stripe redirects to a new page after payment
// Server-side storage provides a fallback if sessionStorage is cleared during redirect
const saveSetupDataForPayment = async () => {
  const setupData: Record<string, any> = {
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

    // Subscription details
    billingCycle: billingCycle.value,
    stripePriceId: stripePriceId.value,
    trialDays: trialDays.value,

    // Redirect destination after setup is complete
    redirectTo: props.redirectTo,

    // Flag for logged-in user flow
    isLoggedIn: props.isLoggedIn,
  };

  // Only include admin details if not logged in
  if (!props.isLoggedIn) {
    setupData.firstName = adminForm.value.firstName;
    setupData.lastName = adminForm.value.lastName;
    setupData.email = adminForm.value.email;
    setupData.phone = adminForm.value.phone;
    setupData.password = adminForm.value.password;
  }

  // Save to sessionStorage as primary storage
  sessionStorage.setItem('pendingSetupData', JSON.stringify(setupData));

  // Also save to server as fallback (in case sessionStorage is cleared during Stripe redirect)
  try {
    const response = await $fetch<{ token: string }>('/api/hoa/pending-setup', {
      method: 'POST',
      body: setupData,
    });
    pendingSetupToken.value = response.token;
  } catch (err) {
    console.error('Failed to save pending setup data to server:', err);
    // Continue anyway - sessionStorage might still work
  }
};

// Computed return URL for Stripe payment - points to setup completion page
// Includes the pending setup token as a query parameter for server-side fallback
const setupPaymentReturnUrl = computed(() => {
  if (typeof window !== 'undefined') {
    const baseUrl = `${window.location.origin}/setup/complete`;
    if (pendingSetupToken.value) {
      return `${baseUrl}?setup_token=${pendingSetupToken.value}`;
    }
    return baseUrl;
  }
  return '/setup/complete';
});

// Subscription payment handlers
const handleSubscriptionSuccess = (data: {
  subscriptionId: string;
  customerId: string;
  status: string;
  trialEnd: string | null
}) => {
  subscriptionId.value = data.subscriptionId;
  customerId.value = data.customerId;
  subscriptionStatus.value = data.status;
  trialEndDate.value = data.trialEnd;
  paymentCompleted.value = true;

  const message = data.trialEnd
    ? `Your ${trialDays.value}-day free trial has started!`
    : "Subscription created successfully!";

  toast.success(message, {
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
    const requestBody: Record<string, any> = {
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

      // Subscription details
      billingCycle: billingCycle.value,
      stripeSubscriptionId: subscriptionId.value,
      stripeCustomerId: customerId.value,
      subscriptionStatus: subscriptionStatus.value,
      trialEndsAt: trialEndDate.value,

      // Flag for logged-in user flow
      isLoggedIn: props.isLoggedIn,
    };

    // Only include admin details if not logged in
    if (!props.isLoggedIn) {
      requestBody.firstName = adminForm.value.firstName;
      requestBody.lastName = adminForm.value.lastName;
      requestBody.email = adminForm.value.email;
      requestBody.phone = adminForm.value.phone;
      requestBody.password = adminForm.value.password;
    }

    const response = await $fetch("/api/hoa/setup-organization", {
      method: "POST",
      body: requestBody,
    });

    const message = trialEndDate.value
      ? "Your free trial has started!"
      : "Your organization has been set up successfully.";

    toast.success("Welcome aboard!", {
      description: message,
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
// Beta + logged in: 1 (Org Info), 4 (Payment - if required)
// Beta + guest: 1 (Org Info), 3 (Account Details), 4 (Payment - if required)
// Non-beta + logged in: 1, 2, 4
// Non-beta + guest: 1, 2, 3, 4
const visibleSteps = computed(() => {
  let steps: number[];

  if (props.betaMode) {
    steps = props.isLoggedIn ? [1] : [1, 3];
  } else {
    steps = props.isLoggedIn ? [1, 2] : [1, 2, 3];
  }

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
      <div v-if="currentStep === 2 && !betaMode" class="space-y-6">
        <h3 class="text-lg font-semibold">Choose Your Plan</h3>

        <!-- Billing Cycle Toggle -->
        <div class="flex justify-center">
          <div class="inline-flex rounded-lg border p-1">
            <button
              type="button"
              @click="billingCycle = 'monthly'"
              class="px-4 py-2 rounded-md transition-colors"
              :class="billingCycle === 'monthly'
                ? 'bg-primary text-primary-foreground'
                : 'hover:bg-muted'"
            >
              Monthly
            </button>
            <button
              type="button"
              @click="billingCycle = 'yearly'"
              class="px-4 py-2 rounded-md transition-colors relative"
              :class="billingCycle === 'yearly'
                ? 'bg-primary text-primary-foreground'
                : 'hover:bg-muted'"
            >
              Yearly
              <span class="absolute -top-2 -right-2 bg-green-500 text-white text-xs px-2 py-0.5 rounded-full">
                Save 17%
              </span>
            </button>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div
            v-for="plan in subscriptionPlans"
            :key="plan.id"
            class="border rounded-lg p-4 cursor-pointer transition-all relative"
            :class="[
              selectedPlan === plan.id
                ? 'border-primary bg-primary/5 ring-2 ring-primary'
                : 'hover:border-primary/50',
              plan.is_featured ? 'border-primary' : '',
            ]"
            @click="selectedPlan = plan.id"
          >
            <!-- Featured Badge -->
            <div
              v-if="plan.is_featured"
              class="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-primary text-primary-foreground px-3 py-1 rounded-full text-xs font-semibold"
            >
              Most Popular
            </div>

            <div class="flex items-start justify-between mb-2">
              <h4 class="font-semibold">{{ plan.name }}</h4>
              <Checkbox
                :checked="selectedPlan === plan.id"
                @update:checked="() => (selectedPlan = plan.id)"
              />
            </div>

            <p class="text-2xl font-bold mb-2">
              ${{ billingCycle === 'yearly' ? plan.price_yearly : plan.price_monthly }}
              <span class="text-sm font-normal text-muted-foreground"
                >/{{ billingCycle === 'yearly' ? 'year' : 'month' }}</span
              >
            </p>

            <!-- Trial Badge -->
            <div
              v-if="plan.trial_days && plan.trial_days > 0"
              class="inline-flex items-center gap-1 text-sm text-blue-600 bg-blue-50 px-2 py-1 rounded mb-2"
            >
              <Icon name="lucide:gift" class="w-3 h-3" />
              {{ plan.trial_days }}-day free trial
            </div>

            <p class="text-sm text-muted-foreground mb-3">
              {{ plan.description }}
            </p>

            <ul class="space-y-1">
              <li
                v-for="(feature, idx) in (plan.features as string[] || [])"
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

      <!-- Step 4: Payment / Subscription -->
      <div v-if="currentStep === 4" class="space-y-4">
        <h3 class="text-lg font-semibold">
          {{ hasFreeTrial ? 'Start Your Free Trial' : 'Complete Payment' }}
        </h3>
        <p class="text-sm text-muted-foreground mb-4">
          <template v-if="hasFreeTrial">
            Start your {{ trialDays }}-day free trial of {{ selectedPlanObject?.name }}.
            Your card won't be charged until the trial ends.
          </template>
          <template v-else>
            Complete your payment to activate your {{ selectedPlanObject?.name }} subscription.
          </template>
        </p>

        <!-- Plan Summary -->
        <div class="bg-muted/50 rounded-lg p-4 mb-4">
          <div class="flex justify-between items-center">
            <div>
              <p class="font-medium">{{ selectedPlanObject?.name }}</p>
              <p class="text-sm text-muted-foreground">
                Billed {{ billingCycle === 'yearly' ? 'annually' : 'monthly' }}
              </p>
            </div>
            <div class="text-right">
              <p class="text-lg font-bold">${{ planPrice }}</p>
              <p class="text-sm text-muted-foreground">
                /{{ billingCycle === 'yearly' ? 'year' : 'month' }}
              </p>
            </div>
          </div>
          <div v-if="hasFreeTrial" class="mt-2 pt-2 border-t">
            <p class="text-sm text-blue-600">
              <Icon name="lucide:gift" class="w-3 h-3 inline mr-1" />
              {{ trialDays }}-day free trial - You won't be charged today
            </p>
          </div>
        </div>

        <PaymentSubscriptionForm
          v-if="stripePriceId"
          :email="paymentEmail"
          :name="paymentName"
          :price-id="stripePriceId"
          :trial-days="trialDays"
          :plan-name="selectedPlanObject?.name || 'Subscription'"
          :plan-price="planPrice"
          :billing-cycle="billingCycle"
          :metadata="{
            organization_name: orgForm.organizationName,
            subscription_plan_id: selectedPlan,
            slug: orgForm.slug,
          }"
          :return-url="setupPaymentReturnUrl"
          @success="handleSubscriptionSuccess"
          @error="handlePaymentError"
        />

        <div v-else class="text-center text-red-500">
          <p>Unable to load payment form. Please go back and select a plan.</p>
        </div>
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

      <!-- Steps 1 and 2: Show Continue button -->
      <Button
        v-if="currentStep === 1 || currentStep === 2"
        @click="nextStep"
        :disabled="loading || (currentStep === 1 && !step1Valid) || (currentStep === 2 && !step2Valid)"
      >
        {{ loading ? "Loading..." : "Continue" }}
      </Button>

      <!-- Step 3: Show "Continue to Payment" if payment required, otherwise "Complete Setup" -->
      <Button
        v-else-if="currentStep === 3 && !isLoggedIn"
        @click="nextStep"
        :disabled="loading || !step3Valid"
      >
        {{ loading ? "Setting up..." : (paymentRequired ? "Continue to Payment" : "Complete Setup") }}
      </Button>

      <!-- Step 4: No button needed - SubscriptionForm handles submission -->
      <!-- Show a loading indicator if payment was successful and we're creating the org -->
      <div v-else-if="currentStep === 4 && loading" class="flex items-center gap-2 text-muted-foreground">
        <div class="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
        <span>Creating your organization...</span>
      </div>
    </CardFooter>
  </Card>
</template>
