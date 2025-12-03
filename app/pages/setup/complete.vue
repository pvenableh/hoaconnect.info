<template>
  <div class="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
    <div class="max-w-md w-full space-y-8">
      <!-- Loading State -->
      <div v-if="isLoading" class="text-center">
        <div class="animate-spin rounded-full h-16 w-16 border-b-4 border-purple-600 mx-auto mb-4"></div>
        <h2 class="text-xl font-semibold text-gray-900 dark:text-gray-100">{{ loadingMessage }}</h2>
        <p class="mt-2 text-sm text-gray-600 dark:text-gray-400">Please wait while we complete your setup.</p>
      </div>

      <!-- Success State -->
      <div v-else-if="setupStatus === 'succeeded'" class="text-center">
        <div class="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-green-100 dark:bg-green-900 mb-4">
          <Icon name="heroicons:check-circle" class="h-10 w-10 text-green-600 dark:text-green-400" />
        </div>
        <h2 class="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">Welcome to Your New HOA Portal!</h2>
        <p class="text-gray-600 dark:text-gray-400 mb-6">
          Your payment of <strong>{{ formatCurrency(paymentAmount) }}</strong> has been processed and your organization is ready.
        </p>

        <div v-if="organizationName" class="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6 text-left">
          <h3 class="text-sm font-semibold text-gray-900 dark:text-gray-100 uppercase tracking-wide mb-4">
            Setup Details
          </h3>
          <dl class="space-y-3">
            <div class="flex justify-between text-sm">
              <dt class="text-gray-600 dark:text-gray-400">Organization:</dt>
              <dd class="text-gray-900 dark:text-gray-100 font-semibold">{{ organizationName }}</dd>
            </div>
            <div v-if="paymentIntentId" class="flex justify-between text-sm">
              <dt class="text-gray-600 dark:text-gray-400">Transaction ID:</dt>
              <dd class="text-gray-900 dark:text-gray-100 font-mono text-xs">{{ paymentIntentId }}</dd>
            </div>
            <div class="flex justify-between text-sm">
              <dt class="text-gray-600 dark:text-gray-400">Amount:</dt>
              <dd class="text-gray-900 dark:text-gray-100 font-semibold">{{ formatCurrency(paymentAmount) }}</dd>
            </div>
            <div class="flex justify-between text-sm">
              <dt class="text-gray-600 dark:text-gray-400">Status:</dt>
              <dd>
                <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                  Complete
                </span>
              </dd>
            </div>
          </dl>
        </div>

        <div class="space-y-3">
          <Button @click="goToDashboard" class="w-full">
            <Icon name="heroicons:home" class="mr-2 h-4 w-4" />
            Go to Dashboard
          </Button>
        </div>

        <p class="mt-6 text-xs text-gray-500 dark:text-gray-400 text-center">
          A confirmation email has been sent to {{ userEmail }}
        </p>
      </div>

      <!-- Processing State -->
      <div v-else-if="setupStatus === 'processing'" class="text-center">
        <div class="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-blue-100 dark:bg-blue-900 mb-4">
          <Icon name="heroicons:clock" class="h-10 w-10 text-blue-600 dark:text-blue-400" />
        </div>
        <h2 class="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">Payment Processing</h2>
        <p class="text-gray-600 dark:text-gray-400 mb-6">
          Your payment is being processed. This may take a few moments.
        </p>
        <Button @click="checkStatus" variant="outline">
          <Icon name="heroicons:arrow-path" class="mr-2 h-4 w-4" />
          Check Status
        </Button>
      </div>

      <!-- Failed State -->
      <div v-else-if="setupStatus === 'failed'" class="text-center">
        <div class="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-red-100 dark:bg-red-900 mb-4">
          <Icon name="heroicons:x-circle" class="h-10 w-10 text-red-600 dark:text-red-400" />
        </div>
        <h2 class="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">Setup Failed</h2>
        <p class="text-gray-600 dark:text-gray-400 mb-6">
          {{ errorMessage || 'We could not complete your setup. Please try again.' }}
        </p>

        <div class="space-y-3">
          <Button @click="tryAgain" class="w-full">
            <Icon name="heroicons:arrow-path" class="mr-2 h-4 w-4" />
            Try Again
          </Button>
          <Button @click="goToSetup" variant="outline" class="w-full">
            Start Over
          </Button>
        </div>
      </div>

      <!-- Canceled State -->
      <div v-else-if="setupStatus === 'canceled'" class="text-center">
        <div class="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-gray-100 dark:bg-gray-800 mb-4">
          <Icon name="heroicons:x-mark" class="h-10 w-10 text-gray-600 dark:text-gray-400" />
        </div>
        <h2 class="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">Payment Canceled</h2>
        <p class="text-gray-600 dark:text-gray-400 mb-6">
          You have canceled the payment. No charges were made to your account.
        </p>

        <div class="space-y-3">
          <Button @click="tryAgain" class="w-full">
            Try Again
          </Button>
          <Button @click="goToSetup" variant="outline" class="w-full">
            Start Over
          </Button>
        </div>
      </div>

      <!-- No Setup Data State -->
      <div v-else-if="setupStatus === 'no_data'" class="text-center">
        <div class="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-yellow-100 dark:bg-yellow-900 mb-4">
          <Icon name="heroicons:exclamation-triangle" class="h-10 w-10 text-yellow-600 dark:text-yellow-400" />
        </div>
        <h2 class="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">Session Expired</h2>
        <p class="text-gray-600 dark:text-gray-400 mb-6">
          Your setup session has expired. Please start the setup process again.
        </p>

        <Button @click="goToSetup" class="w-full">
          Start Setup
        </Button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { loadStripe } from '@stripe/stripe-js';

const route = useRoute();
const router = useRouter();
const config = useRuntimeConfig();
const session = useUserSession();
const { formatCurrency } = useStripePayment();

// State
const isLoading = ref(true);
const loadingMessage = ref('Verifying payment...');
const setupStatus = ref<'succeeded' | 'processing' | 'failed' | 'canceled' | 'no_data' | null>(null);
const paymentAmount = ref(0);
const paymentIntentId = ref<string | null>(null);
const organizationName = ref<string | null>(null);
const userEmail = ref<string | null>(null);
const errorMessage = ref<string | null>(null);
const redirectTo = ref('/dashboard');

// Process setup on mount
onMounted(async () => {
  const clientSecret = route.query.payment_intent_client_secret as string;
  const intentId = route.query.payment_intent as string;
  const redirectStatus = route.query.redirect_status as string;

  // Check for payment intent params
  if (!clientSecret || !intentId) {
    setupStatus.value = 'failed';
    errorMessage.value = 'Invalid payment confirmation link.';
    isLoading.value = false;
    return;
  }

  paymentIntentId.value = intentId;

  // Retrieve setup data from sessionStorage
  const pendingDataStr = sessionStorage.getItem('pendingSetupData');
  if (!pendingDataStr) {
    setupStatus.value = 'no_data';
    isLoading.value = false;
    return;
  }

  let setupData: any;
  try {
    setupData = JSON.parse(pendingDataStr);
    organizationName.value = setupData.organizationName;
    userEmail.value = setupData.email;
    redirectTo.value = setupData.redirectTo || '/dashboard';
  } catch (e) {
    setupStatus.value = 'no_data';
    isLoading.value = false;
    return;
  }

  try {
    // Initialize Stripe to verify payment
    const publicKey = config.public.stripePublicKey;
    if (!publicKey) {
      throw new Error('Stripe not configured');
    }

    const stripe = await loadStripe(publicKey);
    if (!stripe) {
      throw new Error('Failed to load Stripe');
    }

    // Retrieve payment intent to verify status
    loadingMessage.value = 'Verifying payment...';
    const { paymentIntent, error } = await stripe.retrievePaymentIntent(clientSecret);

    if (error) {
      throw error;
    }

    if (!paymentIntent) {
      throw new Error('Payment intent not found');
    }

    paymentAmount.value = paymentIntent.amount;

    // Check payment status
    if (paymentIntent.status === 'succeeded') {
      // Payment successful - proceed to create organization
      loadingMessage.value = 'Creating your organization...';

      try {
        const response = await $fetch('/api/hoa/setup-organization', {
          method: 'POST',
          body: {
            // Organization
            organizationName: setupData.organizationName,
            street_address: setupData.street_address,
            city: setupData.city,
            state: setupData.state,
            zip: setupData.zip,
            org_phone: setupData.org_phone,
            org_email: setupData.org_email,
            slug: setupData.slug,
            subscriptionPlanId: setupData.subscriptionPlanId,

            // Admin
            firstName: setupData.firstName,
            lastName: setupData.lastName,
            email: setupData.email,
            phone: setupData.phone,
            password: setupData.password,

            // Payment
            paymentIntentId: intentId,
          },
        });

        // Clear the pending setup data
        sessionStorage.removeItem('pendingSetupData');

        // Refresh the client-side session
        await session.fetch();

        setupStatus.value = 'succeeded';
      } catch (setupErr: any) {
        console.error('Setup error:', setupErr);

        // Check if it's a duplicate organization error (user already completed setup)
        if (setupErr.data?.message?.includes('slug') || setupErr.data?.message?.includes('exists')) {
          // Organization already exists - try to log in
          try {
            await $fetch('/api/auth/login', {
              method: 'POST',
              body: {
                email: setupData.email,
                password: setupData.password,
              },
            });

            await session.fetch();
            sessionStorage.removeItem('pendingSetupData');
            setupStatus.value = 'succeeded';
          } catch (loginErr) {
            // If login fails, show success but user may need to log in
            sessionStorage.removeItem('pendingSetupData');
            setupStatus.value = 'succeeded';
          }
        } else {
          throw setupErr;
        }
      }
    } else if (paymentIntent.status === 'processing') {
      setupStatus.value = 'processing';
    } else if (paymentIntent.status === 'requires_payment_method') {
      setupStatus.value = 'failed';
      errorMessage.value = 'Payment was not completed. Please try again.';
    } else {
      setupStatus.value = 'canceled';
    }
  } catch (err: any) {
    console.error('Error completing setup:', err);
    setupStatus.value = 'failed';
    errorMessage.value = err.data?.message || err.message || 'Failed to complete setup.';
  } finally {
    isLoading.value = false;
  }
});

// Methods
const checkStatus = () => {
  window.location.reload();
};

const tryAgain = () => {
  router.push('/setup');
};

const goToSetup = () => {
  sessionStorage.removeItem('pendingSetupData');
  router.push('/setup');
};

const goToDashboard = () => {
  router.push(redirectTo.value);
};

// No auth middleware - this page handles unauthenticated users completing setup
definePageMeta({
  layout: 'default',
});

useSeoMeta({
  title: 'Setup Complete',
  description: 'Complete your HOA organization setup',
});
</script>
