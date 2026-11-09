// server/utils/stripe.ts
// Shared Stripe client factory. Mirrors the inline setup the existing
// /api/stripe/* routes use (test key off prod NODE_ENV, pinned apiVersion),
// in one place so the agency billing-account routes don't duplicate it.
import Stripe from "stripe";
import { appCustomerSearchQuery, appMetadata } from "#core/shared/billing/stripe-app";

// Keep in lockstep with the existing routes (subscribe-band.post.ts,
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

/**
 * Whether Stripe should transact in LIVE mode. Explicit `STRIPE_MODE=test|live`
 * overrides everything so the production instance can run in test mode for full
 * onboarding + payment dry-runs; unset falls back to NODE_ENV (unchanged default).
 * Mirror of `stripeLiveMode` in core/nuxt.config.ts — keep the two in lockstep.
 */
export function isStripeLiveMode(): boolean {
  const mode = (process.env.STRIPE_MODE || "").toLowerCase();
  if (mode === "test") return false;
  if (mode === "live") return true;
  return process.env.NODE_ENV === "production";
}

export function getStripeSecretKey(): string {
  const config = useRuntimeConfig();
  const key = isStripeLiveMode() ? config.stripeSecretKeyLive : config.stripeSecretKeyTest;
  if (!key) {
    throw createError({
      statusCode: 500,
      message: `Stripe secret key not configured for ${isStripeLiveMode() ? "live" : "test"} mode`,
    });
  }
  return key as string;
}

/**
 * Webhook signing secret for the active mode. Prefers the per-mode secret
 * (`STRIPE_WEBHOOK_SECRET_TEST` / `_LIVE`) so test + live endpoints can coexist,
 * falling back to the single base `STRIPE_WEBHOOK_SECRET`.
 */
export function getStripeWebhookSecret(): string | undefined {
  const config = useRuntimeConfig();
  const perMode = isStripeLiveMode()
    ? config.stripeWebhookSecretLive
    : config.stripeWebhookSecretTest;
  return (perMode || config.stripeWebhookSecret) as string | undefined;
}

/**
 * Every signing secret the webhook route accepts in the active mode: the
 * endpoint for events on Hue's own account (`getStripeWebhookSecret`), then the
 * Connect endpoint for events on connected accounts
 * (`STRIPE_WEBHOOK_SECRET_CONNECT_TEST` / `_LIVE`). Stripe won't put both kinds
 * on one endpoint, and each endpoint signs with its own secret.
 */
export function getStripeWebhookSecrets(): string[] {
  const config = useRuntimeConfig();
  const connect = isStripeLiveMode()
    ? config.stripeWebhookSecretConnectLive
    : config.stripeWebhookSecretConnectTest;
  const all = [getStripeWebhookSecret(), connect].filter(
    (s): s is string => typeof s === "string" && s.length > 0
  );
  return [...new Set(all)];
}

export function getStripe(): Stripe {
  return new Stripe(getStripeSecretKey(), {
    apiVersion: STRIPE_API_VERSION,
    typescript: true,
  });
}

/**
 * Find-or-create a Stripe customer that is HOA Connect's. The account is Hue's
 * and shared (see core/shared/billing/stripe-app.ts), so a plain
 * `customers.list({ email })` could hand back a customer of another Hue
 * product and hang an HOA subscription off it. Search is scoped by the app tag;
 * Stripe Search is eventually consistent (~1 min), so the worst case is a
 * second HOA Connect customer for the same email — never someone else's.
 */
export async function findOrCreateAppCustomer(
  stripe: Stripe,
  input: { email: string; name?: string | null; metadata?: Record<string, string | number | null | undefined> }
): Promise<Stripe.Customer> {
  const found = await stripe.customers.search({ query: appCustomerSearchQuery(input.email), limit: 1 });
  if (found.data[0]) return found.data[0];
  return stripe.customers.create({
    email: input.email,
    name: input.name || undefined,
    metadata: appMetadata(input.metadata ?? {}),
  });
}
