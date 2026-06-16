// server/utils/stripe.ts
// Shared Stripe client factory. Mirrors the inline setup the existing
// /api/stripe/* routes use (test key off prod NODE_ENV, pinned apiVersion),
// in one place so the agency billing-account routes don't duplicate it.
import Stripe from "stripe";

// Keep in lockstep with the existing routes (subscription.post.ts,
// webhook.post.ts) so a single account/customer graph is spoken to consistently.
// stripe-node v20 types assume its own pinned version ("…clover"), but we
// deliberately stay on the acacia wire format until the basil invoice migration
// (invoice.payment_intent/subscription moved) is done — hence the cast.
export const STRIPE_API_VERSION = "2024-11-20.acacia" as unknown as Stripe.LatestApiVersion;

// Acacia response shapes for fields the v20 (clover) types dropped. With the
// pinned STRIPE_API_VERSION above these fields ARE present at runtime.
export type AcaciaInvoice = Stripe.Invoice & {
  payment_intent?: string | Stripe.PaymentIntent | null;
  subscription?: string | Stripe.Subscription | null;
};

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
