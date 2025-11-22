<template>
	<form id="payment-form" @submit.prevent="handleSubmit">
		<!-- Error Alert -->
		<div v-if="error" class="mb-4 rounded-md border border-red-500 bg-red-50 p-4 dark:bg-red-900/20">
			<div class="flex items-start">
				<Icon name="heroicons:exclamation-circle" class="h-5 w-5 text-red-500 mt-0.5 mr-3" />
				<div>
					<h3 class="text-sm font-medium text-red-800 dark:text-red-300">{{ error.title }}</h3>
					<p class="mt-1 text-sm text-red-700 dark:text-red-400">{{ error.message }}</p>
				</div>
			</div>
		</div>

		<!-- Loading State -->
		<div v-if="isElementLoading" class="w-full flex justify-center items-center py-12">
			<div class="flex items-center space-x-2">
				<div class="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-900 dark:border-gray-100"></div>
				<span class="text-sm text-gray-600 dark:text-gray-400">Loading payment form...</span>
			</div>
		</div>

		<!-- Stripe Payment Element -->
		<div v-show="!isElementLoading">
			<div id="payment-element" class="mb-6" />

			<div class="mt-6 space-y-4">
				<Button type="submit" class="w-full" :disabled="!isElementReady || isSubmitting">
					<Icon v-if="!isSubmitting" name="heroicons:lock-closed" class="mr-2 h-4 w-4" />
					<div v-if="isSubmitting" class="flex items-center">
						<div class="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
						Processing Payment...
					</div>
					<span v-else>{{ submitButtonText }}</span>
				</Button>

				<p v-if="isElementReady" class="text-xs text-gray-500 dark:text-gray-400 text-center">
					<Icon name="heroicons:shield-check" class="inline-block w-4 h-4 mr-1" />
					Secure payment processed by Stripe
				</p>
			</div>
		</div>
	</form>
</template>

<script setup lang="ts">
import { loadStripe } from '@stripe/stripe-js';
import type { Stripe, StripeElements } from '@stripe/stripe-js';

const props = defineProps({
	paymentType: {
		type: String as PropType<'card' | 'us_bank_account'>,
		default: null,
		validator: (value: string) => ['card', 'us_bank_account'].includes(value),
	},
	email: {
		type: String,
		required: true,
		validator: (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
	},
	amount: {
		type: [Number, String],
		required: true,
		validator: (value: number | string) => Number(value) > 0,
	},
	metadata: {
		type: Object as PropType<Record<string, any>>,
		default: () => ({}),
	},
	returnUrl: {
		type: String,
		default: null,
	},
});

const emit = defineEmits<{
	success: [paymentIntentId: string];
	error: [error: Error];
}>();

const config = useRuntimeConfig();

// State
const isElementLoading = ref(true);
const isElementReady = ref(false);
const isSubmitting = ref(false);
const error = ref<{ title: string; message: string } | null>(null);

let stripe: Stripe | null = null;
let elements: StripeElements | null = null;

// Computed
const submitButtonText = computed(() => {
	if (isSubmitting.value) return `Processing Payment...`;
	return `Pay ${formatAmount(Number(props.amount))}`;
});

const defaultReturnUrl = computed(() => {
	return props.returnUrl || `${window.location.origin}/payment/confirmation`;
});

// Methods
const formatAmount = (amount: number) => {
	return new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: 'USD',
	}).format(amount / 100);
};

const handleError = (message: string, err: any = null) => {
	console.error('Payment Error:', err || message);
	error.value = {
		title: 'Payment Error',
		message: message,
	};
	isSubmitting.value = false;
	emit('error', err || new Error(message));
};

const createPaymentIntent = async () => {
	try {
		const data = await $fetch('/api/stripe/paymentintent', {
			method: 'POST',
			body: {
				amount: props.amount,
				email: props.email,
				paymentType: props.paymentType,
				...props.metadata,
			},
		});

		console.log('Payment Intent Response:', data);
		return data;
	} catch (err: any) {
		console.error('Payment Intent Error:', err);
		handleError(err.message || 'Failed to create payment intent', err);
		throw err;
	}
};

const setupStripeElement = async (clientSecret: string) => {
	if (!clientSecret) {
		throw new Error('Missing client secret for Stripe Elements');
	}

	if (!stripe) {
		throw new Error('Stripe not initialized');
	}

	try {
		const options = {
			clientSecret,
			appearance: {
				variables: {
					colorPrimary: '#502989',
					colorBackground: '#ffffff',
					colorText: '#502989',
					colorDanger: '#df1b41',
					fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
					borderRadius: '8px',
					spacingUnit: '4px',
				},
				rules: {
					'.Label': {
						textTransform: 'uppercase' as const,
						letterSpacing: '0.05em',
						fontSize: '12px',
						fontWeight: '600',
						marginBottom: '8px',
					},
					'.Input': {
						padding: '12px',
						fontSize: '14px',
						border: '1px solid #d1d5db',
					},
					'.Input:focus': {
						borderColor: '#502989',
						boxShadow: '0 0 0 3px rgba(80, 41, 137, 0.1)',
					},
					'.Error': {
						fontSize: '12px',
						marginTop: '4px',
					},
				},
			},
			fields: {
				billingDetails: {
					email: props.email,
				},
			},
		};

		elements = stripe.elements(options);
		const paymentElement = elements.create('payment');

		paymentElement.on('ready', () => {
			isElementReady.value = true;
			isElementLoading.value = false;
		});

		paymentElement.on('change', (event) => {
			if (event.error) {
				handleError(event.error.message);
			} else {
				error.value = null;
			}
		});

		paymentElement.mount('#payment-element');
	} catch (err: any) {
		handleError('Failed to setup payment form', err);
		throw err;
	}
};

const handleSubmit = async () => {
	try {
		if (!stripe || !elements) {
			throw new Error('Stripe not initialized');
		}

		if (isSubmitting.value) {
			return;
		}

		error.value = null;
		isSubmitting.value = true;

		const { error: stripeError } = await stripe.confirmPayment({
			elements,
			confirmParams: {
				return_url: defaultReturnUrl.value,
				payment_method_data: {
					billing_details: {
						email: props.email,
					},
				},
			},
		});

		if (stripeError) {
			throw stripeError;
		}
	} catch (err: any) {
		handleError(err.message || 'Payment failed', err);
	}
};

// Initialize
onMounted(async () => {
	try {
		// Initialize Stripe
		const publicKey = config.public.stripePublicKey;
		if (!publicKey) {
			throw new Error('Stripe public key not configured');
		}

		console.log('Initializing Stripe...');
		stripe = await loadStripe(publicKey);
		if (!stripe) {
			throw new Error('Failed to load Stripe');
		}

		// Create payment intent and get client secret
		const paymentIntent = await createPaymentIntent();

		// Setup Stripe Elements with client secret
		await setupStripeElement(paymentIntent.clientSecret);
	} catch (err: any) {
		isElementLoading.value = false;
		handleError('Payment setup failed', err);
	}
});

// Cleanup
onBeforeUnmount(() => {
	if (elements) {
		const paymentElement = elements.getElement('payment');
		paymentElement?.destroy();
	}
});
</script>

<style scoped>
#payment-form {
	width: 100%;
	max-width: 600px;
	margin: 0 auto;
}

#payment-element {
	min-height: 100px;
}

/* Dark mode support */
:deep(.dark) #payment-element {
	color-scheme: dark;
}
</style>
