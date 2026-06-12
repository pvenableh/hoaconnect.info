// POST /api/stripe/billing-account/subscribe
// Agency billing P2 (docs/plan-agency-multi-property-billing.md §7): create the
// ONE Stripe customer + ONE subscription for a billing account, with
// `quantity` = the initial active-property count on a flat per-seat price.
// One trial per agency. Reuses the SetupIntent (trial) / PaymentIntent (no
// trial) pattern from /api/stripe/subscription. Owner / billing_admin only.
import { z } from "zod";
import Stripe from "stripe";
import { updateItem } from "@directus/sdk";
import type { AcaciaInvoice } from "~~/server/utils/stripe";

const schema = z.object({
  accountId: z.string().min(1),
  priceId: z.string().min(1, "Price ID is required"),
  billingCycle: z.enum(["monthly", "yearly"]).optional(),
  trialDays: z.number().int().min(0).max(365).optional(),
  // Override the auto-computed seat count (defaults to active property count, min 1).
  quantity: z.number().int().min(1).optional(),
});

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      message: parsed.error.errors.map((e) => e.message).join(", "),
    });
  }
  const { accountId, priceId, billingCycle, trialDays, quantity } = parsed.data;

  // Authorize: must manage this account.
  await requireBillingAccountRole(event, accountId, ["owner", "billing_admin"]);

  const account = await getBillingAccount(accountId);
  const stripe = getStripe();
  const directus = getTypedDirectus();

  // Reuse the existing subscription if one is already attached (idempotent-ish).
  if (account.stripe_subscription_id) {
    throw createError({
      statusCode: 409,
      message:
        "This billing account already has a subscription. Use sync-seats to change the property count.",
    });
  }

  // 1. Get or create the single Stripe customer.
  let customerId: string | undefined = account.stripe_customer_id || undefined;
  const ownerEmail = account.owner?.email;
  const ownerName =
    [account.owner?.first_name, account.owner?.last_name].filter(Boolean).join(" ") ||
    account.name;

  if (!customerId) {
    if (!ownerEmail) {
      throw createError({
        statusCode: 400,
        message: "Billing account has no owner email to create a Stripe customer",
      });
    }
    const existing = await stripe.customers.list({ email: ownerEmail, limit: 1 });
    customerId =
      existing.data[0]?.id ||
      (
        await stripe.customers.create({
          email: ownerEmail,
          name: ownerName,
          metadata: { billing_account_id: accountId },
        })
      ).id;
  }

  // 2. Seat quantity = explicit override, else active property count (min 1).
  const seats = quantity ?? Math.max(1, await countActiveProperties(accountId));

  // 3. Create the subscription (one item, per-seat quantity).
  const params: Stripe.SubscriptionCreateParams = {
    customer: customerId,
    items: [{ price: priceId, quantity: seats }],
    payment_behavior: "default_incomplete",
    payment_settings: { save_default_payment_method: "on_subscription" },
    expand: ["latest_invoice.payment_intent", "pending_setup_intent"],
    metadata: { billing_account_id: accountId },
    proration_behavior: "create_prorations",
  };
  if (trialDays && trialDays > 0) params.trial_period_days = trialDays;

  const subscription = await stripe.subscriptions.create(params);

  // 4. Persist onto the billing account (entitlement source for child orgs).
  const mapped = mapStripeStatus(subscription.status);
  const interval = subscription.items?.data?.[0]?.price?.recurring?.interval;
  await directus.request(
    updateItem("billing_accounts", accountId, {
      stripe_customer_id: customerId,
      stripe_subscription_id: subscription.id,
      subscription_status: mapped.subscription_status,
      status: mapped.status,
      seats_purchased: subscription.items?.data?.[0]?.quantity ?? seats,
      billing_cycle: billingCycle || (interval === "year" ? "yearly" : "monthly"),
      trial_ends_at: subscription.trial_end
        ? new Date(subscription.trial_end * 1000).toISOString()
        : null,
    })
  );

  // 5. Return the client secret the front-end needs to confirm payment / setup.
  let clientSecret: string | null = null;
  let type: "setup_intent" | "payment_intent" = "payment_intent";
  if (subscription.pending_setup_intent) {
    clientSecret = (subscription.pending_setup_intent as Stripe.SetupIntent).client_secret;
    type = "setup_intent";
  } else if (subscription.latest_invoice) {
    const invoice = subscription.latest_invoice as AcaciaInvoice;
    const pi = invoice.payment_intent as Stripe.PaymentIntent | null;
    if (pi) {
      clientSecret = pi.client_secret;
      type = "payment_intent";
    }
  }

  return {
    accountId,
    subscriptionId: subscription.id,
    customerId,
    seats: subscription.items?.data?.[0]?.quantity ?? seats,
    clientSecret,
    type,
    status: subscription.status,
    trialEnd: subscription.trial_end
      ? new Date(subscription.trial_end * 1000).toISOString()
      : null,
  };
});
