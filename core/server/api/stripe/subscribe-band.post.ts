import Stripe from "stripe";
import { z } from "zod";
import type { AcaciaInvoice } from "#core/server/utils/stripe";
import { isContactOnly } from "#core/shared/billing/bands";

// Flat-per-building checkout. Resolves the building's size band (by unit count
// or explicit slug), then creates a subscription on that band's flat recurring
// price. Standard onboarding is attached as a one-time first-invoice item
// (add_invoice_items) so it's charged once alongside the first period.
//
// Signature onboarding is custom-invoiced (50% deposit / 50% on launch) — it has
// NO fixed Stripe price, so it is never added here; pass onboarding:"signature"
// to skip the onboarding line and handle it via a manual invoice.

const schema = z.object({
  email: z.string().email(),
  name: z.string().optional(),
  // Pick the band either by unit count or directly by slug.
  units: z.number().int().min(0).optional(),
  slug: z.string().optional(),
  interval: z.enum(["monthly", "annual"]).default("monthly"),
  onboarding: z.enum(["standard", "signature", "none"]).default("standard"),
  customerId: z.string().optional(),
  metadata: z.record(z.string()).optional(),
});

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const stripeSecretKey =
    process.env.NODE_ENV === "production" ? config.stripeSecretKeyLive : config.stripeSecretKeyTest;
  if (!stripeSecretKey) {
    throw createError({ statusCode: 500, message: "Stripe secret key not configured" });
  }
  const stripe = new Stripe(stripeSecretKey, {
    apiVersion: STRIPE_API_VERSION,
    typescript: true,
  });

  const body = await readBody(event);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      message: parsed.error.errors.map((e) => e.message).join(", "),
    });
  }
  const { email, name, units, slug, interval, onboarding, customerId, metadata } = parsed.data;
  if (units == null && !slug) {
    throw createError({ statusCode: 400, message: "Provide either units or slug" });
  }

  // Resolve the band.
  const bands = await getActiveBands();
  const band = slug
    ? bands.find((b) => b.slug === slug) ?? null
    : await selectBandForUnits(units ?? 0);
  if (!band) {
    throw createError({ statusCode: 404, message: "No matching subscription band" });
  }
  if (isContactOnly(band)) {
    throw createError({
      statusCode: 409,
      message: `The ${band.name} tier is contact-only — no self-serve checkout.`,
    });
  }

  const recurringPrice =
    interval === "annual" ? band.stripe_price_id_yearly : band.stripe_price_id_monthly;
  if (!recurringPrice) {
    throw createError({
      statusCode: 503,
      message: `No Stripe ${interval} price configured for the ${band.name} band. Run pnpm stripe:subscription-prices.`,
    });
  }

  // Get or create the customer.
  let customer: Stripe.Customer;
  if (customerId) {
    const retrieved = (await stripe.customers.retrieve(customerId)) as
      | Stripe.Customer
      | Stripe.DeletedCustomer;
    if (retrieved.deleted) {
      throw createError({ statusCode: 400, message: "Customer has been deleted" });
    }
    customer = retrieved as Stripe.Customer;
  } else {
    const existing = await stripe.customers.list({ email, limit: 1 });
    customer =
      existing.data[0] ??
      (await stripe.customers.create({ email, name: name || undefined, metadata: metadata || {} }));
  }

  const subMetadata: Record<string, string> = {
    ...(metadata || {}),
    band_slug: band.slug ?? "",
    billing_interval: interval,
    onboarding,
  };

  const subscriptionParams: Stripe.SubscriptionCreateParams = {
    customer: customer.id,
    items: [{ price: recurringPrice }],
    payment_behavior: "default_incomplete",
    payment_settings: { save_default_payment_method: "on_subscription" },
    expand: ["latest_invoice.payment_intent", "pending_setup_intent"],
    metadata: subMetadata,
  };

  // Standard onboarding → one-time charge on the first invoice. Signature is
  // custom-invoiced separately, so it never adds a line here.
  if (onboarding === "standard") {
    if (!band.stripe_price_id_onboarding) {
      throw createError({
        statusCode: 503,
        message: `No Stripe onboarding price configured for the ${band.name} band. Run pnpm stripe:subscription-prices.`,
      });
    }
    subscriptionParams.add_invoice_items = [{ price: band.stripe_price_id_onboarding }];
  }

  const subscription = await stripe.subscriptions.create(subscriptionParams);

  let clientSecret: string | null = null;
  let type: "setup_intent" | "payment_intent" = "payment_intent";
  if (subscription.pending_setup_intent) {
    clientSecret = (subscription.pending_setup_intent as Stripe.SetupIntent).client_secret;
    type = "setup_intent";
  } else if (subscription.latest_invoice) {
    const invoice = subscription.latest_invoice as AcaciaInvoice;
    const paymentIntent = invoice.payment_intent as Stripe.PaymentIntent | undefined;
    if (paymentIntent) clientSecret = paymentIntent.client_secret;
  }

  return {
    subscriptionId: subscription.id,
    customerId: customer.id,
    clientSecret,
    type,
    status: subscription.status,
    band: { slug: band.slug, name: band.name },
    interval,
    onboarding,
  };
});
