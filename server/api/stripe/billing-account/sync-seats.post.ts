// POST /api/stripe/billing-account/sync-seats
// Agency billing P2 (docs/plan-agency-multi-property-billing.md §6-§7): set the
// subscription item `quantity` to the current active-property count. Stripe
// prorates automatically (auto-increment policy — no hard cap). Called whenever
// a property is attached to / detached from the account, and exposed for manual
// reconciliation. Owner / billing_admin only.
import { z } from "zod";
import { updateItem } from "@directus/sdk";

const schema = z.object({ accountId: z.string().min(1) });

export default defineEventHandler(async (event) => {
  const parsed = schema.safeParse(await readBody(event));
  if (!parsed.success) {
    throw createError({ statusCode: 400, message: "accountId is required" });
  }
  const { accountId } = parsed.data;

  await requireBillingAccountRole(event, accountId, ["owner", "billing_admin"]);

  return await syncBillingAccountSeats(accountId);
});
