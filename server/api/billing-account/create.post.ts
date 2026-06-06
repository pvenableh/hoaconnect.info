// POST /api/billing-account/create
// Agency billing onboarding (docs/plan-agency-multi-property-billing.md §9.1):
// create a billing_accounts row with the caller as `owner` + an owner
// billing_account_members row. Stripe is attached separately via
// /api/stripe/billing-account/subscribe (P2). Any authenticated user may create
// an account they own.
import { z } from "zod";
import { createItem } from "@directus/sdk";

const schema = z.object({
  name: z.string().min(1, "Name is required"),
  isFreeAccount: z.boolean().optional(),
});

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuthenticatedUser(event);

  const parsed = schema.safeParse(await readBody(event));
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      message: parsed.error.errors.map((e) => e.message).join(", "),
    });
  }
  const { name, isFreeAccount } = parsed.data;

  const directus = getTypedDirectus();

  const account = await directus.request(
    createItem("billing_accounts", {
      name,
      owner: userId,
      status: "active",
      // No Stripe yet → trial until subscribe() runs (or free if comped).
      subscription_status: isFreeAccount ? "active" : "trial",
      is_free_account: isFreeAccount ?? false,
      seats_purchased: 0,
      included_properties: 0,
    })
  );

  await directus.request(
    createItem("billing_account_members", {
      billing_account: account.id,
      user: userId,
      role: "owner",
    })
  );

  return { success: true, account: { id: account.id, name: account.name } };
});
