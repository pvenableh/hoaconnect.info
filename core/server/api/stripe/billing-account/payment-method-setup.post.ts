// POST /api/stripe/billing-account/payment-method-setup
// Agency dashboard (docs/plan-agency-multi-property-billing.md §8): start a
// SetupIntent so the owner/billing_admin can add or replace the single payment
// method on the account's Stripe customer. Returns a client secret for the
// front-end Stripe Elements flow. Owner / billing_admin only.
import { z } from "zod";

const schema = z.object({ accountId: z.string().min(1) });

export default defineEventHandler(async (event) => {
  const parsed = schema.safeParse(await readBody(event));
  if (!parsed.success) {
    throw createError({ statusCode: 400, message: "accountId is required" });
  }
  const { accountId } = parsed.data;

  await requireBillingAccountRole(event, accountId, ["owner", "billing_admin"]);
  const account = await getBillingAccount(accountId);

  if (!account.stripe_customer_id) {
    throw createError({
      statusCode: 409,
      message: "No Stripe customer yet — subscribe the account first",
    });
  }

  const stripe = getStripe();
  const setupIntent = await stripe.setupIntents.create({
    customer: account.stripe_customer_id,
    payment_method_types: ["card", "us_bank_account"],
    metadata: { billing_account_id: accountId },
  });

  return {
    clientSecret: setupIntent.client_secret,
    customerId: account.stripe_customer_id,
    setupIntentId: setupIntent.id,
  };
});
