import type { Ref } from 'vue';

export interface PaymentIntentRequest {
	amount: number; // Amount in cents
	email: string;
	paymentType?: 'card' | 'us_bank_account';
	organizationId?: string;
	memberId?: string;
	paymentRequestId?: string;
	description?: string;
	metadata?: Record<string, any>;
}

export interface PaymentIntentResponse {
	clientSecret: string;
	id: string;
	amount: number;
	currency: string;
}

export const useStripePayment = () => {
	const isProcessing = ref(false);
	const error = ref<Error | null>(null);

	/**
	 * Create a payment intent
	 */
	const createPaymentIntent = async (request: PaymentIntentRequest): Promise<PaymentIntentResponse | null> => {
		isProcessing.value = true;
		error.value = null;

		try {
			const response = await $fetch<PaymentIntentResponse>('/api/stripe/paymentintent', {
				method: 'POST',
				body: request,
			});

			return response;
		} catch (err: any) {
			error.value = err;
			console.error('Failed to create payment intent:', err);
			return null;
		} finally {
			isProcessing.value = false;
		}
	};

	/**
	 * Calculate Stripe processing fee
	 * @param amount Amount in dollars
	 * @param paymentType Payment method type
	 */
	const calculateProcessingFee = (amount: number, paymentType: 'card' | 'us_bank_account' = 'card'): number => {
		if (paymentType === 'us_bank_account') {
			return 0; // Bank transfers have no fee
		}
		// Card fee: 2.9% + $0.30
		return Number((amount * 0.029 + 0.3).toFixed(2));
	};

	/**
	 * Calculate total amount including fees
	 * @param amount Original amount in dollars
	 * @param paymentType Payment method type
	 */
	const calculateTotalWithFees = (amount: number, paymentType: 'card' | 'us_bank_account' = 'card'): number => {
		const fee = calculateProcessingFee(amount, paymentType);
		return Number((amount + fee).toFixed(2));
	};

	/**
	 * Convert dollars to cents for Stripe
	 * @param amount Amount in dollars
	 */
	const dollarsToCents = (amount: number): number => {
		return Math.round(amount * 100);
	};

	/**
	 * Convert cents to dollars from Stripe
	 * @param amount Amount in cents
	 */
	const centsToDollars = (amount: number): number => {
		return Number((amount / 100).toFixed(2));
	};

	/**
	 * Format amount as currency string
	 * @param amount Amount in dollars
	 * @param currency Currency code (default: USD)
	 */
	const formatCurrency = (amount: number, currency: string = 'USD'): string => {
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: currency,
		}).format(amount);
	};

	return {
		isProcessing: readonly(isProcessing),
		error: readonly(error),
		createPaymentIntent,
		calculateProcessingFee,
		calculateTotalWithFees,
		dollarsToCents,
		centsToDollars,
		formatCurrency,
	};
};
