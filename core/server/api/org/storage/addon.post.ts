/**
 * POST /api/org/storage/addon  { addon, enabled }   (admin only)
 *
 * Toggle a paid storage add-on (see core/shared/billing/addons.ts) on the org's
 * existing band subscription. Enabling adds a subscription item for the add-on's
 * recurring Stripe Price at the subscription's own interval (Stripe won't mix
 * monthly and yearly items: $10/month or $100/year), prorated; disabling
 * removes whichever of its prices is there. The org's
 * `active_addons` map is updated immediately; the Stripe webhook reconciles it
 * too, so the two never drift.
 *
 * Requires an active paid subscription — add-ons can't attach to a free/trial
 * org with no Stripe subscription. Blocked for demo orgs.
 */

import { updateItem, readItem } from "@directus/sdk";
import {
  resolveStorageContext,
  assertAdmin,
  invalidateOrgStorage,
} from "#core/server/utils/org-storage";
import {
  ADDONS,
  addonPriceForInterval,
  subscriptionInterval,
  type AddonKey,
} from "#core/shared/billing/addons";
import { getStripe } from "#core/server/utils/stripe";
import { addonPriceIds } from "#core/server/utils/addon-prices";

export default defineEventHandler(async (event) => {
  const ctx = await resolveStorageContext(event);
  assertAdmin(ctx);

  const body = await readBody(event);
  const addon = body?.addon as AddonKey;
  const enabled = !!body?.enabled;
  if (!addon || !(addon in ADDONS)) {
    throw createError({ statusCode: 400, statusMessage: "Unknown add-on" });
  }

  const admin = getTypedDirectus();
  const org = (await admin.request(
    readItem("hoa_organizations", ctx.orgId, {
      fields: [
        "id",
        "is_demo",
        "stripe_customer_id",
        "stripe_subscription_id",
        "active_addons",
      ],
    })
  )) as any;

  if (org?.is_demo) {
    throw createError({ statusCode: 403, statusMessage: "Add-ons are disabled in the demo." });
  }

  const allPrices = addonPriceIds();
  const prices = allPrices[addon];
  if (!prices.month && !prices.year) {
    throw createError({
      statusCode: 503,
      statusMessage: `No Stripe price configured for the ${ADDONS[addon].name} add-on.`,
    });
  }

  const subscriptionId = org?.stripe_subscription_id as string | undefined;
  if (!subscriptionId) {
    throw createError({
      statusCode: 409,
      statusMessage: "Add-ons require an active paid subscription.",
    });
  }

  const stripe = getStripe();
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const mine = new Set(Object.values(prices).filter(Boolean) as string[]);
  const existing = subscription.items.data.find((it) => mine.has(it.price.id));

  if (enabled && !existing) {
    const everyAddonPrice = new Set(
      Object.values(allPrices).flatMap((p) => Object.values(p)).filter(Boolean) as string[]
    );
    const interval = subscriptionInterval(subscription.items.data, everyAddonPrice);
    const priceId = addonPriceForInterval(prices, interval);
    if (!priceId) {
      throw createError({
        statusCode: 503,
        statusMessage: `No Stripe price configured for the ${ADDONS[addon].name} add-on on a plan billed every ${interval ?? "unknown interval"}.`,
      });
    }
    await stripe.subscriptionItems.create({
      subscription: subscriptionId,
      price: priceId,
      quantity: 1,
      proration_behavior: "create_prorations",
      metadata: { addon },
    });
  } else if (!enabled && existing) {
    await stripe.subscriptionItems.del(existing.id, {
      proration_behavior: "create_prorations",
    });
  }

  // Reflect the change on the org immediately (webhook also reconciles).
  const nextAddons: Record<string, boolean> = {
    ...(org?.active_addons && typeof org.active_addons === "object" ? org.active_addons : {}),
  };
  if (enabled) nextAddons[addon] = true;
  else delete nextAddons[addon];

  await admin.request(
    updateItem("hoa_organizations", ctx.orgId, {
      active_addons: nextAddons,
    } as Record<string, unknown>)
  );
  invalidateOrgStorage(ctx.orgId);

  return { addon, enabled };
});
