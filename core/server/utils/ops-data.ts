// Reads behind the operator console (docs/plan-operator-console.md §5, Phase 1).
//
// Stripe stays the source of truth for money: nothing here is stored, and every
// Stripe list is paginated, filtered to HOA Connect's objects (the account is
// Hue's and shared) and cached on the server for 60 s, so a phone refreshing the
// overview doesn't fan out to Stripe each time. Directus reads use the admin
// token; the routes have already checked the caller's platform role.

import type Stripe from "stripe";
import { aggregate, readItems, readUsers } from "@directus/sdk";
import { isHoaConnectObject } from "#core/shared/billing/stripe-app";
import {
  communityStatus,
  monthlyValue,
  type CommunityStatusResult,
  type SubscriptionLike,
} from "#core/shared/ops/metrics";
import { getStripe, isStripeLiveMode } from "./stripe";

// ── The 60-second cache ─────────────────────────────────────────────────────

export const OPS_CACHE_TTL_MS = 60_000;
const opsCache = new Map<string, { at: number; value: Promise<unknown> }>();

/** Cache a Stripe read for 60 s, per Stripe mode. A failed read isn't kept. */
export function opsCached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const k = `${isStripeLiveMode() ? "live" : "test"}:${key}`;
  const hit = opsCache.get(k);
  if (hit && Date.now() - hit.at < OPS_CACHE_TTL_MS) return hit.value as Promise<T>;
  const value = load();
  opsCache.set(k, { at: Date.now(), value });
  value.catch(() => opsCache.delete(k));
  return value;
}

/**
 * Drop cached reads an action just made stale, by key prefix (e.g. "charges:",
 * "sub:sub_123"), in both Stripe modes. Without this the page shows the old
 * state for up to a minute after a refund or a cancel.
 */
export function invalidateOpsCache(...prefixes: string[]): void {
  for (const k of [...opsCache.keys()]) {
    const key = k.slice(k.indexOf(":") + 1);
    if (prefixes.some((p) => key.startsWith(p))) opsCache.delete(k);
  }
}

/** Tests only. */
export function _resetOpsCache(): void {
  opsCache.clear();
}

/**
 * What a failed Stripe read means for the operator. A key in one mode can't see
 * the other mode's objects: Stripe answers `resource_missing` and says "a
 * similar object exists in live mode". On localhost (test key) that is every
 * real customer, and it is not an outage.
 */
export function stripeReadProblem(e: unknown): { message: string; otherMode: "live" | "test" | null } {
  const err = e as { code?: string; message?: string; raw?: { code?: string; message?: string } };
  const code = err?.code ?? err?.raw?.code;
  const text = `${err?.message ?? ""} ${err?.raw?.message ?? ""}`;
  if (code === "resource_missing") {
    if (/exists in live mode/i.test(text)) {
      return { message: "This is a live-mode object; the server is in test mode.", otherMode: "live" };
    }
    if (/exists in test mode/i.test(text)) {
      return { message: "This is a test-mode object; the server is in live mode.", otherMode: "test" };
    }
    return { message: "Stripe has no such object.", otherMode: null };
  }
  return { message: "Stripe couldn't be read just now.", otherMode: null };
}

// ── Paginated Stripe lists ──────────────────────────────────────────────────

/** Hard stop per list, so a runaway account can't stall a page. */
export const OPS_LIST_MAX = 1000;

type Page<T> = { data: T[]; has_more: boolean };

/** Follow `starting_after` until the list ends or `max` items are read. */
export async function opsListAll<T extends { id: string }>(
  page: (params: Record<string, unknown>) => Promise<Page<T>>,
  params: Record<string, unknown>,
  max = OPS_LIST_MAX
): Promise<{ items: T[]; truncated: boolean }> {
  const items: T[] = [];
  let startingAfter: string | undefined;
  for (;;) {
    const res = await page({ ...params, limit: 100, ...(startingAfter ? { starting_after: startingAfter } : {}) });
    items.push(...res.data);
    if (!res.has_more || !res.data.length) return { items, truncated: false };
    if (items.length >= max) return { items: items.slice(0, max), truncated: true };
    startingAfter = res.data[res.data.length - 1]!.id;
  }
}

export type OpsSubscription = SubscriptionLike & {
  id: string;
  cancel_at_period_end?: boolean;
  current_period_end?: number;
  trial_end?: number | null;
  created?: number;
};

/** HOA Connect's subscriptions, every status. */
export function opsSubscriptions(stripe: Stripe = getStripe()) {
  return opsCached("subscriptions", async () => {
    const { items, truncated } = await opsListAll<OpsSubscription>(
      (p) => stripe.subscriptions.list(p as Stripe.SubscriptionListParams) as unknown as Promise<Page<OpsSubscription>>,
      { status: "all" }
    );
    return { subs: items.filter((s) => isHoaConnectObject(s.metadata as Record<string, unknown>)), truncated };
  });
}

/** Events of one type (or undelivered ones) since `days` ago. Stripe keeps 30 days. */
export function opsEvents(
  key: string,
  params: { type?: string; delivery_success?: boolean; days: number },
  stripe: Stripe = getStripe()
) {
  return opsCached(`events:${key}`, async () => {
    const gte = Math.floor(Date.now() / 1000) - params.days * 86_400;
    const { type, delivery_success } = params;
    return opsListAll<Stripe.Event>(
      (p) => stripe.events.list(p as Stripe.EventListParams) as unknown as Promise<Page<Stripe.Event>>,
      { created: { gte }, ...(type ? { type } : {}), ...(delivery_success === false ? { delivery_success: false } : {}) },
      500
    );
  });
}

/** Charges since `days` ago, all of the account's (classified by the caller). */
export function opsCharges(days: number, stripe: Stripe = getStripe()) {
  return opsCached(`charges:${days}`, async () => {
    const gte = Math.floor(Date.now() / 1000) - days * 86_400;
    return opsListAll<Stripe.Charge>(
      (p) => stripe.charges.list(p as Stripe.ChargeListParams) as unknown as Promise<Page<Stripe.Charge>>,
      { created: { gte } },
      500
    );
  });
}

/** HOA Connect's discount codes (tagged on the code or its coupon). */
export function opsPromotionCodes(stripe: Stripe = getStripe()) {
  return opsCached("promotion-codes", async () => {
    type Promo = Stripe.PromotionCode & { coupon?: Stripe.Coupon | null };
    const { items } = await opsListAll<Promo>(
      (p) => stripe.promotionCodes.list(p as Stripe.PromotionCodeListParams) as unknown as Promise<Page<Promo>>,
      {},
      300
    );
    return items.filter((p) => isHoaConnectObject(p.metadata) || isHoaConnectObject(p.coupon?.metadata));
  });
}

// ── Directus: every community, with its bucket ──────────────────────────────

export interface OpsPlan {
  id: string;
  slug: string | null;
  name: string | null;
  min_units: number | null;
  max_units: number | null;
}

export interface OpsAccount {
  id: string;
  name: string;
  status: string | null;
  subscription_status: string | null;
  trial_ends_at: string | null;
  is_free_account: boolean | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  seats_purchased: number | null;
}

export interface OpsOrg {
  id: string;
  name: string | null;
  slug: string;
  subscription_status: string | null;
  trial_ends_at: string | null;
  is_free_account: boolean | null;
  grace_ends_at: string | null;
  billing_account: string | null;
  subscription_plan: string | null;
  declared_units: number | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_connect_account_id: string | null;
  date_created: string | null;
}

export interface OpsContact {
  name: string | null;
  email: string | null;
}

export interface OpsCommunityRow extends CommunityStatusResult {
  id: string;
  name: string;
  slug: string;
  band: { slug: string | null; name: string | null } | null;
  declaredUnits: number;
  realUnits: number;
  billedBy: "self" | "agency";
  billingAccount: { id: string; name: string } | null;
  trialEndsAt: string | null;
  /** From the community's own Stripe subscription; null when agency-billed or none. */
  monthlyValueCents: number | null;
  stripeStatus: string | null;
  signupAt: string | null;
  primaryContact: OpsContact | null;
}

const idOf = (v: unknown): string | null =>
  v && typeof v === "object" ? ((v as { id?: string }).id ?? null) : typeof v === "string" ? v : null;

const ORG_FIELDS = [
  "id",
  "name",
  "slug",
  "subscription_status",
  "trial_ends_at",
  "is_free_account",
  "grace_ends_at",
  "billing_account",
  "subscription_plan",
  "declared_units",
  "stripe_customer_id",
  "stripe_subscription_id",
  "stripe_connect_account_id",
  "date_created",
];

const ACCOUNT_FIELDS = [
  "id",
  "name",
  "status",
  "subscription_status",
  "trial_ends_at",
  "is_free_account",
  "stripe_customer_id",
  "stripe_subscription_id",
  "seats_purchased",
];

const toOrg = (r: any): OpsOrg => ({
  ...r,
  billing_account: idOf(r.billing_account),
  subscription_plan: idOf(r.subscription_plan),
});

/** Real unit counts per community, in one grouped count. */
export async function opsUnitCounts(): Promise<Map<string, number>> {
  const rows = (await getTypedDirectus().request(
    aggregate("hoa_units", { aggregate: { count: "*" }, groupBy: ["organization"] } as any)
  )) as Array<{ organization?: unknown; count?: unknown }>;
  const out = new Map<string, number>();
  for (const r of rows ?? []) {
    const org = idOf(r.organization);
    const raw = r.count && typeof r.count === "object" ? (r.count as Record<string, unknown>)["*"] : r.count;
    if (org) out.set(org, Number(raw) || 0);
  }
  return out;
}

export function personName(m: { first_name?: string | null; last_name?: string | null } | null | undefined): string | null {
  const n = [m?.first_name, m?.last_name].filter(Boolean).join(" ").trim();
  return n || null;
}

/** Directus users by id: name, email, last sign-in. Only for the people the console may name. */
export async function opsUsers(ids: string[]): Promise<Map<string, { name: string | null; email: string | null; last_access: string | null }>> {
  const unique = [...new Set(ids.filter(Boolean))];
  const out = new Map<string, { name: string | null; email: string | null; last_access: string | null }>();
  if (!unique.length) return out;
  const rows = (await getTypedDirectus().request(
    readUsers({ filter: { id: { _in: unique } }, fields: ["id", "first_name", "last_name", "email", "last_access"], limit: -1 } as any)
  )) as any[];
  for (const u of rows ?? []) out.set(u.id, { name: personName(u), email: u.email ?? null, last_access: u.last_access ?? null });
  return out;
}

/** Everything the overview and the communities table need from Directus, in four reads. */
export async function loadOpsCommunities(now: Date = new Date()) {
  const config = useRuntimeConfig();
  const directus = getTypedDirectus();
  const [orgRows, accountRows, planRows, adminRows, units] = await Promise.all([
    directus.request(readItems("hoa_organizations", { fields: ORG_FIELDS as any, limit: -1 })) as Promise<any[]>,
    directus.request(readItems("billing_accounts", { fields: ACCOUNT_FIELDS as any, limit: -1 })) as Promise<any[]>,
    directus.request(
      readItems("subscription_plans", { fields: ["id", "slug", "name", "min_units", "max_units"] as any, limit: -1 })
    ) as Promise<any[]>,
    directus.request(
      readItems("hoa_members", {
        filter: { role: { _eq: config.public.directusRoleHoaAdmin }, status: { _eq: "active" } },
        fields: ["id", "organization", "user", "first_name", "last_name", "email", "date_created"] as any,
        sort: ["date_created"] as any,
        limit: -1,
      })
    ) as Promise<any[]>,
    opsUnitCounts(),
  ]);

  const orgs = (orgRows ?? []).map(toOrg);
  const accounts = new Map<string, OpsAccount>((accountRows ?? []).map((a) => [a.id, a as OpsAccount]));
  const plans = new Map<string, OpsPlan>((planRows ?? []).map((p) => [p.id, p as OpsPlan]));

  // The first active HOA Admin is the community's primary contact. The member
  // row's own name and email, falling back to the user's.
  const firstAdmin = new Map<string, any>();
  for (const m of [...(adminRows ?? [])].sort((a, b) => String(a.date_created ?? "").localeCompare(String(b.date_created ?? "")))) {
    const org = idOf(m.organization);
    if (org && !firstAdmin.has(org)) firstAdmin.set(org, m);
  }
  const users = await opsUsers([...firstAdmin.values()].map((m) => idOf(m.user)!).filter(Boolean));

  const rows = (subsById: Map<string, OpsSubscription>): OpsCommunityRow[] =>
    orgs.map((org) => {
      const account = org.billing_account ? accounts.get(org.billing_account) ?? null : null;
      const plan = org.subscription_plan ? plans.get(org.subscription_plan) : undefined;
      const sub = !org.billing_account && org.stripe_subscription_id ? subsById.get(org.stripe_subscription_id) : undefined;
      const admin = firstAdmin.get(org.id);
      const user = admin ? users.get(idOf(admin.user) ?? "") : undefined;
      return {
        ...communityStatus(org, account, now),
        id: org.id,
        name: org.name || org.slug,
        slug: org.slug,
        band: plan ? { slug: plan.slug, name: plan.name } : null,
        declaredUnits: Number(org.declared_units) || 0,
        realUnits: units.get(org.id) ?? 0,
        billedBy: org.billing_account ? "agency" : "self",
        billingAccount: account ? { id: account.id, name: account.name } : null,
        trialEndsAt: (account && org.billing_account ? account.trial_ends_at : org.trial_ends_at) ?? null,
        monthlyValueCents: sub && (sub.status === "active" || sub.status === "past_due") ? monthlyValue(sub, now).cents : null,
        stripeStatus: sub?.status ?? null,
        signupAt: org.date_created,
        primaryContact: admin
          ? { name: personName(admin) ?? user?.name ?? null, email: admin.email ?? user?.email ?? null }
          : null,
      };
    });

  return { orgs, accounts, plans, units, rows };
}

/** Every Stripe customer id the app has on record: orgs', accounts' and subscriptions'. */
export function ourCustomerIds(orgs: OpsOrg[], accounts: Iterable<OpsAccount>, subs: OpsSubscription[]): Set<string> {
  const out = new Set<string>();
  for (const o of orgs) if (o.stripe_customer_id) out.add(o.stripe_customer_id);
  for (const a of accounts) if (a.stripe_customer_id) out.add(a.stripe_customer_id);
  for (const s of subs) {
    const c = idOf(s.customer);
    if (c) out.add(c);
  }
  return out;
}

/** Stripe Dashboard and Directus links for an object, in the app's Stripe mode. */
export function stripeDashboardUrl(path: string): string {
  return `https://dashboard.stripe.com/${isStripeLiveMode() ? "" : "test/"}${path}`;
}

export function directusItemUrl(collection: string, id: string): string | null {
  const config = useRuntimeConfig();
  const base = (config.public as any)?.directus?.url || (config as any)?.directus?.url;
  return base ? `${String(base).replace(/\/$/, "")}/admin/content/${collection}/${id}` : null;
}
