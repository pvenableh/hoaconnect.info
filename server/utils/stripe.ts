// server/utils/stripe.ts
// Shared Stripe client factory. Mirrors the inline setup the existing
// /api/stripe/* routes use (test key off prod NODE_ENV, pinned apiVersion),
// in one place so the agency billing-account routes don't duplicate it.
import Stripe from "stripe";

// Keep in lockstep with the existing routes (subscription.post.ts,
// webhook.post.ts) so a single account/customer graph is spoken to consistently.
export const STRIPE_API_VERSION = "2024-11-20.acacia" as const;

export function getStripeSecretKey(): string {
  const config = useRuntimeConfig();
  const key =
    process.env.NODE_ENV === "production"
      ? config.stripeSecretKeyLive
      : config.stripeSecretKeyTest;
  if (!key) {
    throw createError({ statusCode: 500, message: "Stripe secret key not configured" });
  }
  return key as string;
}

export function getStripe(): Stripe {
  return new Stripe(getStripeSecretKey(), {
    apiVersion: STRIPE_API_VERSION,
    typescript: true,
  });
}
