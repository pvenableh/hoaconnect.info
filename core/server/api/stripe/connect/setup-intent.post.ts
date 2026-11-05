import Stripe from 'stripe';
import { STRIPE_APP } from "#core/shared/billing/stripe-app";
import { z } from 'zod';
import { readItems, createItem, updateItem } from '@directus/sdk';
// getTypedDirectus, requireMembership, isDemoOrg are auto-imported from server/utils

/**
 * Save a payment method for autopay on the org's CONNECTED Stripe account.
 *
 * Two calls from the owner's Autopay card, both as the signed-in member:
 *
 *   POST { organizationId }
 *     → { clientSecret, customerId, setupIntentId }
 *     A SetupIntent on the connected account for a customer that belongs to
 *     this member there (created on first use, remembered on payment_methods).
 *     The client confirms it with Stripe.js, passing the connected account id.
 *
 *   POST { organizationId, setupIntentId, autopayDay? }
 *     → { paymentMethodId, last4, brand, type }
 *     After confirmation: reads the SetupIntent back from Stripe (never trusts
 *     a payment method id from the browser), attaches it, and upserts the
 *     payment_methods row. `is_autopay` is set only when autopayDay is given.
 *
 * Why the connected account: the billing worker charges autopay off-session
 * as a direct charge on that account (docs/billing-cron.md), and a payment
 * method can only be reused by the account it was saved to.
 *
 * Auth: the session user must be an active member of the org; the row is
 * scoped to THAT member, never to a member id from the body. Demo orgs
 * cannot save methods — nothing in the demo may lead to a real charge.
 */

const schema = z.object({
  organizationId: z.string().uuid(),
  setupIntentId: z.string().startsWith('seti_').optional(),
  autopayDay: z.number().int().min(1).max(28).optional(),
});

export default defineEventHandler(async (event) => {
  try {
    const config = useRuntimeConfig();
    const stripeSecretKey = isStripeLiveMode() ? config.stripeSecretKeyLive : config.stripeSecretKeyTest;
    if (!stripeSecretKey) {
      throw createError({ statusCode: 500, message: 'Stripe configuration error: Secret key not found' });
    }
    const stripe = new Stripe(stripeSecretKey, { apiVersion: STRIPE_API_VERSION, typescript: true });

    const { organizationId, setupIntentId, autopayDay } = schema.parse(await readBody(event));

    const { memberId } = await requireMembership(event, organizationId);
    if (!memberId) throw createError({ statusCode: 403, message: 'No member record for this organization' });

    if (await isDemoOrg(organizationId)) {
      throw createError({ statusCode: 403, message: 'Saved payment methods are disabled in the demo.' });
    }

    const directus = getTypedDirectus();
    const [org] = (await directus.request(
      readItems('hoa_organizations', {
        filter: { id: { _eq: organizationId } },
        fields: ['id', 'name', 'stripe_connect_account_id', 'connect_charges_enabled'],
        limit: 1,
      })
    )) as Array<{ id: string; name?: string | null; stripe_connect_account_id?: string | null; connect_charges_enabled?: boolean | null }>;
    if (!org) throw createError({ statusCode: 404, message: 'Organization not found' });
    if (!org.stripe_connect_account_id || !org.connect_charges_enabled) {
      throw createError({ statusCode: 409, message: 'This association is not set up to collect payments online yet.' });
    }
    const connected = { stripeAccount: org.stripe_connect_account_id };

    const [member] = (await directus.request(
      readItems('hoa_members', {
        filter: { id: { _eq: memberId } },
        fields: ['id', 'email', 'first_name', 'last_name'],
        limit: 1,
      })
    )) as Array<{ id: string; email?: string | null; first_name?: string | null; last_name?: string | null }>;

    // One customer per member per connected account; the first payment_methods
    // row that carries one is the memory of it.
    const existingMethods = (await directus.request(
      readItems('payment_methods', {
        filter: { organization: { _eq: organizationId }, member: { _eq: memberId } },
        fields: ['id', 'stripe_customer_id', 'stripe_payment_method_id', 'status'],
        limit: -1,
      })
    )) as Array<{ id: string; stripe_customer_id?: string | null; stripe_payment_method_id?: string | null; status?: string | null }>;

    let customerId = existingMethods.find((m) => m.stripe_customer_id)?.stripe_customer_id ?? null;
    if (customerId) {
      const c = await stripe.customers.retrieve(customerId, connected);
      if ((c as Stripe.DeletedCustomer).deleted) customerId = null;
    }
    if (!customerId) {
      const customer = await stripe.customers.create(
        {
          email: member?.email || undefined,
          name: [member?.first_name, member?.last_name].filter(Boolean).join(' ') || undefined,
          metadata: { app: STRIPE_APP, organization_id: organizationId, member_id: memberId },
        },
        connected
      );
      customerId = customer.id;
    }

    // ── Step 1: hand the client a SetupIntent to confirm ───────────────────
    if (!setupIntentId) {
      const setupIntent = await stripe.setupIntents.create(
        {
          customer: customerId,
          payment_method_types: ['card', 'us_bank_account'],
          usage: 'off_session',
          metadata: { app: STRIPE_APP, organization_id: organizationId, member_id: memberId },
        },
        connected
      );
      return {
        clientSecret: setupIntent.client_secret,
        customerId,
        setupIntentId: setupIntent.id,
        connectAccountId: org.stripe_connect_account_id,
      };
    }

    // ── Step 2: the client confirmed; record the method ────────────────────
    const setupIntent = await stripe.setupIntents.retrieve(setupIntentId, { expand: ['payment_method'] }, connected);
    if (setupIntent.customer !== customerId) {
      throw createError({ statusCode: 403, message: 'That SetupIntent belongs to another customer' });
    }
    if (setupIntent.status !== 'succeeded' || !setupIntent.payment_method) {
      throw createError({ statusCode: 409, message: `Payment method not confirmed (${setupIntent.status})` });
    }
    const pm = setupIntent.payment_method as Stripe.PaymentMethod;
    const type: 'card' | 'us_bank_account' = pm.type === 'us_bank_account' ? 'us_bank_account' : 'card';
    const last4 = (type === 'card' ? pm.card?.last4 : pm.us_bank_account?.last4) ?? null;
    const brand = (type === 'card' ? pm.card?.brand : pm.us_bank_account?.bank_name) ?? null;

    const row = {
      organization: organizationId,
      member: memberId,
      stripe_customer_id: customerId,
      stripe_payment_method_id: pm.id,
      type,
      last4,
      brand,
      status: 'active' as const,
      ...(autopayDay ? { is_autopay: true, autopay_day: autopayDay } : {}),
    };

    const existing = existingMethods.find((m) => m.stripe_payment_method_id === pm.id);
    const saved = existing
      ? ((await directus.request(updateItem('payment_methods', existing.id, row))) as { id: string })
      : ((await directus.request(createItem('payment_methods', row))) as { id: string });

    // Autopay picks one method per member: enabling this one turns the rest off.
    if (autopayDay) {
      for (const m of existingMethods) {
        if (m.id !== saved.id) await directus.request(updateItem('payment_methods', m.id, { is_autopay: false }));
      }
    }

    return { id: saved.id, paymentMethodId: pm.id, customerId, type, last4, brand };
  } catch (error: any) {
    if (error.name === 'ZodError') {
      throw createError({ statusCode: 400, message: 'Validation failed', data: error.errors });
    }
    if (error instanceof Stripe.errors.StripeError) {
      throw createError({ statusCode: error.statusCode || 400, message: error.message });
    }
    throw error;
  }
});
