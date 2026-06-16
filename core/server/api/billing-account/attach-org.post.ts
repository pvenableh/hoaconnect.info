// POST /api/billing-account/attach-org
// Agency billing P4 migration (docs/plan-agency-multi-property-billing.md §9.2):
// move an existing org under a billing account. Sets org.billing_account,
// cancels the org's OWN Stripe subscription (entitlement now resolves up), and
// bumps the account's seat count (Stripe prorates). Requires the caller to
// manage the account (owner/billing_admin) AND be an admin of the org.
import { z } from "zod";
import { readItem, updateItem } from "@directus/sdk";

const schema = z.object({
  accountId: z.string().min(1),
  orgId: z.string().min(1),
});

export default defineEventHandler(async (event) => {
  const parsed = schema.safeParse(await readBody(event));
  if (!parsed.success) {
    throw createError({ statusCode: 400, message: "accountId and orgId are required" });
  }
  const { accountId, orgId } = parsed.data;

  // Must manage the account AND be an admin of the org being moved.
  await requireBillingAccountRole(event, accountId, ["owner", "billing_admin"]);
  const admin = await checkAdminAccess(event, orgId);
  if (!admin.isAdmin) {
    throw createError({
      statusCode: 403,
      message: "You must be an admin of the organization to move it",
    });
  }

  await getBillingAccount(accountId); // 404s if the account is gone
  const directus = getTypedDirectus();

  const org: any = await directus.request(
    readItem("hoa_organizations", orgId, {
      fields: ["id", "billing_account", "stripe_subscription_id"],
    })
  );
  const currentAccount =
    typeof org.billing_account === "object" ? org.billing_account?.id : org.billing_account;
  if (currentAccount && currentAccount !== accountId) {
    throw createError({
      statusCode: 409,
      message: "Organization already belongs to a different billing account; detach it first",
    });
  }

  // Cancel the org's own subscription so it isn't double-billed. Best-effort —
  // a missing/already-canceled sub shouldn't block the attach.
  if (org.stripe_subscription_id) {
    try {
      await getStripe().subscriptions.cancel(org.stripe_subscription_id);
    } catch (e: any) {
      console.warn("[attach-org] could not cancel org subscription:", e?.message || e);
    }
  }

  // Attach + clear the org's own billing pointers (advisory once account-billed).
  await directus.request(
    updateItem("hoa_organizations", orgId, {
      billing_account: accountId,
      stripe_subscription_id: null,
      subscription_status: null,
      trial_ends_at: null,
    })
  );

  // Bump seats (Stripe prorates up).
  const seats = await syncBillingAccountSeats(accountId);

  return { success: true, accountId, orgId, seats: seats.seats };
});
