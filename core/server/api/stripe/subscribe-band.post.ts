import Stripe from "stripe";
import { appMetadata } from "#core/shared/billing/stripe-app";
import { z } from "zod";
import { readItem, updateItem } from "@directus/sdk";
import type { AcaciaInvoice } from "#core/server/utils/stripe";
import { isCheckoutRefusal, planBandCheckout } from "#core/shared/billing/band-checkout";
import { firstInvoiceLines } from "#core/shared/billing/promotion";
import { getStripe } from "#core/server/utils/stripe";
import { checkPromotionCode, type PromotionCheck } from "#core/server/utils/promotion-code";

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
//
// An optional `promotionCode` (a Stripe promotion code tagged as HOA Connect's) is
// checked before anything is created and applied to the subscription. The amount
// returned for the card is the invoice's own amount due, discount included.

const schema = z.object({
  organizationId: z.string().min(1),
  interval: z.enum(["monthly", "annual"]).default("monthly"),
  onboarding: z.enum(["standard", "signature", "none"]).default("standard"),
  promotionCode: z.string().trim().max(100).optional(),
});

export default defineEventHandler(async (event) => {
  const parsed = schema.safeParse(await readBody(event));
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      message: parsed.error.errors.map((e) => e.message).join(", "),
    });
  }
  const { organizationId, interval, onboarding, promotionCode } = parsed.data;

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

  const stripe = getStripe();
  const { units, band: storedBand } = await resolveBandForOrg(organizationId);
  // This mode's prices, by lookup key — never the ids stored in Directus, which
  // hold whichever mode the prices script ran last.
  const band = await bandWithModePrices(storedBand, stripe);
  const plan = planBandCheckout(band as any, interval, onboarding === "standard" ? "standard" : "none");
  if (isCheckoutRefusal(plan)) throw createError({ statusCode: plan.status, message: plan.message });

  // A code is checked before a customer or subscription exists, so a bad one
  // leaves nothing behind and the board can retry without it.
  let promotion: Extract<PromotionCheck, { ok: true }> | null = null;
  if (promotionCode) {
    const check = await checkPromotionCode(stripe, {
      code: promotionCode,
      lineCents: firstInvoiceLines(plan),
      bandPriceId: plan.recurringPriceId,
      bandName: band?.name,
      customerId: org.stripe_customer_id,
    });
    // `in`, not `ok`: this project's TS settings don't narrow on a boolean tag.
    if ("message" in check) throw createError({ statusCode: 400, message: check.message });
    promotion = check;
  }

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
      metadata: appMetadata({ organization_id: organizationId }),
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
    metadata: appMetadata({
      organization_id: organizationId,
      band_slug: band?.slug ?? "",
      units: String(units),
      billing_interval: interval,
      onboarding,
      promotion_code: promotion?.code,
    }),
  };
  if (plan.onboardingPriceId) subscriptionParams.add_invoice_items = [{ price: plan.onboardingPriceId }];
  if (promotion) subscriptionParams.discounts = [{ promotion_code: promotion.promotionCodeId }];

  let subscription: Stripe.Subscription;
  try {
    subscription = await stripe.subscriptions.create(subscriptionParams);
  } catch (err: any) {
    // Stripe has the last word on a code (e.g. first-time-customer only).
    if (promotion && err?.type === "StripeInvalidRequestError") {
      throw createError({ statusCode: 400, message: `That code can't be used: ${err.message}` });
    }
    throw err;
  }

  let clientSecret: string | null = null;
  let type: "setup_intent" | "payment_intent" = "payment_intent";
  const invoice = (subscription.latest_invoice ?? null) as AcaciaInvoice | null;
  if (subscription.pending_setup_intent) {
    clientSecret = (subscription.pending_setup_intent as Stripe.SetupIntent).client_secret;
    type = "setup_intent";
  } else if (invoice) {
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
    /** What the card is charged: Stripe's own amount due, discount included. */
    amountDueCents: typeof invoice?.amount_due === "number" ? invoice.amount_due : plan.firstInvoiceCents,
    promotion: promotion
      ? { code: promotion.code, label: promotion.label, discountCents: promotion.discountCents }
      : null,
  };
});
