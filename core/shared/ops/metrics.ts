// The operator console's numbers, as pure functions (docs/plan-operator-console.md §5,
// Phase 1). The routes feed them Stripe and Directus rows; the tests feed them
// fixtures. Nothing here calls anything.

import { isHoaConnectObject } from "#core/shared/billing/stripe-app";

// ── Money: monthly recurring revenue ────────────────────────────────────────

/** The parts of a Stripe subscription (acacia wire format) the maths reads. */
export interface SubscriptionLike {
  id?: string;
  status: string;
  customer?: string | { id: string } | null;
  metadata?: Record<string, unknown> | null;
  items?: {
    data: Array<{
      quantity?: number | null;
      price?: {
        unit_amount?: number | null;
        currency?: string | null;
        recurring?: { interval: "day" | "week" | "month" | "year"; interval_count?: number | null } | null;
      } | null;
    }>;
  } | null;
  /** Acacia still returns the single applied discount here. */
  discount?: DiscountLike | string | null;
}

export interface DiscountLike {
  end?: number | null;
  coupon?: {
    percent_off?: number | null;
    amount_off?: number | null;
    duration?: "once" | "repeating" | "forever" | null;
  } | null;
}

/** Months in one billing period of this interval. */
function monthsPer(interval: string, count: number): number {
  switch (interval) {
    case "day":
      return (count * 12) / 365;
    case "week":
      return (count * 12) / 52;
    case "year":
      return count * 12;
    case "month":
    default:
      return count;
  }
}

/**
 * A subscription's value per month, in the smallest currency unit.
 *
 * - Each item: unit amount × quantity, divided by the months in its period. An
 *   agency's one subscription has quantity = properties, so it counts by quantity.
 * - A discount still running (`forever`, or `repeating` with an end in the
 *   future) comes off. A `once` discount touched one invoice and doesn't recur.
 * - An item without a flat unit amount (metered, tiered) can't be valued from the
 *   subscription alone; it counts as 0 and is reported in `unpriced`.
 */
export function monthlyValue(sub: SubscriptionLike, now: Date = new Date()): { cents: number; unpriced: number; currency: string | null } {
  let gross = 0;
  let unpriced = 0;
  let currency: string | null = null;
  let periodMonths = 1;
  for (const item of sub.items?.data ?? []) {
    const price = item.price;
    const recurring = price?.recurring;
    if (!recurring) continue; // a one-off invoice item, e.g. onboarding
    const months = monthsPer(recurring.interval, recurring.interval_count || 1);
    periodMonths = months;
    if (price?.unit_amount == null) {
      unpriced += 1;
      continue;
    }
    currency ??= price.currency ?? null;
    gross += (price.unit_amount * (item.quantity ?? 1)) / months;
  }

  let net = gross;
  const discount = typeof sub.discount === "object" ? sub.discount : null;
  const coupon = discount?.coupon;
  const running =
    !!coupon &&
    coupon.duration !== "once" &&
    (discount?.end == null || discount.end * 1000 > now.getTime());
  if (running && coupon) {
    if (coupon.percent_off) net = gross * (1 - coupon.percent_off / 100);
    else if (coupon.amount_off) net = gross - coupon.amount_off / periodMonths;
  }
  return { cents: Math.max(0, Math.round(net)), unpriced, currency };
}

export interface RevenueSummary {
  /** Monthly recurring revenue from `active` subscriptions. */
  mrrCents: number;
  arrCents: number;
  /** What `past_due` subscriptions would add if they paid: at risk, not counted. */
  atRiskMrrCents: number;
  activeSubscriptions: number;
  /** Count of HOA Connect subscriptions by Stripe status. */
  byStatus: Record<string, number>;
  unpricedItems: number;
  currencies: string[];
}

/** MRR over HOA Connect's subscriptions only (the account is shared with Hue's other products). */
export function summarizeRevenue(subs: SubscriptionLike[], now: Date = new Date()): RevenueSummary {
  let mrr = 0;
  let atRisk = 0;
  let active = 0;
  let unpriced = 0;
  const byStatus: Record<string, number> = {};
  const currencies = new Set<string>();
  for (const sub of subs) {
    if (!isHoaConnectObject(sub.metadata as Record<string, unknown> | null)) continue;
    byStatus[sub.status] = (byStatus[sub.status] ?? 0) + 1;
    if (sub.status !== "active" && sub.status !== "past_due") continue;
    const v = monthlyValue(sub, now);
    unpriced += v.unpriced;
    if (v.currency) currencies.add(v.currency);
    if (sub.status === "active") {
      mrr += v.cents;
      active += 1;
    } else {
      atRisk += v.cents;
    }
  }
  return {
    mrrCents: mrr,
    arrCents: mrr * 12,
    atRiskMrrCents: atRisk,
    activeSubscriptions: active,
    byStatus,
    unpricedItems: unpriced,
    currencies: [...currencies],
  };
}

// ── Communities: which bucket each one is in ────────────────────────────────

export type CommunityStatus = "active" | "trial" | "past_due" | "expired" | "canceled" | "free";

export interface BillingSourceLike {
  subscription_status?: string | null;
  trial_ends_at?: string | null;
  is_free_account?: boolean | null;
  grace_ends_at?: string | null;
}

export interface CommunityStatusResult {
  status: CommunityStatus;
  /** A trial ending within `TRIAL_ENDING_DAYS`. Also counted under `trial`. */
  trialEndingSoon: boolean;
  /** Billed through an agency billing account (status resolves up to it). */
  agency: boolean;
  /** Kept running by a management-transition grace window. */
  inGrace: boolean;
}

export const TRIAL_ENDING_DAYS = 3;
const DAY_MS = 86_400_000;

/**
 * One community's bucket, from the same fields entitlement reads: the org's
 * own, or its billing account's when it's agency-billed (pass the account).
 *
 * A trial whose end date has passed is `expired` here even if the status still
 * says `trial`: that is how the app treats it (`isEntitledFrom`), and the
 * console should show what the board sees.
 */
export function communityStatus(
  org: BillingSourceLike & { billing_account?: unknown },
  account: BillingSourceLike | null,
  now: Date = new Date()
): CommunityStatusResult {
  const agency = !!org.billing_account;
  const src = agency && account ? account : org;
  const inGrace = !!org.grace_ends_at && new Date(org.grace_ends_at) > now;
  const result = (status: CommunityStatus, trialEndingSoon = false): CommunityStatusResult => ({
    status,
    trialEndingSoon,
    agency,
    inGrace,
  });

  if (src.is_free_account === true) return result("free");
  switch (src.subscription_status) {
    case "active":
      return result("active");
    case "trial": {
      if (!src.trial_ends_at) return result("trial");
      const end = new Date(src.trial_ends_at).getTime();
      if (end <= now.getTime()) return result("expired");
      return result("trial", end - now.getTime() <= TRIAL_ENDING_DAYS * DAY_MS);
    }
    case "past_due":
      return result("past_due");
    case "canceled":
      return result("canceled");
    default:
      return result("expired");
  }
}

export interface StatusCounts {
  total: number;
  active: number;
  trial: number;
  trial_ending: number;
  past_due: number;
  expired: number;
  canceled: number;
  free: number;
  agency: number;
}

export function countStatuses(rows: CommunityStatusResult[]): StatusCounts {
  const c: StatusCounts = {
    total: 0,
    active: 0,
    trial: 0,
    trial_ending: 0,
    past_due: 0,
    expired: 0,
    canceled: 0,
    free: 0,
    agency: 0,
  };
  for (const r of rows) {
    c.total += 1;
    c[r.status] += 1;
    if (r.trialEndingSoon) c.trial_ending += 1;
    if (r.agency) c.agency += 1;
  }
  return c;
}

/** Created within the last `days` days. */
export function withinDays(iso: string | null | undefined, days: number, now: Date = new Date()): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) && t <= now.getTime() && now.getTime() - t <= days * DAY_MS;
}

// ── Stripe objects: is this one ours? ───────────────────────────────────────

/**
 * Is a Stripe object (an invoice, charge, subscription, customer, or an event's
 * object) HOA Connect's? Tagged metadata, the subscription's metadata on an
 * invoice, or a customer we know (an org's or a billing account's).
 */
export function isOurStripeObject(obj: any, ourCustomers: ReadonlySet<string>): boolean {
  if (!obj || typeof obj !== "object") return false;
  if (isHoaConnectObject(obj.metadata)) return true;
  if (isHoaConnectObject(obj.subscription_details?.metadata)) return true;
  if (obj.object === "customer" && typeof obj.id === "string") return ourCustomers.has(obj.id);
  const cus = typeof obj.customer === "string" ? obj.customer : obj.customer?.id;
  return typeof cus === "string" && ourCustomers.has(cus);
}

/** A resident's dues payment (Connect destination, or a dues request/member on it). */
export function isDuesCharge(charge: any): boolean {
  return (
    !!charge?.transfer_data?.destination ||
    !!charge?.metadata?.payment_request_id ||
    !!charge?.metadata?.member_id
  );
}
