// POST /api/stripe/portal
// Open the Stripe-hosted Customer Portal for an ORGANIZATION's own subscription
// (the per-org counterpart to /api/stripe/billing-account/portal, which is for
// agency accounts). Lets an org admin update the payment method, view invoices,
// and manage/cancel the subscription without any PCI-scoped custom UI. Returns a
// one-time URL to redirect to. Org admins only.
import { readItem } from "@directus/sdk";
import { z } from "zod";

const schema = z.object({
  organizationId: z.string().min(1),
  returnUrl: z.string().url().optional(),
});

export default defineEventHandler(async (event) => {
  const parsed = schema.safeParse(await readBody(event));
  if (!parsed.success) {
    throw createError({ statusCode: 400, message: "organizationId is required" });
  }
  const { organizationId, returnUrl } = parsed.data;

  // Server-side admin gate — never trust the client's org claim.
  await requireAdminAccess(event, organizationId);

  const directus = getTypedDirectus();
  const org = (await directus
    .request(readItem("hoa_organizations", organizationId, { fields: ["id", "stripe_customer_id"] }))
    .catch(() => null)) as { id: string; stripe_customer_id?: string | null } | null;

  if (!org?.stripe_customer_id) {
    throw createError({
      statusCode: 409,
      message: "No Stripe customer yet — subscribe to a plan first.",
    });
  }

  const config = useRuntimeConfig();
  const appUrl = (config.public.appUrl || "").replace(/\/$/, "");
  const stripe = getStripe();
  const session = await stripe.billingPortal.sessions.create({
    customer: org.stripe_customer_id,
    return_url: returnUrl || `${appUrl}/settings/subscription`,
  });

  return { url: session.url };
});
