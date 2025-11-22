<template>
	<div class="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
		<div class="max-w-md w-full space-y-8">
			<!-- Loading State -->
			<div v-if="isLoading" class="text-center">
				<div class="animate-spin rounded-full h-16 w-16 border-b-4 border-purple-600 mx-auto mb-4"></div>
				<h2 class="text-xl font-semibold text-gray-900 dark:text-gray-100">Processing your payment...</h2>
				<p class="mt-2 text-sm text-gray-600 dark:text-gray-400">Please wait while we confirm your payment.</p>
			</div>

			<!-- Success State -->
			<div v-else-if="paymentStatus === 'succeeded'" class="text-center">
				<div class="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-green-100 dark:bg-green-900 mb-4">
					<Icon name="heroicons:check-circle" class="h-10 w-10 text-green-600 dark:text-green-400" />
				</div>
				<h2 class="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">Payment Successful!</h2>
				<p class="text-gray-600 dark:text-gray-400 mb-6">
					Your payment of <strong>{{ formatCurrency(paymentAmount) }}</strong> has been processed successfully.
				</p>

				<div v-if="paymentIntent" class="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6 text-left">
					<h3 class="text-sm font-semibold text-gray-900 dark:text-gray-100 uppercase tracking-wide mb-4">
						Payment Details
					</h3>
					<dl class="space-y-3">
						<div class="flex justify-between text-sm">
							<dt class="text-gray-600 dark:text-gray-400">Transaction ID:</dt>
							<dd class="text-gray-900 dark:text-gray-100 font-mono text-xs">{{ paymentIntent.id }}</dd>
						</div>
						<div class="flex justify-between text-sm">
							<dt class="text-gray-600 dark:text-gray-400">Amount:</dt>
							<dd class="text-gray-900 dark:text-gray-100 font-semibold">{{ formatCurrency(paymentAmount) }}</dd>
						</div>
						<div class="flex justify-between text-sm">
							<dt class="text-gray-600 dark:text-gray-400">Status:</dt>
							<dd>
								<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
									Paid
								</span>
							</dd>
						</div>
						<div v-if="receiptUrl" class="flex justify-between text-sm">
							<dt class="text-gray-600 dark:text-gray-400">Receipt:</dt>
							<dd>
								<a :href="receiptUrl" target="_blank" class="text-purple-600 hover:text-purple-800 dark:text-purple-400 dark:hover:text-purple-300 underline">
									View Receipt
								</a>
							</dd>
						</div>
					</dl>
				</div>

				<div class="space-y-3">
					<Button @click="goToDashboard" class="w-full">
						<Icon name="heroicons:home" class="mr-2 h-4 w-4" />
						Go to Dashboard
					</Button>
					<Button @click="goBack" variant="outline" class="w-full">
						Back
					</Button>
				</div>

				<p class="mt-6 text-xs text-gray-500 dark:text-gray-400 text-center">
					A confirmation email has been sent to {{ paymentIntent?.receipt_email }}
				</p>
			</div>

			<!-- Processing State -->
			<div v-else-if="paymentStatus === 'processing'" class="text-center">
				<div class="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-blue-100 dark:bg-blue-900 mb-4">
					<Icon name="heroicons:clock" class="h-10 w-10 text-blue-600 dark:text-blue-400" />
				</div>
				<h2 class="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">Payment Processing</h2>
				<p class="text-gray-600 dark:text-gray-400 mb-6">
					Your payment is being processed. This may take a few moments.
				</p>
				<Button @click="checkPaymentStatus" variant="outline">
					<Icon name="heroicons:arrow-path" class="mr-2 h-4 w-4" />
					Check Status
				</Button>
			</div>

			<!-- Failed State -->
			<div v-else-if="paymentStatus === 'failed'" class="text-center">
				<div class="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-red-100 dark:bg-red-900 mb-4">
					<Icon name="heroicons:x-circle" class="h-10 w-10 text-red-600 dark:text-red-400" />
				</div>
				<h2 class="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">Payment Failed</h2>
				<p class="text-gray-600 dark:text-gray-400 mb-6">
					{{ errorMessage || 'Your payment could not be processed. Please try again.' }}
				</p>

				<div class="space-y-3">
					<Button @click="tryAgain" class="w-full">
						<Icon name="heroicons:arrow-path" class="mr-2 h-4 w-4" />
						Try Again
					</Button>
					<Button @click="goBack" variant="outline" class="w-full">
						Back
					</Button>
				</div>
			</div>

			<!-- Canceled State -->
			<div v-else-if="paymentStatus === 'canceled'" class="text-center">
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
					<Button @click="goBack" variant="outline" class="w-full">
						Back
					</Button>
				</div>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { loadStripe } from '@stripe/stripe-js';

const route = useRoute();
const router = useRouter();
const config = useRuntimeConfig();
const { formatCurrency } = useStripePayment();

// State
const isLoading = ref(true);
const paymentStatus = ref<'succeeded' | 'processing' | 'failed' | 'canceled' | null>(null);
const paymentIntent = ref<any>(null);
const paymentAmount = ref(0);
const receiptUrl = ref<string | null>(null);
const errorMessage = ref<string | null>(null);

// Check payment status on mount
onMounted(async () => {
	const clientSecret = route.query.payment_intent_client_secret as string;
	const paymentIntentId = route.query.payment_intent as string;
	const redirectStatus = route.query.redirect_status as string;

	if (!clientSecret || !paymentIntentId) {
		paymentStatus.value = 'failed';
		errorMessage.value = 'Invalid payment confirmation link.';
		isLoading.value = false;
		return;
	}

	try {
		// Initialize Stripe
		const publicKey = config.public.stripePublicKey;
		if (!publicKey) {
			throw new Error('Stripe not configured');
		}

		const stripe = await loadStripe(publicKey);
		if (!stripe) {
			throw new Error('Failed to load Stripe');
		}

		// Retrieve payment intent
		const { paymentIntent: pi, error } = await stripe.retrievePaymentIntent(clientSecret);

		if (error) {
			throw error;
		}

		if (pi) {
			paymentIntent.value = pi;
			paymentAmount.value = pi.amount;
			paymentStatus.value = pi.status as any;

			// Get receipt URL if available
			if (pi.latest_charge) {
				try {
					// Fetch charge details to get receipt URL
					const chargeId = typeof pi.latest_charge === 'string' ? pi.latest_charge : pi.latest_charge.id;
					receiptUrl.value = `https://pay.stripe.com/receipts/${chargeId}`;
				} catch (err) {
					console.error('Error fetching receipt:', err);
				}
			}
		}
	} catch (err: any) {
		console.error('Error retrieving payment intent:', err);
		paymentStatus.value = 'failed';
		errorMessage.value = err.message || 'Failed to retrieve payment information.';
	} finally {
		isLoading.value = false;
	}
});

// Methods
const checkPaymentStatus = () => {
	window.location.reload();
};

const tryAgain = () => {
	router.back();
};

const goBack = () => {
	router.back();
};

const goToDashboard = () => {
	router.push('/dashboard');
};

// Set page meta
definePageMeta({
	layout: 'default',
	middleware: 'auth',
});

useSeoMeta({
	title: 'Payment Confirmation',
	description: 'Confirm your payment transaction',
});
</script>
