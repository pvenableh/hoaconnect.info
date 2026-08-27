import Stripe from 'stripe';
import { z } from 'zod';
import { readItem } from '@directus/sdk';
// getTypedDirectus is auto-imported from server/utils/directus.ts

const SUPPORTED_PAYMENT_TYPES = ['card', 'us_bank_account'] as const;
const SUPPORTED_CURRENCIES = ['usd'] as const;
const MIN_AMOUNT = 50; // 50 cents minimum
const MAX_AMOUNT = 999999999; // $9,999,999.99 maximum

// Validation schema
const paymentIntentSchema = z.object({
	amount: z
		.number()
		.int()
		.min(MIN_AMOUNT, `Amount must be at least $${MIN_AMOUNT / 100}`)
		.max(MAX_AMOUNT, `Amount cannot exceed $${MAX_AMOUNT / 100}`),
	email: z.string().email('Invalid email address'),
	paymentType: z.enum(SUPPORTED_PAYMENT_TYPES).optional(),
	currency: z.enum(SUPPORTED_CURRENCIES).default('usd'),
	saveCard: z.boolean().optional(),
	customer: z.string().optional(),
	organizationId: z.string().uuid().optional(),
	memberId: z.string().uuid().optional(),
	paymentRequestId: z.string().uuid().optional(),
	description: z.string().optional(),
	metadata: z.record(z.any()).optional(),
	// Stripe Connect: when true (and the org has an active connected account),
	// route this dues payment to the association's connected account as a
	// destination charge and take the platform application fee. Set ONLY by the
	// resident dues flow — SaaS subscription billing must never set this.
	routeDuesToConnect: z.boolean().optional(),
});

export default defineEventHandler(async (event) => {
	let stripe: Stripe;

	try {
		// Get runtime config
		const config = useRuntimeConfig();

		// Initialize Stripe with the appropriate key
		const stripeSecretKey =
			isStripeLiveMode() ? config.stripeSecretKeyLive : config.stripeSecretKeyTest;

		if (!stripeSecretKey) {
			throw createError({
				statusCode: 500,
				message: 'Stripe configuration error: Secret key not found',
			});
		}

		stripe = new Stripe(stripeSecretKey, {
			apiVersion: STRIPE_API_VERSION,
			typescript: true,
		});

		// Read and validate request body
		const body = await readBody(event);

		console.log('Payment Intent Request:', {
			...body,
			timestamp: new Date().toISOString(),
		});

		// Validate input
		const validatedData = paymentIntentSchema.parse(body);

		// Demo guardrail: never create a real charge for a public demo org.
		if (await isDemoOrg(validatedData.organizationId)) {
			throw createError({ statusCode: 403, message: 'Payments are disabled in the demo.' });
		}

		// Construct payment intent options
		const baseOptions: Stripe.PaymentIntentCreateParams = {
			amount: validatedData.amount,
			currency: validatedData.currency,
			receipt_email: validatedData.email,
			statement_descriptor: config.public.companyName?.substring(0, 22) || 'HOA Connect',
			metadata: {
				environment: process.env.NODE_ENV || 'development',
				created_at: new Date().toISOString(),
				organization_id: validatedData.organizationId || '',
				member_id: validatedData.memberId || '',
				payment_request_id: validatedData.paymentRequestId || '',
				...validatedData.metadata,
			},
		};

		// Add description if provided
		if (validatedData.description) {
			baseOptions.description = validatedData.description;
		}

		// Stripe Connect: route dues to the association's connected account as a
		// destination charge, taking the platform application fee. Looked up
		// server-side from the org (never trust a destination account from the
		// client). Silently falls back to a normal platform charge if the org
		// has no active connected account yet.
		if (validatedData.routeDuesToConnect && validatedData.organizationId) {
			try {
				const directus = getTypedDirectus();
				const org = (await directus.request(
					readItem('hoa_organizations', validatedData.organizationId, {
						fields: ['id', 'stripe_connect_account_id', 'connect_charges_enabled'],
					})
				)) as { stripe_connect_account_id?: string | null; connect_charges_enabled?: boolean | null };

				if (org?.stripe_connect_account_id && org.connect_charges_enabled) {
					const feePercent = parseFloat(config.stripeConnectFeePercent || '2') || 0;
					const applicationFeeAmount = Math.round((validatedData.amount * feePercent) / 100);

					baseOptions.transfer_data = { destination: org.stripe_connect_account_id };
					if (applicationFeeAmount > 0) {
						baseOptions.application_fee_amount = applicationFeeAmount;
					}
					baseOptions.metadata = {
						...baseOptions.metadata,
						connect_account_id: org.stripe_connect_account_id,
						platform_fee_percent: String(feePercent),
					};

					console.log('Routing dues to connected account:', {
						destination: org.stripe_connect_account_id,
						applicationFeeAmount,
						feePercent,
					});
				} else {
					console.warn(
						`routeDuesToConnect set but org ${validatedData.organizationId} has no active connected account; using platform charge`
					);
				}
			} catch (connectErr: any) {
				console.error('Connect routing lookup failed; using platform charge:', connectErr.message);
			}
		}

		// Configure payment method types based on paymentType
		if (validatedData.paymentType === 'card') {
			baseOptions.payment_method_types = ['card'];
			if (validatedData.saveCard) {
				baseOptions.setup_future_usage = 'on_session';
			}
		} else if (validatedData.paymentType === 'us_bank_account') {
			baseOptions.payment_method_types = ['us_bank_account'];
			baseOptions.payment_method_options = {
				us_bank_account: {
					financial_connections: {
						permissions: ['payment_method'],
					},
				},
			};
		} else {
			// Allow all payment methods
			baseOptions.automatic_payment_methods = {
				enabled: true,
			};
		}

		// Attach customer if provided
		if (validatedData.customer) {
			baseOptions.customer = validatedData.customer;
		}

		// Create the payment intent
		const paymentIntent = await stripe.paymentIntents.create(baseOptions);

		// Log successful creation
		console.log('Payment Intent Created:', {
			id: paymentIntent.id,
			amount: paymentIntent.amount,
			currency: paymentIntent.currency,
			email: validatedData.email,
			payment_type: validatedData.paymentType || 'automatic',
			timestamp: new Date().toISOString(),
		});

		// Return success response
		return {
			clientSecret: paymentIntent.client_secret,
			id: paymentIntent.id,
			amount: paymentIntent.amount,
			currency: paymentIntent.currency,
		};
	} catch (error: any) {
		// Log the error
		console.error('Payment Intent Error:', {
			message: error.message,
			code: error.code,
			type: error.type,
			stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
			timestamp: new Date().toISOString(),
		});

		// Handle Zod validation errors
		if (error.name === 'ZodError') {
			throw createError({
				statusCode: 400,
				message: 'Validation failed',
				data: error.errors,
			});
		}

		// Handle Stripe specific errors
		if (error instanceof Stripe.errors.StripeError) {
			throw createError({
				statusCode: error.statusCode || 400,
				message: error.message,
				data: {
					code: error.code,
					type: error.type,
					param: error.param,
				},
			});
		}

		// Handle other errors
		throw createError({
			statusCode: error.statusCode || 500,
			message:
				process.env.NODE_ENV === 'development'
					? `Payment intent creation failed: ${error.message}`
					: 'Payment intent creation failed',
			data:
				process.env.NODE_ENV === 'development'
					? {
							details: error.message,
						}
					: undefined,
		});
	}
});
