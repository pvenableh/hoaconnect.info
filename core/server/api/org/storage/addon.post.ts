/**
 * POST /api/org/storage/addon  { addon, enabled }   (admin only)
 *
 * Toggle a paid storage add-on (see core/shared/billing/addons.ts) on the org's
 * existing band subscription. Enabling adds a subscription item for the add-on's
 * recurring Stripe Price (prorated); disabling removes it. The org's
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
import { ADDONS, type AddonKey } from "#core/shared/billing/addons";
import { getStripe, isStripeLiveMode } from "#core/server/utils/stripe";

/** Resolve the recurring Stripe Price id for an add-on in the active mode. */
function addonPriceId(addon: AddonKey): string | undefined {
  const config = useRuntimeConfig();
  if (addon === "extra_storage_100") {
    return (
      isStripeLiveMode()
        ? config.stripeAddonStoragePriceLive
        : config.stripeAddonStoragePriceTest
    ) as string | undefined;
  }
  return undefined;
}

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

  const priceId = addonPriceId(addon);
  if (!priceId) {
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
  const existing = subscription.items.data.find((it) => it.price.id === priceId);

  if (enabled && !existing) {
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
