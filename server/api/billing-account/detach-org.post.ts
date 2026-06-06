// POST /api/billing-account/detach-org
// Agency billing P4 migration (docs/plan-agency-multi-property-billing.md §9.3):
// remove an org from its billing account. Clears org.billing_account and
// decrements the account's seats (Stripe prorates down). The org reverts to
// self-billed and is set `expired` — it must subscribe on its own to regain
// access (normal gating). Requires the caller to manage the account
// (owner/billing_admin) AND be an admin of the org.
import { z } from "zod";
import { readItem, updateItem } from "@directus/sdk";

const schema = z.object({ orgId: z.string().min(1) });

export default defineEventHandler(async (event) => {
  const parsed = schema.safeParse(await readBody(event));
  if (!parsed.success) {
    throw createError({ statusCode: 400, message: "orgId is required" });
  }
  const { orgId } = parsed.data;

  const directus = getTypedDirectus();
  const org: any = await directus.request(
    readItem("hoa_organizations", orgId, { fields: ["id", "billing_account"] })
  );
  const accountId =
    typeof org.billing_account === "object" ? org.billing_account?.id : org.billing_account;
  if (!accountId) {
    throw createError({ statusCode: 409, message: "Organization is not account-billed" });
  }

  await requireBillingAccountRole(event, accountId, ["owner", "billing_admin"]);
  const admin = await checkAdminAccess(event, orgId);
  if (!admin.isAdmin) {
    throw createError({
      statusCode: 403,
      message: "You must be an admin of the organization to detach it",
    });
  }

  // Revert to self-billed; expired until it subscribes on its own (gating §9.3).
  await directus.request(
    updateItem("hoa_organizations", orgId, {
      billing_account: null,
      subscription_status: "expired",
    })
  );

  const seats = await syncBillingAccountSeats(accountId);

  return { success: true, orgId, accountId, seats: seats.seats };
});
