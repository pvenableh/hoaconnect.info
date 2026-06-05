import Stripe from 'stripe';
import { z } from 'zod';
// getTypedDirectus, readItem are auto-imported from server/utils/directus.ts

/**
 * Generate a Stripe Connect onboarding / refresh Account Link for an org's
 * Express account, so the user can complete (or continue) onboarding.
 *
 * Body: {
 *   organizationId: uuid,
 *   returnPath?: string,   // app path to return to after onboarding
 *   refreshPath?: string,  // app path Stripe sends to if the link expires
 * }
 *
 * Returns { url } — redirect the browser to it.
 */

const schema = z.object({
  organizationId: z.string().uuid(),
  returnPath: z.string().startsWith('/').optional(),
  refreshPath: z.string().startsWith('/').optional(),
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
    const { organizationId, returnPath, refreshPath } = schema.parse(body);

    const directus = getTypedDirectus();
    const org = (await directus.request(
      readItem('hoa_organizations', organizationId, {
        fields: ['id', 'stripe_connect_account_id'],
      })
    )) as { id: string; stripe_connect_account_id?: string | null };

    if (!org?.stripe_connect_account_id) {
      throw createError({
        statusCode: 400,
        message: 'Organization has no Connect account yet. Create one first.',
      });
    }

    const appUrl = config.public.appUrl || 'http://localhost:3000';
    const returnUrl = `${appUrl}${returnPath || '/admin/settings?connect=return'}`;
    const refreshUrl = `${appUrl}${refreshPath || '/admin/settings?connect=refresh'}`;

    const accountLink = await stripe.accountLinks.create({
      account: org.stripe_connect_account_id,
      return_url: returnUrl,
      refresh_url: refreshUrl,
      type: 'account_onboarding',
    });

    return { url: accountLink.url };
  } catch (error: any) {
    console.error('Connect account-link error:', {
      message: error.message,
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
      message: error.message || 'Account link creation failed',
    });
  }
});
