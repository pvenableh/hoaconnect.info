import Stripe from 'stripe';
import { createItem, updateItem, readItems, readItem } from '@directus/sdk';
import type { AcaciaInvoice } from '#core/server/utils/stripe';
import type { PaymentTransaction } from '#core/types/directus';
import { buildPaymentRecordedEntry } from '#core/shared/ledger/entries';
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

		// Verify webhook signature
		const webhookSecret = getStripeWebhookSecret();
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
	const paymentRequestId = metadata.payment_request_id;

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

		// Update payment request if linked
		if (paymentRequestId) {
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

async function handleChargeRefunded(directus: ReturnType<typeof getTypedDirectus>, charge: Stripe.Charge) {
	console.log('Charge Refunded:', charge.id);

	try {
		const transactions = await directus.request(
			readItems('payment_transactions', {
				filter: {
					stripe_charge_id: { _eq: charge.id },
				},
			})
		);

		const transaction = transactions?.[0];
		if (transaction) {
			await directus.request(
				updateItem('payment_transactions', transaction.id, {
					status: 'refunded',
				})
			);

			// Update payment request if linked
			if (transaction.payment_request) {
				await updatePaymentRequest(directus, transaction.payment_request, -(transaction.amount ?? 0));
			}
		}
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
		if (org) {
			// Map Stripe subscription status to our subscription status
			let orgStatus: 'active' | 'trial' | 'canceled' | 'expired' = 'active';
			switch (subscription.status) {
				case 'trialing':
					orgStatus = 'trial';
					break;
				case 'active':
					orgStatus = 'active';
					break;
				case 'canceled':
				case 'unpaid':
					orgStatus = 'canceled';
					break;
				case 'past_due':
				case 'incomplete':
				case 'incomplete_expired':
					orgStatus = 'expired';
					break;
				default:
					orgStatus = 'active';
			}

			const updateData: Record<string, any> = {
				stripe_subscription_id: subscription.id,
				subscription_status: orgStatus,
			};

			// Update trial end date
			if (subscription.trial_end) {
				updateData.trial_ends_at = new Date(subscription.trial_end * 1000).toISOString();
			}

			// For canceled subscriptions, we might want to set a canceled_at date
			if (eventType === 'customer.subscription.deleted') {
				updateData.subscription_status = 'canceled';
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

async function updatePaymentRequest(directus: ReturnType<typeof getTypedDirectus>, paymentRequestId: string, amount: number) {
	try {
		// Get current payment request
		const request = await directus.request(readItem('payment_requests', paymentRequestId));

		if (request) {
			const currentPaid = request.amount_paid || 0;
			const newPaid = currentPaid + amount;
			const totalAmount = request.amount ?? 0;
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
		let memberName: string | null = null;
		let memberEmail: string | null = null;
		let memberUser: string | null = null;

		if (input.memberId) {
			const rows = (await directus.request(
				readItems('hoa_members', {
					filter: { id: { _eq: input.memberId }, organization: { _eq: input.organizationId } },
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
				filter: { id: { _eq: input.organizationId } },
				fields: ['name'],
				limit: 1,
			})
		)) as any[];

		const entry = buildPaymentRecordedEntry({
			organizationId: input.organizationId,
			organizationName: orgs?.[0]?.name ?? null,
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
