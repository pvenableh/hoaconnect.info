// GET /api/ops/overview — the console's front page (docs/plan-operator-console.md §5).
// App Admin and Platform Support (`billing.read`). Directus answers who and
// what state; Stripe answers money. If Stripe is unreachable the Directus half
// still renders, with a warning, rather than the whole page failing.
import { requireOpsPermission } from "#core/server/utils/admin-auth";
import {
  loadOpsCommunities,
  opsEvents,
  opsPromotionCodes,
  opsSubscriptions,
  ourCustomerIds,
} from "#core/server/utils/ops-data";
import { getStripe, isStripeLiveMode } from "#core/server/utils/stripe";
import { countStatuses, isOurStripeObject, summarizeRevenue, withinDays } from "#core/shared/ops/metrics";

export default defineEventHandler(async (event) => {
  await requireOpsPermission(event, "billing.read");
  const now = new Date();

  const { orgs, accounts, rows } = await loadOpsCommunities(now);
  const warnings: string[] = [];

  let revenue: ReturnType<typeof summarizeRevenue> | null = null;
  let failedPayments: { events: number; invoices: number } | null = null;
  let webhooks: { undelivered: number; oldestAt: string | null; types: Record<string, number> } | null = null;
  let discounts: {
    codes: Array<{ id: string; code: string; active: boolean; timesRedeemed: number; maxRedemptions: number | null; percentOff: number | null; amountOff: number | null; duration: string | null }>;
    redemptions: number;
  } | null = null;
  let subsById = new Map<string, any>();

  try {
    const stripe = getStripe();
    const { subs, truncated } = await opsSubscriptions(stripe);
    if (truncated) warnings.push("More subscriptions than the console reads at once; totals are partial.");
    subsById = new Map(subs.map((s) => [s.id, s]));
    revenue = summarizeRevenue(subs, now);
    const customers = ourCustomerIds(orgs, accounts.values(), subs);

    const [failed, undelivered, codes] = await Promise.all([
      opsEvents("invoice.payment_failed:30", { type: "invoice.payment_failed", days: 30 }, stripe),
      opsEvents("undelivered:7", { delivery_success: false, days: 7 }, stripe),
      opsPromotionCodes(stripe),
    ]);

    const failedOurs = failed.items.filter((e) => isOurStripeObject(e.data.object, customers));
    failedPayments = {
      events: failedOurs.length,
      invoices: new Set(failedOurs.map((e) => (e.data.object as { id: string }).id)).size,
    };

    const pending = undelivered.items.filter((e) => isOurStripeObject(e.data.object, customers));
    const types: Record<string, number> = {};
    for (const e of pending) types[e.type] = (types[e.type] ?? 0) + 1;
    const oldest = pending.reduce<number | null>((min, e) => (min == null || e.created < min ? e.created : min), null);
    webhooks = { undelivered: pending.length, oldestAt: oldest ? new Date(oldest * 1000).toISOString() : null, types };

    discounts = {
      codes: codes.map((p) => ({
        id: p.id,
        code: p.code,
        active: p.active,
        timesRedeemed: p.times_redeemed ?? 0,
        maxRedemptions: p.max_redemptions ?? null,
        percentOff: p.coupon?.percent_off ?? null,
        amountOff: p.coupon?.amount_off ?? null,
        duration: p.coupon?.duration ?? null,
      })),
      redemptions: codes.reduce((n, p) => n + (p.times_redeemed ?? 0), 0),
    };
  } catch (e: any) {
    console.error("[ops/overview] Stripe read failed:", e?.message ?? e);
    warnings.push("Stripe couldn't be read just now. Money figures are missing; community counts are current.");
  }

  const communities = rows(subsById);
  return {
    generatedAt: now.toISOString(),
    stripeMode: isStripeLiveMode() ? "live" : "test",
    revenue,
    communities: countStatuses(communities),
    noUnits: communities.filter((c) => c.realUnits === 0).length,
    signups: {
      last7: communities.filter((c) => withinDays(c.signupAt, 7, now)).length,
      last30: communities.filter((c) => withinDays(c.signupAt, 30, now)).length,
    },
    failedPayments,
    webhooks,
    discounts,
    warnings,
  };
});
