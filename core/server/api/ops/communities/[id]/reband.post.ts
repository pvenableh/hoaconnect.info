// POST /api/ops/communities/:id/reband — move a community to another band, up
// or down, at its next renewal with no proration (launch-followups Session 3,
// Peter's calls 2026-11-10: a band only goes down when the board asks, and this
// is how). App Admin only (`billing.write`). Body: reason, requestId,
// confirmed, bandSlug.
//
// Not for agency-billed communities (the account's quantity is its own
// matter) or the contact-only band (Enterprise is priced by hand). The board's
// HOA Admins and HOA Connect are emailed, as with an automatic move.
import { z } from "zod";
import { isContactOnly } from "#core/shared/billing/bands";
import { beginOpsAction, loadOpsCommunityBilling, opsStripeError, runOpsAction } from "#core/server/utils/ops-actions";
import { announceBandChange, changeBand } from "#core/server/utils/reband";
import { getStripe } from "#core/server/utils/stripe";
import { countOrgUnits, getActiveBands, getDeclaredUnits } from "#core/server/utils/subscription-band";

const schema = z.object({ bandSlug: z.string().min(1, "Choose a band.").max(64) });

export default defineEventHandler(async (event) => {
  const { actor, body } = await beginOpsAction(event, schema);
  const id = getRouterParam(event, "id") ?? "";

  return runOpsAction<{ band: string; from: string | null; renewsAt: string | null }>({
    actor,
    action: "reband",
    targetId: id,
    body,
    perform: async (idempotencyKey) => {
      const c = await loadOpsCommunityBilling(id);
      if (c.account) {
        throw createError({ statusCode: 409, message: `${c.org.name} is billed through ${c.account.name}; its band isn't set per community.` });
      }
      if (!c.subscriptionId) throw createError({ statusCode: 409, message: "There's no Stripe subscription on record." });
      const bands = (await getActiveBands()) as any[];
      const to = bands.find((b) => b.slug === body.bandSlug);
      if (!to) throw createError({ statusCode: 400, message: "No such band." });
      if (isContactOnly(to)) throw createError({ statusCode: 409, message: "Enterprise is priced by hand, not by moving the band." });

      const stripe = getStripe();
      const sub = (await stripe.subscriptions.retrieve(c.subscriptionId).catch(opsStripeError)) as any;
      if (sub.status === "canceled") throw createError({ statusCode: 409, message: "That subscription has ended." });
      const current = (sub.metadata?.band_slug as string | undefined) || null;
      if (current === to.slug) return { result: { band: to.slug, from: current, renewsAt: null }, unchanged: true as const };

      const units = Math.max(await countOrgUnits(c.org.id), await getDeclaredUnits(c.org.id).catch(() => 0));
      const change = await changeBand({ stripe, orgId: c.org.id, sub, to, units, bands, idempotencyKey }).catch((e) =>
        e?.statusCode ? Promise.reject(e) : opsStripeError(e)
      );
      await announceBandChange({ id: c.org.id, name: c.org.name }, change, bands, "request");
      return {
        result: { band: change.to, from: change.from, renewsAt: change.renewsAt },
        audit: {
          summary: `Moved ${c.org.name} from ${change.from ?? "?"} to ${change.to}, from its next renewal${change.renewsAt ? ` (${change.renewsAt.slice(0, 10)})` : ""}; no proration.`,
          organization: c.org.id,
          organizationName: c.org.name,
          stripe: { subscription: sub.id, customer: c.customerId, price: change.priceId },
          before: { band: change.from },
          after: { band: change.to, units, effective: change.renewsAt },
        },
      };
    },
  });
});
