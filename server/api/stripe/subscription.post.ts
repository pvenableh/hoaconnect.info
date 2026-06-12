import Stripe from 'stripe';
import { z } from 'zod';

// Validation schema for subscription creation
const subscriptionSchema = z.object({
	email: z.string().email(),
	name: z.string().optional(),
	priceId: z.string().min(1, 'Price ID is required'),
	trialDays: z.number().int().min(0).max(365).optional(),
	metadata: z.record(z.string()).optional(),
	customerId: z.string().optional(), // Existing Stripe customer ID if available
});

export default defineEventHandler(async (event) => {
	const config = useRuntimeConfig();

	// Initialize Stripe
	const stripeSecretKey =
		process.env.NODE_ENV === 'production' ? config.stripeSecretKeyLive : config.stripeSecretKeyTest;

	if (!stripeSecretKey) {
		throw createError({
			statusCode: 500,
			message: 'Stripe secret key not configured',
		});
	}

	const stripe = new Stripe(stripeSecretKey, {
		apiVersion: '2024-11-20.acacia',
		typescript: true,
	});

	try {
		const body = await readBody(event);

		// Validate request body
		const validation = subscriptionSchema.safeParse(body);
		if (!validation.success) {
			throw createError({
				statusCode: 400,
				message: validation.error.errors.map((e) => e.message).join(', '),
			});
		}

		const { email, name, priceId, trialDays, metadata, customerId } = validation.data;

		// Get or create customer
		let customer: Stripe.Customer;

		if (customerId) {
			// Use existing customer
			customer = await stripe.customers.retrieve(customerId) as Stripe.Customer;
			if (customer.deleted) {
				throw createError({
					statusCode: 400,
					message: 'Customer has been deleted',
				});
			}
		} else {
			// Check if customer already exists with this email
			const existingCustomers = await stripe.customers.list({
				email,
				limit: 1,
			});

			if (existingCustomers.data.length > 0) {
				customer = existingCustomers.data[0];
			} else {
				// Create new customer
				customer = await stripe.customers.create({
					email,
					name: name || undefined,
					metadata: metadata || {},
				});
			}
		}

		// Build subscription create params
		const subscriptionParams: Stripe.SubscriptionCreateParams = {
			customer: customer.id,
			items: [{ price: priceId }],
			payment_behavior: 'default_incomplete',
			payment_settings: {
				save_default_payment_method: 'on_subscription',
			},
			expand: ['latest_invoice.payment_intent', 'pending_setup_intent'],
			metadata: metadata || {},
		};

		// Add trial period if specified
		if (trialDays && trialDays > 0) {
			subscriptionParams.trial_period_days = trialDays;
		}

		// Create the subscription
		const subscription = await stripe.subscriptions.create(subscriptionParams);

		// Determine what type of client secret to return
		// - If trial: returns a SetupIntent client secret for collecting payment method
		// - If no trial: returns a PaymentIntent client secret for immediate payment
		let clientSecret: string | null = null;
		let type: 'setup_intent' | 'payment_intent' = 'payment_intent';

		if (subscription.pending_setup_intent) {
			// Trial subscription - use SetupIntent
			const setupIntent = subscription.pending_setup_intent as Stripe.SetupIntent;
			clientSecret = setupIntent.client_secret;
			type = 'setup_intent';
		} else if (subscription.latest_invoice) {
			// No trial - use PaymentIntent from invoice
			const invoice = subscription.latest_invoice as Stripe.Invoice;
			const paymentIntent = invoice.payment_intent as Stripe.PaymentIntent;
			if (paymentIntent) {
				clientSecret = paymentIntent.client_secret;
				type = 'payment_intent';
			}
		}

		return {
			subscriptionId: subscription.id,
			customerId: customer.id,
			clientSecret,
			type,
			status: subscription.status,
			trialEnd: subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null,
		};
	} catch (error: any) {
		console.error('Subscription creation error:', error);

		// Handle Stripe errors specifically
		if (error.type?.startsWith('Stripe')) {
			throw createError({
				statusCode: 400,
				message: error.message || 'Stripe error occurred',
			});
		}

		throw error;
	}
});
