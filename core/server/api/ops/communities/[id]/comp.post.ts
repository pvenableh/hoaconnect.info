// POST /api/ops/communities/:id/comp — mark a community free (comp), or take
// that away. App Admin only (`billing.write`).
//
// Body: reason, requestId, confirmed, free = true | false.
//
// Sets `hoa_organizations.is_free_account`, which entitlement reads first: a
// free community has access whatever its status. Stripe is untouched, so a
// community that still has a running subscription keeps being charged until
// it's canceled; the answer says so (`stillBilled`). An agency-billed
// community's access comes from its billing account, so it isn't changed here.
import { updateItem } from "@directus/sdk";
import { z } from "zod";
import { beginOpsAction, loadOpsCommunityBilling, runOpsAction } from "#core/server/utils/ops-actions";
import { getStripe } from "#core/server/utils/stripe";

const schema = z.object({ free: z.boolean({ message: "Say whether it should be free." }) });

/** Subscription statuses Stripe will still invoice. */
const CHARGING = new Set(["active", "trialing", "past_due", "unpaid", "incomplete"]);

export default defineEventHandler(async (event) => {
  const { actor, body } = await beginOpsAction(event, schema);
  const id = getRouterParam(event, "id") ?? "";

  return runOpsAction({
    actor,
    action: body.free ? "comp_on" : "comp_off",
    targetId: id,
    body,
    perform: async () => {
      const c = await loadOpsCommunityBilling(id);
      if (c.account) {
        throw createError({
          statusCode: 409,
          message: `${c.org.name} is billed through ${c.account.name}; its billing account decides access.`,
        });
      }
      // Asked of Stripe, not of the Directus status, which can say "trial" over a
      // canceled subscription. Unknown (null) when Stripe can't be read.
      let stillBilled: boolean | null = false;
      if (body.free && c.subscriptionId) {
        const sub = (await getStripe()
          .subscriptions.retrieve(c.subscriptionId)
          .catch(() => null)) as { status?: string } | null;
        stillBilled = sub ? CHARGING.has(sub.status ?? "") : null;
      }
      if (c.org.is_free_account === body.free) {
        return { result: { free: body.free, stillBilled }, unchanged: true as const };
      }

      await getTypedDirectus().request(updateItem("hoa_organizations", c.org.id, { is_free_account: body.free } as any));
      return {
        result: { free: body.free, stillBilled },
        audit: {
          summary: body.free
            ? `Marked ${c.org.name} free.${stillBilled ? " Its Stripe subscription is still running." : ""}`
            : `${c.org.name} is no longer free; its subscription status decides access again.`,
          organization: c.org.id,
          organizationName: c.org.name,
          stripe: { subscription: c.subscriptionId, customer: c.customerId },
          before: { is_free_account: c.org.is_free_account, subscription_status: c.org.subscription_status },
          after: { is_free_account: body.free, subscription_status: c.org.subscription_status },
        },
      };
    },
  });
});
