// POST /api/ops/communities/:id/trial — extend a community's trial to a later
// date. App Admin only (`billing.write`).
//
// Body: reason, requestId, confirmed, trialEndsOn = "YYYY-MM-DD" (the trial
// runs to the end of that day, UTC; at most TRIAL_MAX_DAYS from today).
//
// Trials live on `hoa_organizations` (status `trial` plus `trial_ends_at`).
// If Stripe is also running a trial on the community's subscription, its
// `trial_end` moves too, or the next webhook would put the old date back.
// A paying community gets "mark free", not a trial. An agency-billed community's
// access comes from its billing account, so it isn't changed here.
import { updateItem } from "@directus/sdk";
import { z } from "zod";
import { TRIAL_MAX_DAYS } from "#core/shared/ops/actions";
import { shortDate } from "#core/shared/ops/format";
import {
  beginOpsAction,
  loadOpsCommunityBilling,
  opsStripeError,
  runOpsAction,
} from "#core/server/utils/ops-actions";
import { getStripe } from "#core/server/utils/stripe";

const schema = z.object({ trialEndsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick the date the trial should end.") });

const PAYING = new Set(["active", "past_due"]);

export default defineEventHandler(async (event) => {
  const { actor, body } = await beginOpsAction(event, schema);
  const id = getRouterParam(event, "id") ?? "";

  return runOpsAction({
    actor,
    action: "extend_trial",
    targetId: id,
    body,
    perform: async (idempotencyKey) => {
      const c = await loadOpsCommunityBilling(id);
      if (c.account) {
        throw createError({
          statusCode: 409,
          message: `${c.org.name} is billed through ${c.account.name}; its billing account decides access.`,
        });
      }
      const until = new Date(`${body.trialEndsOn}T23:59:59.000Z`);
      const now = new Date();
      if (Number.isNaN(until.getTime())) throw createError({ statusCode: 400, message: "That isn't a date." });
      if (until <= now) throw createError({ statusCode: 400, message: "Pick a date after today." });
      if (until.getTime() - now.getTime() > TRIAL_MAX_DAYS * 86_400_000) {
        throw createError({ statusCode: 400, message: `A trial can run at most ${TRIAL_MAX_DAYS} days from today.` });
      }
      const status = c.org.subscription_status;
      if (status && PAYING.has(status)) {
        throw createError({ statusCode: 409, message: "It's a paying community. Mark it free instead of giving it a trial." });
      }
      const current = c.org.trial_ends_at ? new Date(c.org.trial_ends_at) : null;
      const before = { subscription_status: status, trial_ends_at: c.org.trial_ends_at };
      if (status === "trial" && current && current.getTime() === until.getTime()) {
        return { result: before, unchanged: true as const };
      }
      if (status === "trial" && current && current > until) {
        throw createError({ statusCode: 400, message: `The trial already runs to ${shortDate(current.toISOString())}. Pick a later date.` });
      }

      // A trial Stripe is running has to move with it.
      let stripeSub: string | null = null;
      if (c.subscriptionId) {
        const stripe = getStripe();
        const sub = (await stripe.subscriptions.retrieve(c.subscriptionId).catch(opsStripeError)) as any;
        if (PAYING.has(sub.status)) {
          throw createError({ statusCode: 409, message: "Stripe shows it paying. Mark it free instead of giving it a trial." });
        }
        if (sub.status === "trialing") {
          await stripe.subscriptions
            .update(sub.id, { trial_end: Math.floor(until.getTime() / 1000), proration_behavior: "none" }, { idempotencyKey })
            .catch(opsStripeError);
          stripeSub = sub.id;
        }
      }

      const after = { subscription_status: "trial", trial_ends_at: until.toISOString() };
      await getTypedDirectus().request(updateItem("hoa_organizations", c.org.id, after as any));
      return {
        result: after,
        invalidate: stripeSub ? ["subscriptions", `sub:${stripeSub}`] : [],
        audit: {
          summary: `Extended ${c.org.name}'s trial to ${shortDate(after.trial_ends_at)}${stripeSub ? " (and its Stripe trial)" : ""}.`,
          organization: c.org.id,
          organizationName: c.org.name,
          stripe: { subscription: stripeSub, customer: c.customerId },
          before,
          after,
        },
      };
    },
  });
});
