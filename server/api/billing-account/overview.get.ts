// GET /api/billing-account/overview?accountId=...
// Agency dashboard data (docs/plan-agency-multi-property-billing.md §8): the
// account, its properties (with seat usage), members, and live Stripe billing
// info (default payment method + recent/upcoming invoices). Readable by any
// billing-account member (viewer+).
import { readItems } from "@directus/sdk";

export default defineEventHandler(async (event) => {
  const accountId = String(getQuery(event).accountId || "");
  if (!accountId) throw createError({ statusCode: 400, message: "accountId is required" });

  // Any role (incl. viewer) may read.
  await requireBillingAccountRole(event, accountId, ["owner", "billing_admin", "viewer"]);

  const account = await getBillingAccount(accountId);
  const directus = getTypedDirectus();

  // Properties attached to this account.
  const properties = await directus.request(
    readItems("hoa_organizations", {
      filter: { billing_account: { _eq: accountId } },
      fields: ["id", "name", "slug", "status", "member_count"],
      sort: ["name"],
      limit: -1,
    })
  );
  const seatsActive = (properties as any[]).filter((p) => p.status === "active").length;

  // Members of the billing account.
  const members = await directus.request(
    readItems("billing_account_members", {
      filter: { billing_account: { _eq: accountId } },
      fields: ["id", "role", "user.id", "user.email", "user.first_name", "user.last_name"],
      limit: -1,
    })
  );

  // Live Stripe billing info (best-effort — never fail the whole dashboard on a
  // Stripe hiccup).
  let stripeInfo: any = null;
  if (account.stripe_customer_id) {
    try {
      const stripe = getStripe();
      const [customer, invoices] = await Promise.all([
        stripe.customers.retrieve(account.stripe_customer_id, {
          expand: ["invoice_settings.default_payment_method"],
        }),
        stripe.invoices.list({ customer: account.stripe_customer_id, limit: 12 }),
      ]);

      const pm =
        !(customer as any).deleted &&
        ((customer as any).invoice_settings?.default_payment_method as any);
      let upcoming: any = null;
      if (account.stripe_subscription_id) {
        try {
          upcoming = await (stripe.invoices as any).retrieveUpcoming({
            customer: account.stripe_customer_id,
          });
        } catch {
          /* no upcoming invoice (e.g. canceled) */
        }
      }

      stripeInfo = {
        paymentMethod: pm
          ? { brand: pm.card?.brand, last4: pm.card?.last4, exp_month: pm.card?.exp_month, exp_year: pm.card?.exp_year, type: pm.type }
          : null,
        invoices: invoices.data.map((i) => ({
          id: i.id,
          number: i.number,
          status: i.status,
          total: i.total / 100,
          currency: i.currency,
          created: new Date(i.created * 1000).toISOString(),
          hosted_invoice_url: i.hosted_invoice_url,
          invoice_pdf: i.invoice_pdf,
        })),
        upcoming: upcoming
          ? { total: upcoming.total / 100, currency: upcoming.currency, next_payment_attempt: upcoming.next_payment_attempt ? new Date(upcoming.next_payment_attempt * 1000).toISOString() : null }
          : null,
      };
    } catch (e: any) {
      console.warn("[billing-account/overview] Stripe fetch failed:", e?.message || e);
    }
  }

  return {
    account: {
      id: account.id,
      name: account.name,
      status: account.status,
      subscription_status: account.subscription_status,
      trial_ends_at: account.trial_ends_at,
      is_free_account: account.is_free_account === true,
      billing_cycle: account.billing_cycle,
      seats_purchased: account.seats_purchased ?? 0,
      included_properties: account.included_properties ?? 0,
      plan: account.subscription_plan || null,
      hasSubscription: !!account.stripe_subscription_id,
    },
    seatsActive,
    properties,
    members,
    stripe: stripeInfo,
  };
});
