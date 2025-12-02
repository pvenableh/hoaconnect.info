import Stripe from 'stripe';
import { createItem, updateItem, readItems, readItem } from '@directus/sdk';
// Note: getTypedDirectus is auto-imported from server/utils/directus.ts in Nuxt 4

export default defineEventHandler(async (event) => {
	const config = useRuntimeConfig();
	let stripe: Stripe;

	try {
		// Initialize Stripe
		const stripeSecretKey =
			process.env.NODE_ENV === 'production' ? config.stripeSecretKeyLive : config.stripeSecretKeyTest;

		if (!stripeSecretKey) {
			throw createError({
				statusCode: 500,
				message: 'Stripe secret key not configured',
			});
		}

		stripe = new Stripe(stripeSecretKey, {
			apiVersion: '2024-11-20.acacia',
			typescript: true,
		});

		// Get the webhook signature from headers
		const sig = getHeader(event, 'stripe-signature');
		if (!sig) {
			throw createError({
				statusCode: 400,
				message: 'Missing stripe-signature header',
			});
		}

		// Get raw body for signature verification
		const body = await readRawBody(event);
		if (!body) {
			throw createError({
				statusCode: 400,
				message: 'Missing request body',
			});
		}

		// Verify webhook signature
		const webhookSecret = config.stripeWebhookSecret;
		if (!webhookSecret) {
			throw createError({
				statusCode: 500,
				message: 'Webhook secret not configured',
			});
		}

		let stripeEvent: Stripe.Event;
		try {
			stripeEvent = stripe.webhooks.constructEvent(body, sig, webhookSecret);
		} catch (err: any) {
			console.error('Webhook signature verification failed:', err.message);
			throw createError({
				statusCode: 400,
				message: `Webhook signature verification failed: ${err.message}`,
			});
		}

		console.log('Stripe Webhook Event:', {
			type: stripeEvent.type,
			id: stripeEvent.id,
			timestamp: new Date().toISOString(),
		});

		// Initialize Directus client with admin access (webhooks have no user session)
		const directus = getTypedDirectus();

		// Handle different event types
		switch (stripeEvent.type) {
			case 'payment_intent.succeeded': {
				const paymentIntent = stripeEvent.data.object as Stripe.PaymentIntent;
				await handlePaymentIntentSucceeded(directus, paymentIntent);
				break;
			}

			case 'payment_intent.payment_failed': {
				const paymentIntent = stripeEvent.data.object as Stripe.PaymentIntent;
				await handlePaymentIntentFailed(directus, paymentIntent);
				break;
			}

			case 'payment_intent.canceled': {
				const paymentIntent = stripeEvent.data.object as Stripe.PaymentIntent;
				await handlePaymentIntentCanceled(directus, paymentIntent);
				break;
			}

			case 'charge.succeeded': {
				const charge = stripeEvent.data.object as Stripe.Charge;
				await handleChargeSucceeded(directus, charge);
				break;
			}

			case 'charge.refunded': {
				const charge = stripeEvent.data.object as Stripe.Charge;
				await handleChargeRefunded(directus, charge);
				break;
			}

			case 'customer.subscription.created':
			case 'customer.subscription.updated':
			case 'customer.subscription.deleted': {
				const subscription = stripeEvent.data.object as Stripe.Subscription;
				await handleSubscriptionEvent(directus, subscription, stripeEvent.type);
				break;
			}

			default:
				console.log(`Unhandled event type: ${stripeEvent.type}`);
		}

		return { received: true };
	} catch (error: any) {
		console.error('Webhook Error:', {
			message: error.message,
			stack: error.stack,
			timestamp: new Date().toISOString(),
		});

		throw error;
	}
});

// Handler functions
async function handlePaymentIntentSucceeded(directus: any, paymentIntent: Stripe.PaymentIntent) {
	console.log('Payment Intent Succeeded:', paymentIntent.id);

	const metadata = paymentIntent.metadata || {};
	const organizationId = metadata.organization_id;
	const memberId = metadata.member_id;
	const paymentRequestId = metadata.payment_request_id;

	// Create payment transaction record
	try {
		const transactionData = {
			status: 'succeeded' as const,
			organization: organizationId || null,
			member: memberId || null,
			payment_request: paymentRequestId || null,
			amount: paymentIntent.amount / 100, // Convert cents to dollars
			currency: paymentIntent.currency,
			description: paymentIntent.description || '',
			stripe_payment_intent_id: paymentIntent.id,
			stripe_customer_id: (paymentIntent.customer as string) || null,
			receipt_email: paymentIntent.receipt_email,
			metadata: paymentIntent.metadata,
		};

		await directus.request(createItem('payment_transactions', transactionData));

		// Update payment request if linked
		if (paymentRequestId) {
			await updatePaymentRequest(directus, paymentRequestId, paymentIntent.amount / 100);
		}

		console.log('Payment transaction created successfully');
	} catch (err) {
		console.error('Error creating payment transaction:', err);
	}
}

async function handlePaymentIntentFailed(directus: any, paymentIntent: Stripe.PaymentIntent) {
	console.log('Payment Intent Failed:', paymentIntent.id);

	const metadata = paymentIntent.metadata || {};
	const organizationId = metadata.organization_id;
	const memberId = metadata.member_id;
	const paymentRequestId = metadata.payment_request_id;

	try {
		await directus.request(
			createItem('payment_transactions', {
				status: 'failed' as const,
				organization: organizationId || null,
				member: memberId || null,
				payment_request: paymentRequestId || null,
				amount: paymentIntent.amount / 100,
				currency: paymentIntent.currency,
				stripe_payment_intent_id: paymentIntent.id,
				metadata: paymentIntent.metadata,
			})
		);
	} catch (err) {
		console.error('Error creating failed transaction record:', err);
	}
}

async function handlePaymentIntentCanceled(directus: any, paymentIntent: Stripe.PaymentIntent) {
	console.log('Payment Intent Canceled:', paymentIntent.id);
	// Similar handling as failed payment
	await handlePaymentIntentFailed(directus, paymentIntent);
}

async function handleChargeSucceeded(directus: any, charge: Stripe.Charge) {
	console.log('Charge Succeeded:', charge.id);

	// Update transaction with charge details
	try {
		// Find transaction by payment intent ID
		const transactions = await directus.request(
			readItems('payment_transactions', {
				filter: {
					stripe_payment_intent_id: { _eq: charge.payment_intent },
				},
			})
		);

		if (transactions && transactions.length > 0) {
			const transaction = transactions[0];
			await directus.request(
				updateItem('payment_transactions', transaction.id, {
					stripe_charge_id: charge.id,
					receipt_url: charge.receipt_url,
					payment_method_type: charge.payment_method_details?.type,
					last4:
						charge.payment_method_details?.card?.last4 ||
						charge.payment_method_details?.us_bank_account?.last4 ||
						null,
					processing_fee: charge.application_fee_amount ? charge.application_fee_amount / 100 : null,
					net_amount: charge.amount_captured / 100,
				})
			);
		}
	} catch (err) {
		console.error('Error updating transaction with charge details:', err);
	}
}

async function handleChargeRefunded(directus: any, charge: Stripe.Charge) {
	console.log('Charge Refunded:', charge.id);

	try {
		const transactions = await directus.request(
			readItems('payment_transactions', {
				filter: {
					stripe_charge_id: { _eq: charge.id },
				},
			})
		);

		if (transactions && transactions.length > 0) {
			const transaction = transactions[0];
			await directus.request(
				updateItem('payment_transactions', transaction.id, {
					status: 'refunded',
				})
			);

			// Update payment request if linked
			if (transaction.payment_request) {
				await updatePaymentRequest(directus, transaction.payment_request, -transaction.amount);
			}
		}
	} catch (err) {
		console.error('Error updating refunded transaction:', err);
	}
}

async function handleSubscriptionEvent(directus: any, subscription: Stripe.Subscription, eventType: string) {
	console.log('Subscription Event:', eventType, subscription.id);

	const customerId = subscription.customer as string;

	try {
		// Find organization by stripe_customer_id
		const organizations = await directus.request(
			readItems('hoa_organizations', {
				filter: {
					stripe_customer_id: { _eq: customerId },
				},
			})
		);

		if (organizations && organizations.length > 0) {
			const org = organizations[0];
			const updateData: Record<string, any> = {
				stripe_subscription_id: subscription.id,
				subscription_status: subscription.status,
			};

			if (subscription.trial_end) {
				updateData.trial_ends_at = new Date(subscription.trial_end * 1000).toISOString();
			}

			await directus.request(updateItem('hoa_organizations', org.id, updateData));
		}
	} catch (err) {
		console.error('Error updating organization subscription:', err);
	}
}

async function updatePaymentRequest(directus: any, paymentRequestId: string, amount: number) {
	try {
		// Get current payment request
		const request = await directus.request(readItem('payment_requests', paymentRequestId));

		if (request) {
			const currentPaid = request.amount_paid || 0;
			const newPaid = currentPaid + amount;
			const totalAmount = request.amount;
			const remaining = totalAmount - newPaid;

			let newStatus: 'partially_paid' | 'paid' = 'partially_paid';
			if (remaining <= 0) {
				newStatus = 'paid';
			}

			await directus.request(
				updateItem('payment_requests', paymentRequestId, {
					amount_paid: newPaid,
					amount_remaining: Math.max(0, remaining),
					status: newStatus,
					...(newStatus === 'paid' && { paid_at: new Date().toISOString() }),
				})
			);
		}
	} catch (err) {
		console.error('Error updating payment request:', err);
	}
}
