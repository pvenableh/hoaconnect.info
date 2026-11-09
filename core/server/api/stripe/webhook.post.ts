import Stripe from 'stripe';
import { createItem, updateItem, readItems, readItem } from '@directus/sdk';
import type { AcaciaInvoice } from '#core/server/utils/stripe';
import type { PaymentTransaction } from '#core/types/directus';
import { buildPaymentRecordedEntry, buildPaymentRefundedEntry } from '#core/shared/ledger/entries';
import { planChargeRefund, requestStatusAfter } from '#core/shared/billing/refund';
import { orgStatusForStripeSubscription } from '#core/shared/billing/subscription-status';
import { isHoaConnectObject } from '#core/shared/billing/stripe-app';
// Note: getTypedDirectus is auto-imported from server/utils/directus.ts in Nuxt 4

export default defineEventHandler(async (event) => {
	const config = useRuntimeConfig();
	let stripe: Stripe;

	try {
		// Initialize Stripe
		const stripeSecretKey =
			isStripeLiveMode() ? config.stripeSecretKeyLive : config.stripeSecretKeyTest;

		if (!stripeSecretKey) {
			throw createError({
				statusCode: 500,
				message: 'Stripe secret key not configured',
			});
		}

		stripe = new Stripe(stripeSecretKey, {
			apiVersion: STRIPE_API_VERSION,
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

		// Verify webhook signature. Stripe makes events on Hue's own account and
		// events on connected accounts (Connect) separate endpoints, each with its
		// own signing secret, both pointed at this route. Accept either.
		const webhookSecrets = getStripeWebhookSecrets();
		if (webhookSecrets.length === 0) {
			throw createError({
				statusCode: 500,
				message: 'Webhook secret not configured',
			});
		}

		let stripeEvent: Stripe.Event | null = null;
		let verifyError = '';
		for (const secret of webhookSecrets) {
			try {
				stripeEvent = stripe.webhooks.constructEvent(body, sig, secret);
				break;
			} catch (err: any) {
				verifyError = err?.message ?? String(err);
			}
		}
		if (!stripeEvent) {
			console.error('Webhook signature verification failed:', verifyError);
			throw createError({
				statusCode: 400,
				message: `Webhook signature verification failed: ${verifyError}`,
			});
		}

		console.log('Stripe Webhook Event:', {
			type: stripeEvent.type,
			id: stripeEvent.id,
			timestamp: new Date().toISOString(),
		});

		// Initialize Directus client with admin access (webhooks have no user session)
		const directus = getTypedDirectus();

		// The Stripe account is Hue's and shared with Hue's other products
		// (core/shared/billing/stripe-app.ts). A PaymentIntent that isn't HOA
		// Connect's — another product's sale, or this app's own subscription
		// invoices (handled by the invoice/subscription events) — is acknowledged
		// and never booked as a community's payment. Charges and refunds need no
		// gate: they only ever touch transactions booked here.
		if (stripeEvent.type.startsWith('payment_intent.')) {
			const pi = stripeEvent.data.object as Stripe.PaymentIntent;
			if (!isHoaConnectObject(pi.metadata)) {
				console.log(`Ignoring ${stripeEvent.type} ${pi.id}: not an HOA Connect payment`);
				return { received: true, ignored: 'not_hoaconnect' };
			}
		}

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

			case 'invoice.paid':
			case 'invoice.payment_failed': {
				const invoice = stripeEvent.data.object as Stripe.Invoice;
				await handleInvoiceEvent(directus, invoice, stripeEvent.type);
				break;
			}

			// --- Stripe Connect events ---
			case 'account.updated': {
				const account = stripeEvent.data.object as Stripe.Account;
				await handleConnectAccountUpdated(directus, account);
				break;
			}

			case 'payout.paid':
			case 'payout.failed':
			case 'payout.canceled': {
				const payout = stripeEvent.data.object as Stripe.Payout;
				await handleConnectPayoutEvent(payout, stripeEvent.type, stripeEvent.account);
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
async function handlePaymentIntentSucceeded(directus: ReturnType<typeof getTypedDirectus>, paymentIntent: Stripe.PaymentIntent) {
	console.log('Payment Intent Succeeded:', paymentIntent.id);

	const metadata = paymentIntent.metadata || {};

	// AI credit-pack top-up — credit the org wallet (idempotent on the PI id) and
	// stop; this is platform revenue, not a resident dues transaction.
	if (metadata.kind === 'ai_credits') {
		try {
			const orgId = metadata.org_id;
			const credits = Number(metadata.credits || 0);
			if (orgId && credits > 0) {
				const res = await creditWallet({
					orgId,
					kind: 'purchase',
					credits,
					stripeId: paymentIntent.id,
				});
				console.log(
					res.credited
						? `Credited ${credits} AI credits to org ${orgId} (balance ${res.balanceCredits})`
						: `AI credit purchase ${paymentIntent.id} already applied — skipped`,
				);
			}
		} catch (err) {
			console.error('Error crediting AI wallet:', err);
		}
		return;
	}

	const organizationId = metadata.organization_id;
	const memberId = metadata.member_id;
	// One payment can cover several charges: the owner's "Pay" button and the
	// autopay worker both send metadata.charge_ids (comma-separated). The single
	// payment_request_id path stays for the older one-charge checkout.
	const chargeIds = parseChargeIds(metadata.charge_ids);
	const paymentRequestId = metadata.payment_request_id || chargeIds[0] || undefined;

	// Create payment transaction record
	try {
		// Idempotency: Stripe retries webhooks (and can deliver the same event
		// more than once). The PaymentIntent id is the natural key — if we've
		// already booked a succeeded transaction for it, stop. Without this the
		// retry both duplicates the ledger row and double-credits the linked
		// payment request's amount_paid.
		const existing = await directus.request(
			readItems('payment_transactions', {
				filter: {
					stripe_payment_intent_id: { _eq: paymentIntent.id },
					status: { _eq: 'succeeded' },
				},
				fields: ['id'],
				limit: 1,
			})
		);
		if (existing?.length) {
			console.log(`Payment intent ${paymentIntent.id} already recorded — skipping duplicate`);
			return;
		}

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
			metadata: paymentIntent.metadata as unknown as PaymentTransaction['metadata'],
		};

		const transaction = (await directus.request(
			createItem('payment_transactions', transactionData)
		)) as { id?: string };

		// Credit the charges: split across charge_ids oldest due first, or the
		// one linked request.
		if (chargeIds.length) {
			await splitPaymentAcrossCharges(directus, chargeIds, paymentIntent.amount / 100);
		} else if (paymentRequestId) {
			await updatePaymentRequest(directus, paymentRequestId, paymentIntent.amount / 100);
		}

		console.log('Payment transaction created successfully');

		// The Community Ledger's copy — board-only, because it names one
		// household. Written here rather than by the payments UI because this is
		// where a payment actually lands, and the duplicate guard above already
		// makes it exactly-once across Stripe's retries.
		await recordPaymentInLedger(directus, {
			organizationId: organizationId || null,
			memberId: memberId || null,
			transactionId: transaction?.id ?? null,
			amount: paymentIntent.amount / 100,
			currency: paymentIntent.currency,
			description: paymentIntent.description || null,
			method: paymentIntent.payment_method_types?.[0] ?? null,
			reference: paymentIntent.id,
			source: 'stripe',
		});

		// The member's receipt: bell + push. Never throws (see payment-notify.ts).
		await notifyPaymentReceived(directus, {
			organizationId: organizationId || null,
			memberId: memberId || null,
			amount: paymentIntent.amount / 100,
			currency: paymentIntent.currency,
			label: paymentIntent.description || null,
		});
	} catch (err) {
		console.error('Error creating payment transaction:', err);
	}
}

async function handlePaymentIntentFailed(directus: ReturnType<typeof getTypedDirectus>, paymentIntent: Stripe.PaymentIntent) {
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
				metadata: paymentIntent.metadata as unknown as PaymentTransaction['metadata'],
			})
		);
	} catch (err) {
		console.error('Error creating failed transaction record:', err);
	}
}

async function handlePaymentIntentCanceled(directus: ReturnType<typeof getTypedDirectus>, paymentIntent: Stripe.PaymentIntent) {
	console.log('Payment Intent Canceled:', paymentIntent.id);
	// Similar handling as failed payment
	await handlePaymentIntentFailed(directus, paymentIntent);
}

async function handleChargeSucceeded(directus: ReturnType<typeof getTypedDirectus>, charge: Stripe.Charge) {
	console.log('Charge Succeeded:', charge.id);

	// Update transaction with charge details
	try {
		// Find transaction by payment intent ID
		const paymentIntentId =
			typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id;
		const transactions = await directus.request(
			readItems('payment_transactions', {
				filter: {
					stripe_payment_intent_id: { _eq: paymentIntentId },
				},
			})
		);

		const transaction = transactions?.[0];
		if (transaction) {
			// Events arrive in any order. If a refund already landed it wrote the
			// net the transaction still holds — never put the gross back over it,
			// or a redelivered refund would reverse the money a second time.
			const netAlreadySet = transaction.net_amount != null;
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
					...(netAlreadySet ? {} : { net_amount: charge.amount_captured / 100 }),
				})
			);
		}
	} catch (err) {
		console.error('Error updating transaction with charge details:', err);
	}
}

async function handleChargeRefunded(directus: ReturnType<typeof getTypedDirectus>, charge: Stripe.Charge) {
	console.log('Charge Refunded:', charge.id);

	try {
		// By charge id (set by charge.succeeded) — or by the PaymentIntent, because
		// Stripe does not order events and a refund can be processed before
		// charge.succeeded ever stamped the charge id on the row.
		const paymentIntentId =
			typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id;
		let transaction = (
			(await directus.request(
				readItems('payment_transactions', { filter: { stripe_charge_id: { _eq: charge.id } }, limit: 1 })
			)) as any[]
		)?.[0];
		if (!transaction && paymentIntentId) {
			transaction = (
				(await directus.request(
					readItems('payment_transactions', {
						filter: {
							stripe_payment_intent_id: { _eq: paymentIntentId },
							status: { _in: ['succeeded', 'refunded'] },
						},
						limit: 1,
					})
				)) as any[]
			)?.[0];
		}
		if (!transaction) {
			console.log(`Refund for charge ${charge.id}: no booked transaction — nothing to reverse`);
			return;
		}

		// A DELTA against what the row still holds: a replay is 0, a second
		// partial refund is only the new part (core/shared/billing/refund.ts).
		const plan = planChargeRefund(transaction, charge);
		if (plan.delta <= 0) {
			console.log(`Refund for charge ${charge.id} already applied — skipping duplicate`);
			return;
		}

		await directus.request(
			updateItem('payment_transactions', transaction.id, {
				status: plan.status,
				net_amount: plan.netAfter,
				stripe_charge_id: charge.id,
			})
		);

		if (transaction.payment_request) {
			const requestId =
				typeof transaction.payment_request === 'string' ? transaction.payment_request : transaction.payment_request?.id;
			if (requestId) await updatePaymentRequest(directus, requestId, -plan.delta);
		}

		await recordRefundInLedger(directus, {
			organizationId: (typeof transaction.organization === 'string' ? transaction.organization : transaction.organization?.id) || null,
			memberId: (typeof transaction.member === 'string' ? transaction.member : transaction.member?.id) || null,
			transactionId: transaction.id ?? null,
			amount: plan.delta,
			currency: transaction.currency ?? charge.currency ?? null,
			description: transaction.description || null,
			reference: paymentIntentId ?? charge.id,
			fullyRefunded: plan.fullyRefunded,
		});
	} catch (err) {
		console.error('Error updating refunded transaction:', err);
	}
}

// Build the org's active_addons map from the subscription's line items. Each
// known add-on has a configured recurring Price (per test/live mode); if that
// Price is present among the items, the add-on is active. (core/shared/billing/addons.ts)
function reconcileActiveAddons(subscription: Stripe.Subscription): Record<string, boolean> {
	const config = useRuntimeConfig();
	const priceByAddon: Record<string, string | undefined> = {
		extra_storage_100: (isStripeLiveMode()
			? config.stripeAddonStoragePriceLive
			: config.stripeAddonStoragePriceTest) as string | undefined,
	};
	const priceIds = new Set(
		(subscription.items?.data || []).map((it) => it.price?.id).filter(Boolean)
	);
	const active: Record<string, boolean> = {};
	for (const [addon, priceId] of Object.entries(priceByAddon)) {
		if (priceId && priceIds.has(priceId)) active[addon] = true;
	}
	return active;
}

async function handleSubscriptionEvent(directus: ReturnType<typeof getTypedDirectus>, subscription: Stripe.Subscription, eventType: string) {
	console.log('Subscription Event:', eventType, subscription.id);

	const customerId = subscription.customer as string;

	// Agency billing: route to a billing_accounts row first (one customer + one
	// subscription spanning many orgs). Child orgs resolve entitlement UP to the
	// account, so we must NOT touch their own fields here. Match by subscription
	// id first, then customer id. (docs/plan-agency-multi-property-billing.md §7)
	if (await routeBillingAccountSubscription(directus, subscription, eventType)) {
		return;
	}

	try {
		// Find organization by stripe_customer_id
		const organizations = await directus.request(
			readItems('hoa_organizations', {
				filter: {
					stripe_customer_id: { _eq: customerId },
				},
			})
		);

		const org = organizations?.[0];
		// An unpaid checkout (incomplete / incomplete_expired) never moves the org.
		const orgStatus = orgStatusForStripeSubscription(subscription.status, eventType);
		if (org && orgStatus === null) {
			console.log(`Subscription ${subscription.id} is ${subscription.status} — org ${org.id} left as is`);
		} else if (org && orgStatus) {
			const updateData: Record<string, any> = {
				stripe_subscription_id: subscription.id,
				subscription_status: orgStatus,
			};

			// Update trial end date
			if (subscription.trial_end) {
				updateData.trial_ends_at = new Date(subscription.trial_end * 1000).toISOString();
			}

			// Get the price ID to determine billing cycle
			const priceItem = subscription.items?.data?.[0];
			if (priceItem?.price?.recurring?.interval) {
				updateData.billing_cycle = priceItem.price.recurring.interval === 'year' ? 'yearly' : 'monthly';
			}

			// Reconcile paid add-ons from the subscription's line items (Stripe is
			// the source of truth; keeps active_addons from drifting).
			updateData.active_addons = reconcileActiveAddons(subscription);

			await directus.request(updateItem('hoa_organizations', org.id, updateData));
			console.log(`Updated organization ${org.id} subscription status to ${orgStatus}`);
		} else {
			console.log(`No organization found for customer ${customerId}`);
		}
	} catch (err) {
		console.error('Error updating organization subscription:', err);
	}
}

// Handler for invoice events (important for subscription renewals)
async function handleInvoiceEvent(directus: ReturnType<typeof getTypedDirectus>, invoice: AcaciaInvoice, eventType: string) {
	console.log('Invoice Event:', eventType, invoice.id);

	const customerId = invoice.customer as string;
	const subscriptionId = invoice.subscription as string;

	// Agency billing: route to a billing_accounts row first (see above).
	if (await routeBillingAccountInvoice(directus, invoice, eventType)) {
		return;
	}

	try {
		// Find organization by stripe_customer_id
		const organizations = await directus.request(
			readItems('hoa_organizations', {
				filter: {
					stripe_customer_id: { _eq: customerId },
				},
			})
		);

		const org = organizations?.[0];
		if (org) {
			if (eventType === 'invoice.paid') {
				// Subscription renewal successful
				await directus.request(
					updateItem('hoa_organizations', org.id, {
						subscription_status: 'active',
					})
				);
				console.log(`Organization ${org.id} subscription renewed successfully`);
			} else if (eventType === 'invoice.payment_failed') {
				// Payment failed - might need to handle grace period
				console.log(`Payment failed for organization ${org.id}`);
				// Could notify the user here via email
			}
		}
	} catch (err) {
		console.error('Error handling invoice event:', err);
	}
}

// --- Stripe Connect handlers ---

// Sync an org's onboarding state whenever its Express account changes.
async function handleConnectAccountUpdated(directus: ReturnType<typeof getTypedDirectus>, account: Stripe.Account) {
	console.log('Connect Account Updated:', account.id, {
		charges_enabled: account.charges_enabled,
		payouts_enabled: account.payouts_enabled,
		details_submitted: account.details_submitted,
	});

	// Derive a simple onboarding status from the Stripe account flags.
	let onboardingStatus: 'none' | 'pending' | 'restricted' | 'active' = 'pending';
	if (account.charges_enabled && account.payouts_enabled) {
		onboardingStatus = 'active';
	} else if (account.requirements?.disabled_reason) {
		onboardingStatus = 'restricted';
	} else {
		onboardingStatus = 'pending';
	}

	try {
		const organizations = await directus.request(
			readItems('hoa_organizations', {
				filter: { stripe_connect_account_id: { _eq: account.id } },
				limit: 1,
			})
		);

		const org = organizations?.[0];
		if (org) {
			await directus.request(
				updateItem('hoa_organizations', org.id, {
					connect_onboarding_status: onboardingStatus,
					connect_charges_enabled: account.charges_enabled ?? false,
					connect_payouts_enabled: account.payouts_enabled ?? false,
				})
			);
			console.log(`Updated organization ${org.id} connect status to ${onboardingStatus}`);
		} else {
			console.log(`No organization found for connect account ${account.id}`);
		}
	} catch (err) {
		console.error('Error syncing connect account status:', err);
	}
}

// Connect payouts land in the association's own bank — we just log the
// lifecycle for now (no payout ledger collection yet; that is ROADMAP Phase 2).
async function handleConnectPayoutEvent(
	payout: Stripe.Payout,
	eventType: string,
	connectedAccountId: string | undefined
) {
	console.log('Connect Payout Event:', eventType, {
		payoutId: payout.id,
		account: connectedAccountId,
		amount: payout.amount / 100,
		currency: payout.currency,
		status: payout.status,
		arrival_date: payout.arrival_date,
	});
}

// --- Agency billing-account routing ---

// If this subscription belongs to a billing_accounts row, update THAT row and
// return true (caller skips the per-org branch). Match by subscription id
// first, then customer id. (docs/plan-agency-multi-property-billing.md §7)
async function routeBillingAccountSubscription(
	directus: ReturnType<typeof getTypedDirectus>,
	subscription: Stripe.Subscription,
	eventType: string
): Promise<boolean> {
	const customerId = subscription.customer as string;
	try {
		let accounts = await directus.request(
			readItems('billing_accounts', {
				filter: { stripe_subscription_id: { _eq: subscription.id } },
				limit: 1,
			})
		);
		if (!accounts?.length) {
			accounts = await directus.request(
				readItems('billing_accounts', {
					filter: { stripe_customer_id: { _eq: customerId } },
					limit: 1,
				})
			);
		}
		const account = accounts?.[0];
		if (!account) return false;

		const mapped = mapStripeStatus(subscription.status);
		const updateData: Record<string, any> = {
			stripe_subscription_id: subscription.id,
			subscription_status: mapped.subscription_status,
			status: mapped.status,
		};
		if (subscription.trial_end) {
			updateData.trial_ends_at = new Date(subscription.trial_end * 1000).toISOString();
		}
		if (eventType === 'customer.subscription.deleted') {
			updateData.subscription_status = 'canceled';
			updateData.status = 'canceled';
		}

		const item = subscription.items?.data?.[0];
		if (typeof item?.quantity === 'number') updateData.seats_purchased = item.quantity;
		if (item?.price?.recurring?.interval) {
			updateData.billing_cycle = item.price.recurring.interval === 'year' ? 'yearly' : 'monthly';
		}

		await directus.request(updateItem('billing_accounts', account.id, updateData));
		console.log(`Updated billing account ${account.id} → ${updateData.subscription_status}`);
		return true;
	} catch (err) {
		console.error('Error routing billing-account subscription:', err);
		// Returning false would double-process via the org branch; the org branch
		// won't match an agency customer, so it's safe. Treat as handled.
		return true;
	}
}

async function routeBillingAccountInvoice(
	directus: ReturnType<typeof getTypedDirectus>,
	invoice: Stripe.Invoice,
	eventType: string
): Promise<boolean> {
	const customerId = invoice.customer as string;
	try {
		const accounts = await directus.request(
			readItems('billing_accounts', {
				filter: { stripe_customer_id: { _eq: customerId } },
				limit: 1,
			})
		);
		const account = accounts?.[0];
		if (!account) return false;

		if (eventType === 'invoice.paid') {
			await directus.request(
				updateItem('billing_accounts', account.id, {
					subscription_status: 'active',
					status: 'active',
				})
			);
			console.log(`Billing account ${account.id} subscription renewed`);
		} else if (eventType === 'invoice.payment_failed') {
			await directus.request(
				updateItem('billing_accounts', account.id, {
					subscription_status: 'past_due',
					status: 'past_due',
				})
			);
			console.log(`Billing account ${account.id} payment failed → past_due`);
		}
		return true;
	} catch (err) {
		console.error('Error routing billing-account invoice:', err);
		return true;
	}
}

function parseChargeIds(raw: unknown): string[] {
	if (typeof raw !== 'string' || !raw.trim()) return [];
	return [...new Set(raw.split(',').map((s) => s.trim()).filter(Boolean))];
}

/**
 * Allocate one payment across several charges, oldest due first, so a partial
 * payment settles the oldest bill before touching a newer one — the order a
 * board expects and the order late fees assume. Each charge takes at most its
 * remaining balance; the leftover (an overpayment) goes onto the last charge
 * so the money is never silently dropped from the record.
 *
 * Charges are looked up by id, not trusted from the metadata's order: the
 * client that built the intent may not have sorted them.
 */
async function splitPaymentAcrossCharges(
	directus: ReturnType<typeof getTypedDirectus>,
	chargeIds: string[],
	amount: number
) {
	try {
		const rows = (await directus.request(
			readItems('payment_requests', {
				filter: { id: { _in: chargeIds } },
				fields: ['id', 'amount', 'amount_paid', 'due_date', 'date_created'],
				limit: -1,
			})
		)) as Array<{ id: string; amount?: number | null; amount_paid?: number | null; due_date?: string | null; date_created?: string | null }>;

		const charges = rows
			.filter((r) => chargeIds.includes(r.id))
			.sort((a, b) => {
				const da = (a.due_date ?? '9999-12-31').slice(0, 10);
				const db = (b.due_date ?? '9999-12-31').slice(0, 10);
				if (da !== db) return da < db ? -1 : 1;
				const ca = a.date_created ?? '';
				const cb = b.date_created ?? '';
				return ca < cb ? -1 : ca > cb ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
			});
		if (!charges.length) {
			console.warn('charge_ids matched no payment_requests:', chargeIds);
			return;
		}

		// Cents, so the shares always add back up to the payment.
		let leftCents = Math.round(amount * 100);
		for (let i = 0; i < charges.length && leftCents > 0; i++) {
			const c = charges[i]!;
			const remainingCents = Math.max(0, Math.round((Number(c.amount ?? 0) - Number(c.amount_paid ?? 0)) * 100));
			const last = i === charges.length - 1;
			const shareCents = last ? leftCents : Math.min(remainingCents, leftCents);
			if (shareCents <= 0) continue;
			await updatePaymentRequest(directus, c.id, shareCents / 100);
			leftCents -= shareCents;
		}
	} catch (err) {
		console.error('Error splitting payment across charges:', err);
	}
}

async function updatePaymentRequest(directus: ReturnType<typeof getTypedDirectus>, paymentRequestId: string, amount: number) {
	try {
		// Get current payment request
		const request = await directus.request(readItem('payment_requests', paymentRequestId));

		if (request) {
			const currentPaid = request.amount_paid || 0;
			// Cents, so a refund back to zero lands on 0 and not 1e-14.
			const newPaid = Math.max(0, Math.round((currentPaid + amount) * 100) / 100);
			const totalAmount = request.amount ?? 0;
			const remaining = totalAmount - newPaid;
			const newStatus = requestStatusAfter(request, newPaid, new Date().toISOString());

			await directus.request(
				updateItem('payment_requests', paymentRequestId, {
					amount_paid: newPaid,
					amount_remaining: Math.max(0, remaining),
					status: newStatus,
					...(newStatus === 'paid' ? { paid_at: new Date().toISOString() } : request.paid_at ? { paid_at: null } : {}),
				})
			);
		}
	} catch (err) {
		console.error('Error updating payment request:', err);
	}
}


/**
 * Write the ledger's copy of a payment.
 *
 * Never throws: a webhook that fails is a webhook Stripe retries, and a retry
 * whose only failing step was the ledger write would re-run nothing (the
 * duplicate guard stops it) while Stripe kept trying. A missing entry is logged
 * loudly and left for a human; a retry storm is not.
 *
 * The actor is the PAYER, not an administrator — nobody with a session was
 * involved. When the member cannot be resolved the entry still reads correctly,
 * which is the whole reason actor details are denormalized onto every row.
 */
async function recordPaymentInLedger(
	directus: ReturnType<typeof getTypedDirectus>,
	input: {
		organizationId: string | null;
		memberId: string | null;
		transactionId: string | null;
		amount: number;
		currency: string | null;
		description: string | null;
		method: string | null;
		reference: string | null;
		source: 'stripe' | 'manual';
	}
) {
	if (!input.organizationId) return;

	try {
		const { memberName, memberEmail, memberUser, organizationName } = await resolvePayer(directus, input.organizationId, input.memberId);

		const entry = buildPaymentRecordedEntry({
			organizationId: input.organizationId,
			organizationName,
			payment: {
				transactionId: input.transactionId,
				memberId: input.memberId,
				memberName,
				amount: input.amount,
				currency: input.currency,
				description: input.description,
				method: input.method,
				reference: input.reference,
			},
			status: 'succeeded',
			source: input.source,
			actor: {
				userId: memberUser,
				name: memberName || 'An online payment',
				email: memberEmail,
			},
			occurredAt: new Date().toISOString(),
		});

		if (entry) await writeAuditEntry(entry);
	} catch (err) {
		console.error('[stripe/webhook] ledger write failed for payment', input.reference, err);
	}
}

/** Who paid (denormalized onto the ledger row) and the org's name. */
async function resolvePayer(
	directus: ReturnType<typeof getTypedDirectus>,
	organizationId: string,
	memberId: string | null
) {
	let memberName: string | null = null;
	let memberEmail: string | null = null;
	let memberUser: string | null = null;

	if (memberId) {
		const rows = (await directus.request(
			readItems('hoa_members', {
				filter: { id: { _eq: memberId }, organization: { _eq: organizationId } },
				// No unit: it hangs off hoa_member_units → hoa_units, and one bad
				// nested path fails the WHOLE Directus query — which here would
				// mean a payment silently missing from the record. The
				// household's name is what a board reads anyway.
				fields: ['first_name', 'last_name', 'email', 'user'],
				limit: 1,
			})
		)) as any[];
		const m = rows?.[0];
		if (m) {
			memberName = [m.first_name, m.last_name].filter(Boolean).join(' ').trim() || null;
			memberEmail = m.email ?? null;
			memberUser = typeof m.user === 'string' ? m.user : (m.user?.id ?? null);
		}
	}

	const orgs = (await directus.request(
		readItems('hoa_organizations', {
			filter: { id: { _eq: organizationId } },
			fields: ['name'],
			limit: 1,
		})
	)) as any[];

	return { memberName, memberEmail, memberUser, organizationName: (orgs?.[0]?.name as string | undefined) ?? null };
}

/**
 * Write the ledger's copy of a refund — `amount` is this refund's delta. Never
 * throws, for the same reason as recordPaymentInLedger. The actor is the
 * platform: a refund is issued from the Stripe dashboard, not by the payer.
 */
async function recordRefundInLedger(
	directus: ReturnType<typeof getTypedDirectus>,
	input: {
		organizationId: string | null;
		memberId: string | null;
		transactionId: string | null;
		amount: number;
		currency: string | null;
		description: string | null;
		reference: string | null;
		fullyRefunded: boolean;
	}
) {
	if (!input.organizationId) return;
	try {
		const { memberName, organizationName } = await resolvePayer(directus, input.organizationId, input.memberId);
		const entry = buildPaymentRefundedEntry({
			organizationId: input.organizationId,
			organizationName,
			payment: {
				transactionId: input.transactionId,
				memberId: input.memberId,
				memberName,
				amount: input.amount,
				currency: input.currency,
				description: input.description,
				reference: input.reference,
			},
			fullyRefunded: input.fullyRefunded,
			actor: { userId: null, name: 'Stripe refund', email: null },
			occurredAt: new Date().toISOString(),
		});
		if (entry) await writeAuditEntry(entry);
	} catch (err) {
		console.error('[stripe/webhook] ledger write failed for refund', input.reference, err);
	}
}
