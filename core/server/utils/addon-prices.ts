/**
 * Each paid add-on's Stripe Price ids in the running mode (test or live), one
 * per billing interval, from runtimeConfig. Used by the add-on toggle
 * (api/org/storage/addon.post.ts) and the webhook's reconcile. `isStripeLiveMode`
 * is the auto-imported server util, as the webhook uses it.
 */
import type { AddonKey, AddonPriceIds } from "#core/shared/billing/addons";

export function addonPriceIds(): Record<AddonKey, AddonPriceIds> {
  const config = useRuntimeConfig() as Record<string, unknown>;
  const live = isStripeLiveMode();
  const id = (v: unknown) => (typeof v === "string" && v ? v : undefined);
  return {
    extra_storage_100: {
      month: id(live ? config.stripeAddonStoragePriceLive : config.stripeAddonStoragePriceTest),
      year: id(live ? config.stripeAddonStoragePriceYearlyLive : config.stripeAddonStoragePriceYearlyTest),
    },
  };
}
