// POST /api/stripe/billing-account/portal
// Agency dashboard (docs/plan-agency-multi-property-billing.md §8): open the
// Stripe-hosted Customer Portal for the account's customer — update the payment
// method, view/download invoices, manage the subscription — without custom
// PCI-scoped UI. Returns a one-time URL to redirect to. Owner / billing_admin only.
import { z } from "zod";
import { safeReturnUrl } from "#core/server/utils/return-url";

const schema = z.object({
  accountId: z.string().min(1),
  // Checked by safeReturnUrl: the app's own origin only, else the default.
  returnUrl: z.string().optional(),
});

export default defineEventHandler(async (event) => {
  const parsed = schema.safeParse(await readBody(event));
  if (!parsed.success) {
    throw createError({ statusCode: 400, message: "accountId is required" });
  }
  const { accountId, returnUrl } = parsed.data;

  await requireBillingAccountRole(event, accountId, ["owner", "billing_admin"]);
  const account = await getBillingAccount(accountId);

  if (!account.stripe_customer_id) {
    throw createError({
      statusCode: 409,
      message: "No Stripe customer yet — subscribe the account first",
    });
  }

  const stripe = getStripe();
  const session = await stripe.billingPortal.sessions.create({
    customer: account.stripe_customer_id,
    return_url: await safeReturnUrl(event, returnUrl, `/billing/${accountId}`),
  });

  return { url: session.url };
});
