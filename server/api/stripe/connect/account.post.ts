import Stripe from 'stripe';
import { z } from 'zod';
// getTypedDirectus, readItem, updateItem are auto-imported from server/utils/directus.ts

/**
 * Create (or return the existing) Stripe Connect Express account for an HOA
 * organization, so the association can receive resident dues into its own bank.
 *
 * Body: { organizationId: uuid, email?: string }
 *
 * Idempotent: if the org already has a stripe_connect_account_id we return it
 * instead of creating a duplicate account.
 *
 * NOTE (auth): mirrors the existing thin Stripe routes, which trust the
 * organizationId from the client. Before production, gate this so only an
 * HOA admin of the target org can call it (verify the session user's role).
 */

const schema = z.object({
  organizationId: z.string().uuid(),
  email: z.string().email().optional(),
});

export default defineEventHandler(async (event) => {
  try {
    const config = useRuntimeConfig();
    const stripeSecretKey =
      process.env.NODE_ENV === 'production' ? config.stripeSecretKeyLive : config.stripeSecretKeyTest;

    if (!stripeSecretKey) {
      throw createError({ statusCode: 500, message: 'Stripe configuration error: Secret key not found' });
    }

    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2024-11-20.acacia',
      typescript: true,
    });

    const body = await readBody(event);
    const { organizationId, email } = schema.parse(body);

    const directus = getTypedDirectus();

    // Load the org and reuse an existing connected account if present
    const org = (await directus.request(
      readItem('hoa_organizations', organizationId, {
        fields: ['id', 'name', 'stripe_connect_account_id', 'connect_onboarding_status'],
      })
    )) as {
      id: string;
      name?: string | null;
      stripe_connect_account_id?: string | null;
    };

    if (!org) {
      throw createError({ statusCode: 404, message: 'Organization not found' });
    }

    if (org.stripe_connect_account_id) {
      return {
        accountId: org.stripe_connect_account_id,
        created: false,
      };
    }

    // Create an Express account. Capabilities requested so the org can accept
    // card + ACH dues and receive payouts.
    const account = await stripe.accounts.create({
      type: 'express',
      email: email || undefined,
      business_type: 'company',
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
        us_bank_account_ach_payments: { requested: true },
      },
      business_profile: {
        name: org.name || undefined,
        product_description: 'HOA / association dues and assessments',
      },
      metadata: {
        organization_id: organizationId,
      },
    });

    // Persist the account id + initial onboarding state
    await directus.request(
      updateItem('hoa_organizations', organizationId, {
        stripe_connect_account_id: account.id,
        connect_onboarding_status: 'pending',
        connect_charges_enabled: account.charges_enabled ?? false,
        connect_payouts_enabled: account.payouts_enabled ?? false,
      })
    );

    console.log('Stripe Connect account created:', {
      accountId: account.id,
      organizationId,
      timestamp: new Date().toISOString(),
    });

    return {
      accountId: account.id,
      created: true,
    };
  } catch (error: any) {
    console.error('Connect account creation error:', {
      message: error.message,
      code: error.code,
      type: error.type,
      timestamp: new Date().toISOString(),
    });

    if (error.name === 'ZodError') {
      throw createError({ statusCode: 400, message: 'Validation failed', data: error.errors });
    }
    if (error instanceof Stripe.errors.StripeError) {
      throw createError({ statusCode: error.statusCode || 400, message: error.message });
    }
    throw createError({
      statusCode: error.statusCode || 500,
      message: error.message || 'Connect account creation failed',
    });
  }
});
