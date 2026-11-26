/**
 * Paid add-on registry — optional recurring extras layered on top of a building's
 * flat band subscription (see core/shared/billing/bands.ts).
 *
 * An org's enabled add-ons are stored as a flat map on
 * `hoa_organizations.active_addons` (JSON), keyed by add-on id:
 *   { "extra_storage_100": true }
 *
 * Each add-on maps to a recurring Stripe Price; toggling it adds/removes a
 * subscription item on the org's existing band subscription. The Stripe Price id
 * is resolved server-side from runtimeConfig (per test/live mode), never here —
 * this module stays pure so both client and server can import it.
 */

/** Bytes in one gigabyte (binary). */
export const GB = 1024 ** 3;

export interface AddonDef {
  /** Stable add-on id — the key in `active_addons` and Stripe item metadata. */
  key: string;
  name: string;
  /** Short marketing line, e.g. "+100 GB". */
  blurb: string;
  description: string;
  /** Recurring price in whole US dollars per month (display only). */
  monthlyPrice: number;
  /** Recurring price in whole US dollars per year, for a community billed yearly (display only). */
  yearlyPrice: number;
  /** Extra file storage this add-on grants, in bytes (0 = not a storage add-on). */
  storageBytes: number;
}

export const ADDONS = {
  extra_storage_100: {
    key: "extra_storage_100",
    name: "Extra Storage",
    blurb: "+100 GB",
    description: "Adds 100 GB of file storage on top of your plan's allotment.",
    monthlyPrice: 10,
    yearlyPrice: 100,
    storageBytes: 100 * GB,
  },
} as const satisfies Record<string, AddonDef>;

export type AddonKey = keyof typeof ADDONS;

export const ADDON_LIST: AddonDef[] = Object.values(ADDONS);

/**
 * An add-on's Stripe Price ids, one per billing interval. Stripe won't mix
 * intervals on one subscription, so the add-on joins a band subscription at
 * the band's own interval.
 */
export type AddonPriceIds = Partial<Record<"month" | "year", string>>;

/** The add-on's price for a subscription billed every `interval` (undefined if none is set up). */
export function addonPriceForInterval(prices: AddonPriceIds, interval: string | null | undefined): string | undefined {
  return interval === "month" || interval === "year" ? prices[interval] : undefined;
}

interface PricedItem {
  price?: { id?: string | null; recurring?: { interval?: string | null } | null } | null;
}

/**
 * The interval a subscription bills on: its plan's item, i.e. the first item
 * that is not an add-on (an add-on always matches the plan anyway).
 */
export function subscriptionInterval(items: readonly PricedItem[], addonPriceIds: ReadonlySet<string>): string | null {
  const plan = items.find((it) => !addonPriceIds.has(it.price?.id ?? "")) ?? items[0];
  return plan?.price?.recurring?.interval ?? null;
}

/** The `active_addons` map for a subscription: an add-on is on when any of its prices is an item. */
export function activeAddonsFromPrices(
  itemPriceIds: Iterable<string | null | undefined>,
  priceByAddon: Record<string, AddonPriceIds>
): Record<string, boolean> {
  const ids = new Set([...itemPriceIds].filter(Boolean));
  const active: Record<string, boolean> = {};
  for (const [addon, prices] of Object.entries(priceByAddon)) {
    if (Object.values(prices).some((id) => id && ids.has(id))) active[addon] = true;
  }
  return active;
}

/** True if the org's `active_addons` map has this add-on enabled. */
export function hasAddon(
  activeAddons: unknown,
  key: AddonKey
): boolean {
  return !!(
    activeAddons &&
    typeof activeAddons === "object" &&
    (activeAddons as Record<string, unknown>)[key]
  );
}

/** Extra storage bytes granted by whatever storage add-ons are active. */
export function addonStorageBytes(activeAddons: unknown): number {
  let bytes = 0;
  for (const addon of ADDON_LIST) {
    if (addon.storageBytes && hasAddon(activeAddons, addon.key as AddonKey)) {
      bytes += addon.storageBytes;
    }
  }
  return bytes;
}
