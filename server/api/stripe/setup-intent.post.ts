import Stripe from 'stripe';
import { z } from 'zod';

// Validation schema for SetupIntent creation
const setupIntentSchema = z.object({
	email: z.string().email(),
	name: z.string().optional(),
	customerId: z.string().optional(), // Existing Stripe customer ID if available
	metadata: z.record(z.string()).optional(),
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
		const validation = setupIntentSchema.safeParse(body);
		if (!validation.success) {
			throw createError({
				statusCode: 400,
				message: validation.error.errors.map((e) => e.message).join(', '),
			});
		}

		const { email, name, customerId, metadata } = validation.data;

		// Get or create customer
		let customer: Stripe.Customer;

		if (customerId) {
			// Use existing customer
			customer = (await stripe.customers.retrieve(customerId)) as Stripe.Customer;
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

		// Create SetupIntent for future payments
		const setupIntent = await stripe.setupIntents.create({
			customer: customer.id,
			payment_method_types: ['card', 'us_bank_account'],
			metadata: metadata || {},
		});

		return {
			clientSecret: setupIntent.client_secret,
			customerId: customer.id,
			setupIntentId: setupIntent.id,
		};
	} catch (error: any) {
		console.error('SetupIntent creation error:', error);

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
