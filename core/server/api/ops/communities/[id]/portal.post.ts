// POST /api/ops/communities/:id/portal — open the Stripe billing portal for the
// customer that pays for this community, to see what its HOA Admins see.
// App Admin only (`billing.write`): the portal can change the card and cancel.
//
// Body: reason, requestId, confirmed. Returns `{ url }`, a one-time link. The
// link is a credential for the customer's billing, so the audit row records the
// session id and never the URL. Returns to this community's /ops page.
import { z } from "zod";
import { beginOpsAction, loadOpsCommunityBilling, opsStripeError, runOpsAction } from "#core/server/utils/ops-actions";
import { getStripe } from "#core/server/utils/stripe";

export default defineEventHandler(async (event) => {
  const { actor, body } = await beginOpsAction(event, z.object({}));
  const id = getRouterParam(event, "id") ?? "";

  return runOpsAction({
    actor,
    action: "portal_open",
    targetId: id,
    body,
    perform: async (idempotencyKey) => {
      const c = await loadOpsCommunityBilling(id);
      if (!c.customerId) throw createError({ statusCode: 409, message: "There's no Stripe customer on record." });
      const appUrl = String(useRuntimeConfig().public.appUrl || "").replace(/\/$/, "");
      const session = await getStripe()
        .billingPortal.sessions.create(
          { customer: c.customerId, return_url: `${appUrl}/ops/communities/${encodeURIComponent(c.org.id)}` },
          { idempotencyKey }
        )
        .catch(opsStripeError);
      const whose = c.account ? `${c.account.name} (agency billing, includes ${c.org.name})` : c.org.name;
      return {
        result: { url: session.url },
        audit: {
          summary: `Opened the Stripe billing portal for ${whose}.`,
          organization: c.org.id,
          organizationName: c.org.name,
          billingAccount: c.account?.id ?? null,
          stripe: { customer: c.customerId, portal_session: session.id },
        },
      };
    },
  });
});
