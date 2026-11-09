<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { toast } from "vue-sonner";
import { useDirectusItems } from "#imports";
import type { SubscriptionPlan } from "#core/types/directus";
import { isContactOnly, selectBand } from "#core/shared/billing/bands";
import { bandAmounts, type BillingInterval, type CheckoutBand } from "#core/shared/billing/band-checkout";
import { formatCents } from "#core/shared/billing/promotion";

interface Props {
  title?: string;
  description?: string;
  redirectTo?: string;
  isLoggedIn?: boolean; // For existing users creating additional orgs
}

const props = withDefaults(defineProps<Props>(), {
  title: "Set up your HOA",
  description: "Get started by creating your organization",
  redirectTo: "/dashboard",
  isLoggedIn: false,
});

const config = useRuntimeConfig();
const session = useUserSession();
const { list: listPlans } = useDirectusItems<SubscriptionPlan>("subscription_plans", { requireAuth: false });

// Steps: 1 Org Info, 2 Size and Price, 3 Account Details (guests only), 4 Payment

// Form state
const currentStep = ref(1);
const loading = ref(false);

// The org is created once, on the way into payment, and subscribed separately.
// After that a retry or a Back press only re-subscribes it, so a second org can't
// be made and the details already saved are locked.
const createdOrgId = ref<string | null>(null);
const checkout = ref<{ clientSecret: string; amountCents: number; planName: string } | null>(null);

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

// Step 2: Size and price. The board declares its unit count and the server picks
// the band from it; the quote here runs the same selection on the same plans.
const declaredUnits = ref<string | number>("");
const interval = ref<BillingInterval>("monthly");
const intervalItems = [
  { value: "monthly", label: "Monthly" },
  { value: "annual", label: "Annual" },
];
const plans = ref<SubscriptionPlan[]>([]);

// Step 3: Admin Details
const adminForm = ref({
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  password: "",
  confirmPassword: "",
});

// Load the band ladder
const loadPlans = async () => {
  const data = await listPlans({
    filter: {
      is_active: { _eq: true },
      status: { _eq: "published" },
    },
    sort: ["sort"],
  });

  if (data) plans.value = data as SubscriptionPlan[];
};

onMounted(() => {
  loadPlans();
});

const units = computed(() => {
  const n = Number(declaredUnits.value);
  return Number.isInteger(n) && n >= 1 ? n : null;
});

const band = computed(() =>
  units.value === null ? null : selectBand(units.value, plans.value as unknown as CheckoutBand[])
);

const needsConversation = computed(() => isContactOnly(band.value));

const quote = computed(() =>
  band.value && !needsConversation.value ? bandAmounts(band.value, interval.value, true) : null
);

/** Annual saving vs twelve months, from the band's own prices. */
const annualSaving = computed(() => {
  const monthly = Number(band.value?.price_monthly);
  const yearly = Number(band.value?.price_yearly);
  if (!monthly || !yearly) return null;
  const pct = Math.round((1 - yearly / (monthly * 12)) * 100);
  return pct > 0 ? pct : null;
});

const formatPrice = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(n);

// Discount code. A link like /setup?code=SPRING fills it in, and it applies once
// there's a quote. The server checks it again when the subscription is created.
const route = useRoute();
const promoInput = ref(typeof route.query.code === "string" ? route.query.code : "");
const promo = ref<{ code: string; label: string; discountCents: number; totalCents: number } | null>(null);
const promoError = ref("");
const promoChecking = ref(false);

const applyPromo = async () => {
  const code = promoInput.value.trim();
  if (!code || units.value === null || !quote.value) return;
  promoChecking.value = true;
  try {
    const res = await $fetch<
      | { ok: true; code: string; label: string; discountCents: number; totalCents: number }
      | { ok: false; message: string }
    >("/api/stripe/promotion-preview", {
      method: "POST",
      body: { code, units: units.value, interval: interval.value },
    });
    if ("message" in res) {
      promo.value = null;
      promoError.value = res.message;
    } else {
      promo.value = { code: res.code, label: res.label, discountCents: res.discountCents, totalCents: res.totalCents };
      promoError.value = "";
    }
  } catch (err: any) {
    promo.value = null;
    promoError.value = err?.data?.message || "We couldn't check that code. Please try again.";
  } finally {
    promoChecking.value = false;
  }
};

const removePromo = () => {
  promo.value = null;
  promoInput.value = "";
  promoError.value = "";
};

// A code's discount depends on the band and the interval, so re-check it when
// either changes (and apply a code from the link once the quote exists).
watch([() => band.value?.slug, interval], () => {
  if (promoInput.value.trim() && quote.value) applyPromo();
  else promo.value = null;
});

// Validation
const step1Valid = computed(() => {
  return (
    orgForm.value.organizationName.trim().length > 0 &&
    orgForm.value.slug.trim().length > 0 &&
    slugAvailable.value === true
  );
});

const step2Valid = computed(() => quote.value !== null);

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

// The card sends the browser here itself once the payment has gone through.
const paymentReturnUrl = computed(() =>
  import.meta.client ? `${window.location.origin}${props.redirectTo}` : undefined
);

const currentStepValid = computed(() => {
  if (currentStep.value === 1) return step1Valid.value;
  if (currentStep.value === 2) return step2Valid.value;
  return step3Valid.value;
});

// Logged-in users have no account step, and neither does anyone whose org exists.
const paymentIsNext = computed(
  () => currentStep.value === 3 || (currentStep.value === 2 && (props.isLoggedIn || !!createdOrgId.value))
);

// Step 1 edits what has already been saved, so it closes once the org exists.
const canGoBack = computed(() => currentStep.value > 1 && !(currentStep.value === 2 && createdOrgId.value));

// Navigation
const nextStep = async () => {
  if (!currentStepValid.value) return;
  if (paymentIsNext.value) {
    await startCheckout();
    return;
  }
  currentStep.value += 1;
};

const prevStep = () => {
  if (currentStep.value === 4) {
    checkout.value = null;
    currentStep.value = 2;
    return;
  }
  currentStep.value -= 1;
};

const organizationBody = () => ({
  organizationName: orgForm.value.organizationName,
  street_address: orgForm.value.street_address,
  city: orgForm.value.city,
  state: orgForm.value.state,
  zip: orgForm.value.zip,
  org_phone: orgForm.value.org_phone,
  org_email: orgForm.value.org_email,
  slug: orgForm.value.slug,
  declaredUnits: units.value,
  billingCycle: interval.value === "annual" ? "yearly" : "monthly",
  isLoggedIn: props.isLoggedIn,
  ...(props.isLoggedIn
    ? {}
    : {
        firstName: adminForm.value.firstName,
        lastName: adminForm.value.lastName,
        email: adminForm.value.email,
        phone: adminForm.value.phone,
        password: adminForm.value.password,
      }),
});

/** Create the org the first time through. False if that failed. */
const ensureOrganization = async (): Promise<boolean> => {
  if (createdOrgId.value) return true;
  try {
    const created = await $fetch<{ organization: { id: string } }>("/api/hoa/setup-organization", {
      method: "POST",
      body: organizationBody(),
    });
    createdOrgId.value = created.organization.id;
    return true;
  } catch (err: any) {
    toast.error("Setup failed", {
      description: err?.data?.message || "Failed to set up organization. Please try again.",
    });
    return false;
  }
};

const subscribeOrganization = async () => {
  try {
    const res = await $fetch<{
      clientSecret: string | null;
      firstInvoiceCents: number;
      amountDueCents?: number;
      band: { name: string | null };
    }>("/api/stripe/subscribe-band", {
      method: "POST",
      body: {
        organizationId: createdOrgId.value,
        interval: interval.value,
        onboarding: "standard",
        promotionCode: promo.value?.code,
      },
    });
    if (!res?.clientSecret) throw new Error("Stripe didn't return a payment form. Please try again.");
    checkout.value = {
      clientSecret: res.clientSecret,
      amountCents: res.amountDueCents ?? res.firstInvoiceCents,
      planName: `${res.band.name || "Your plan"} · ${interval.value === "annual" ? "annual" : "monthly"}`,
    };
    currentStep.value = 4;
  } catch (err: any) {
    // The org exists now. Retrying from the price step won't create another.
    currentStep.value = 2;
    toast.error("Your community is set up, but payment couldn't start", {
      description: err?.data?.message || err?.message || "Please try again.",
    });
  }
};

const startCheckout = async () => {
  loading.value = true;
  try {
    if (await ensureOrganization()) await subscribeOrganization();
  } finally {
    loading.value = false;
  }
};

const handlePaymentError = (error: Error) => {
  toast.error("Payment failed", {
    description: error.message || "Please try again or use a different payment method.",
  });
};

const visibleSteps = computed(() => (props.isLoggedIn ? [1, 2, 4] : [1, 2, 3, 4]));

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

      <!-- Step 2: Size and Price -->
      <div v-if="currentStep === 2" class="space-y-6">
        <h3 class="text-lg font-semibold">Your Community</h3>

        <FormField name="declaredUnits">
          <FormItem>
            <FormLabel>Number of Units *</FormLabel>
            <FormControl>
              <Input
                v-model="declaredUnits"
                type="number"
                min="1"
                step="1"
                inputmode="numeric"
                placeholder="48"
                required
                :disabled="!!createdOrgId"
              />
            </FormControl>
            <FormDescription>
              <template v-if="createdOrgId">Your community has been set up with this count. Contact support to change it.</template>
              <template v-else>Your price is one flat fee for the building, set by this number.</template>
            </FormDescription>
          </FormItem>
        </FormField>

        <div v-if="needsConversation" class="bg-muted/50 rounded-lg p-4 space-y-3" data-testid="signup-contact">
          <p class="font-medium">{{ band?.name }}</p>
          <p class="text-sm text-muted-foreground">
            Communities this size are priced with us directly. Onboarding, migration and support are tailored.
          </p>
          <Button as="a" href="mailto:support@hoaconnect.info?subject=Subscription%20pricing" variant="outline">
            Talk to us
          </Button>
        </div>

        <div v-else-if="quote" class="space-y-4" data-testid="signup-quote">
          <div class="flex justify-center">
            <AppSegmentedControl v-model="interval" :items="intervalItems" size="sm" label="Billing interval" />
          </div>

          <div class="bg-muted/50 rounded-lg p-4 space-y-2">
            <div class="flex justify-between items-baseline gap-4">
              <p class="font-medium" data-testid="signup-band">{{ band?.name }}</p>
              <p>
                <span class="text-lg font-bold">{{ formatPrice(quote.periodAmount) }}</span>
                <span class="text-sm text-muted-foreground">/{{ interval === "annual" ? "year" : "month" }}</span>
              </p>
            </div>
            <p v-if="interval === 'annual' && annualSaving" class="text-sm text-muted-foreground">
              Saves {{ annualSaving }}% over monthly
            </p>
            <div v-if="quote.onboardingAmount" class="flex justify-between gap-4 text-sm">
              <span class="text-muted-foreground">One-time onboarding</span>
              <span>{{ formatPrice(quote.onboardingAmount) }}</span>
            </div>
            <div v-if="promo" class="flex justify-between gap-4 text-sm" data-testid="signup-discount">
              <span class="text-muted-foreground">{{ promo.code }} · {{ promo.label }}</span>
              <span>−{{ formatCents(promo.discountCents) }}</span>
            </div>
            <div class="flex justify-between gap-4 pt-2 border-t font-medium">
              <span>First invoice, charged today</span>
              <span data-testid="signup-first-invoice">{{
                formatCents(promo ? promo.totalCents : quote.firstInvoiceCents)
              }}</span>
            </div>
          </div>

          <div class="space-y-2" data-testid="signup-promo">
            <div v-if="promo" class="flex items-center justify-between gap-4 text-sm">
              <span>Code {{ promo.code }} applied</span>
              <Button variant="ghost" size="sm" @click="removePromo">Remove</Button>
            </div>
            <div v-else class="flex gap-2">
              <Input
                v-model="promoInput"
                placeholder="Discount code"
                aria-label="Discount code"
                autocomplete="off"
                class="flex-1"
                @keydown.enter.prevent="applyPromo"
              />
              <Button variant="outline" :disabled="!promoInput.trim() || promoChecking" @click="applyPromo">
                {{ promoChecking ? "Checking..." : "Apply" }}
              </Button>
            </div>
            <p v-if="promoError" class="text-sm text-destructive" data-testid="signup-promo-error">{{ promoError }}</p>
          </div>
        </div>

        <p v-else-if="units !== null" class="text-sm text-muted-foreground">
          We couldn't load pricing. Refresh the page, or contact support@hoaconnect.info.
        </p>
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
        <p class="text-sm text-muted-foreground">
          Your card is charged today and your subscription starts right away.
        </p>

        <div class="bg-muted/50 rounded-lg p-4 flex justify-between items-center gap-4">
          <p class="font-medium">{{ checkout?.planName }}</p>
          <p class="text-lg font-bold">{{ formatCents(checkout?.amountCents ?? 0) }}</p>
        </div>

        <PaymentStripeCard
          v-if="checkout"
          :key="checkout.clientSecret"
          :client-secret="checkout.clientSecret"
          :email="paymentEmail"
          :amount="checkout.amountCents"
          payment-type="card"
          :return-url="paymentReturnUrl"
          @error="handlePaymentError"
        />
      </div>
    </CardContent>

    <CardFooter class="flex justify-between">
      <Button
        v-if="canGoBack"
        variant="outline"
        @click="prevStep"
        :disabled="loading"
      >
        Back
      </Button>

      <div class="flex-1" />

      <!-- Step 4 has none: the card's own button pays. -->
      <Button
        v-if="currentStep !== 4"
        @click="nextStep"
        :disabled="loading || !currentStepValid"
      >
        {{ loading ? "Setting up..." : (paymentIsNext ? "Continue to Payment" : "Continue") }}
      </Button>
    </CardFooter>
  </Card>
</template>
