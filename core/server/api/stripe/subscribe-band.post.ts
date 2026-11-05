import Stripe from "stripe";
import { z } from "zod";
import { readItem, updateItem } from "@directus/sdk";
import type { AcaciaInvoice } from "#core/server/utils/stripe";
import { isCheckoutRefusal, planBandCheckout } from "#core/shared/billing/band-checkout";
import { getStripe } from "#core/server/utils/stripe";

// POST /api/stripe/subscribe-band — an ORGANIZATION subscribes on its band.
//
// Flat-per-building checkout. The band is resolved SERVER-SIDE from the org's
// unit count (a board can't pick a cheaper band), then a subscription is created
// on that band's flat recurring price. Standard onboarding is attached as a
// one-time first-invoice item (add_invoice_items) so it's charged once alongside
// the first period. Signature onboarding is custom-invoiced (50% deposit / 50% on
// launch) — it has NO fixed Stripe price, so it never adds a line here.
//
// The org's `stripe_customer_id` is written BEFORE the subscription is created:
// the subscription webhook finds the org by that id, so without it a paid
// subscription never flipped the org to `active` (the Phase 9 finding — the old
// per-plan route never persisted it). Org admins only.

const schema = z.object({
  organizationId: z.string().min(1),
  interval: z.enum(["monthly", "annual"]).default("monthly"),
  onboarding: z.enum(["standard", "signature", "none"]).default("standard"),
});

export default defineEventHandler(async (event) => {
  const parsed = schema.safeParse(await readBody(event));
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      message: parsed.error.errors.map((e) => e.message).join(", "),
    });
  }
  const { organizationId, interval, onboarding } = parsed.data;

  // Server-side admin gate — never trust the client's org claim.
  await requireAdminAccess(event, organizationId);
  const session = await requireUserSession(event);

  const directus = getTypedDirectus();
  const org = (await directus.request(
    readItem("hoa_organizations", organizationId, {
      fields: ["id", "name", "is_demo", "stripe_customer_id", "stripe_subscription_id", "subscription_status"],
    })
  )) as {
    id: string;
    name?: string | null;
    is_demo?: boolean | null;
    stripe_customer_id?: string | null;
    stripe_subscription_id?: string | null;
    subscription_status?: string | null;
  } | null;
  if (!org) throw createError({ statusCode: 404, message: "Organization not found" });
  if (org.is_demo) throw createError({ statusCode: 403, message: "Billing is disabled in the demo." });
  if (org.stripe_subscription_id && org.subscription_status === "active") {
    throw createError({
      statusCode: 409,
      message: "This community already has an active subscription — manage it from the billing portal.",
    });
  }

  const { units, band } = await resolveBandForOrg(organizationId);
  const plan = planBandCheckout(band as any, interval, onboarding === "standard" ? "standard" : "none");
  if (isCheckoutRefusal(plan)) throw createError({ statusCode: plan.status, message: plan.message });

  const stripe = getStripe();

  // The org's customer: reuse the one on file, else create and PERSIST it first.
  let customerId = org.stripe_customer_id || null;
  if (customerId) {
    const existing = (await stripe.customers.retrieve(customerId)) as Stripe.Customer | Stripe.DeletedCustomer;
    if (existing.deleted) customerId = null;
  }
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: (session.user as any)?.email || undefined,
      name: org.name || undefined,
      metadata: { organization_id: organizationId },
    });
    customerId = customer.id;
    await directus.request(updateItem("hoa_organizations", organizationId, { stripe_customer_id: customerId } as any));
  }

  const subscriptionParams: Stripe.SubscriptionCreateParams = {
    customer: customerId,
    items: [{ price: plan.recurringPriceId }],
    payment_behavior: "default_incomplete",
    payment_settings: { save_default_payment_method: "on_subscription" },
    expand: ["latest_invoice.payment_intent", "pending_setup_intent"],
    metadata: {
      organization_id: organizationId,
      band_slug: band?.slug ?? "",
      units: String(units),
      billing_interval: interval,
      onboarding,
    },
  };
  if (plan.onboardingPriceId) subscriptionParams.add_invoice_items = [{ price: plan.onboardingPriceId }];

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
    customerId,
    clientSecret,
    type,
    status: subscription.status,
    band: { slug: band?.slug ?? null, name: band?.name ?? null },
    interval,
    onboarding,
    firstInvoiceCents: plan.firstInvoiceCents,
  };
});
