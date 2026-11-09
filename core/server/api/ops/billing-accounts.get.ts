// GET /api/ops/billing-accounts — the agency view. App Admin and Platform Support.
// Each account: its communities, the Stripe quantity versus the communities
// actually attached (they drift if a seat sync fails), its value and its members.
import { readItems } from "@directus/sdk";
import { requireOpsPermission } from "#core/server/utils/admin-auth";
import { loadOpsCommunities, opsSubscriptions, opsUsers, stripeDashboardUrl } from "#core/server/utils/ops-data";
import { getStripe } from "#core/server/utils/stripe";
import { communityStatus, monthlyValue } from "#core/shared/ops/metrics";

const idOf = (v: unknown): string | null =>
  v && typeof v === "object" ? ((v as { id?: string }).id ?? null) : typeof v === "string" ? v : null;

export default defineEventHandler(async (event) => {
  await requireOpsPermission(event, "billing.read");
  const now = new Date();
  const { accounts, rows } = await loadOpsCommunities(now);

  const memberRows = accounts.size
    ? (((await getTypedDirectus().request(
        readItems("billing_account_members", { fields: ["id", "billing_account", "user", "role"] as any, limit: -1 })
      )) ?? []) as any[])
    : [];
  const users = await opsUsers(memberRows.map((m) => idOf(m.user)!).filter(Boolean));

  let warning: string | null = null;
  let subsById = new Map<string, any>();
  try {
    const { subs } = await opsSubscriptions(getStripe());
    subsById = new Map(subs.map((s) => [s.id, s]));
  } catch (e: any) {
    console.error("[ops/billing-accounts] Stripe read failed:", e?.message ?? e);
    warning = "Stripe couldn't be read just now, so quantities and values are missing.";
  }
  const communities = rows(subsById);

  const list = [...accounts.values()].map((a) => {
    const attached = communities.filter((c) => c.billingAccount?.id === a.id);
    const sub = a.stripe_subscription_id ? subsById.get(a.stripe_subscription_id) : undefined;
    const quantity = sub ? (sub.items?.data ?? []).reduce((n: number, i: any) => n + (i.quantity ?? 1), 0) : null;
    return {
      id: a.id,
      name: a.name,
      ...communityStatus({ ...a, billing_account: null }, null, now),
      subscriptionStatus: a.subscription_status,
      trialEndsAt: a.trial_ends_at,
      seatsPurchased: a.seats_purchased ?? null,
      stripeQuantity: quantity,
      stripeStatus: sub?.status ?? null,
      attachedCount: attached.length,
      /** Stripe bills for a different number of communities than are attached. */
      quantityMismatch: quantity != null && quantity !== attached.length,
      monthlyValueCents: sub && (sub.status === "active" || sub.status === "past_due") ? monthlyValue(sub, now).cents : null,
      communities: attached.map((c) => ({ id: c.id, name: c.name, slug: c.slug, status: c.status, realUnits: c.realUnits })),
      members: memberRows
        .filter((m) => idOf(m.billing_account) === a.id)
        .map((m) => {
          const u = users.get(idOf(m.user) ?? "");
          return { id: m.id, role: m.role, name: u?.name ?? null, email: u?.email ?? null };
        }),
      stripeUrl: a.stripe_customer_id ? stripeDashboardUrl(`customers/${a.stripe_customer_id}`) : null,
    };
  });
  list.sort((x, y) => x.name.localeCompare(y.name));
  return { accounts: list, warning };
});
