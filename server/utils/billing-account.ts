// server/utils/billing-account.ts
// Agency / multi-property billing — server-side authorization + shared helpers
// (docs/plan-agency-multi-property-billing.md §6-§9).
//
// A billing account owns ONE Stripe customer + ONE subscription whose
// `quantity` = the number of active properties attached to it. Who may manage
// it is decided by billing_account_members.role (owner | billing_admin |
// viewer) — distinct from per-property hoa_members access. App Admins bypass.
import type { H3Event } from "h3";
import { readItem, readItems, updateItem } from "@directus/sdk";

export type BillingRole = "owner" | "billing_admin" | "viewer";

/** Map a Stripe subscription status onto our billing_accounts fields. */
export function mapStripeStatus(stripeStatus: string): {
  subscription_status: "active" | "trial" | "past_due" | "canceled" | "expired";
  status: "active" | "past_due" | "canceled" | "suspended";
} {
  switch (stripeStatus) {
    case "trialing":
      return { subscription_status: "trial", status: "active" };
    case "active":
      return { subscription_status: "active", status: "active" };
    case "past_due":
      return { subscription_status: "past_due", status: "past_due" };
    case "canceled":
    case "unpaid":
      return { subscription_status: "canceled", status: "canceled" };
    case "incomplete":
    case "incomplete_expired":
      return { subscription_status: "expired", status: "suspended" };
    default:
      return { subscription_status: "active", status: "active" };
  }
}

/**
 * The caller's role on a billing account, or null if they have none. App Admins
 * are treated as "owner" (full control) without needing a membership row.
 */
export async function getBillingAccountRole(
  event: H3Event,
  accountId: string
): Promise<BillingRole | null> {
  const config = useRuntimeConfig();
  const session = await getUserSession(event);
  if (!session?.user?.id) return null;

  const userRoleId = (session.user.role as any)?.id || session.user.role;
  if (userRoleId === config.public.directusRoleAppAdmin) return "owner";

  try {
    const directus = getTypedDirectus();
    const rows = await directus.request(
      readItems("billing_account_members", {
        filter: {
          billing_account: { _eq: accountId },
          user: { _eq: session.user.id },
        },
        fields: ["role"],
        limit: 1,
      })
    );
    return (rows?.[0]?.role as BillingRole) ?? null;
  } catch (e) {
    console.error("[billing-account] role lookup failed:", e);
    return null;
  }
}

/**
 * Require the caller to hold one of `roles` on the account (App Admin always
 * passes). Returns the resolved role. Throws 401/403 otherwise.
 */
export async function requireBillingAccountRole(
  event: H3Event,
  accountId: string,
  roles: BillingRole[] = ["owner", "billing_admin"]
): Promise<BillingRole> {
  const session = await getUserSession(event);
  if (!session?.user?.id) {
    throw createError({ statusCode: 401, message: "Authentication required" });
  }
  const role = await getBillingAccountRole(event, accountId);
  if (!role || !roles.includes(role)) {
    throw createError({
      statusCode: 403,
      message: "You do not have permission to manage this billing account",
    });
  }
  return role;
}

/** Count the active properties attached to an account — the Stripe seat quantity. */
export async function countActiveProperties(accountId: string): Promise<number> {
  const directus = getTypedDirectus();
  const orgs = await directus.request(
    readItems("hoa_organizations", {
      filter: {
        billing_account: { _eq: accountId },
        status: { _eq: "active" },
      },
      fields: ["id"],
      limit: -1,
    })
  );
  return Array.isArray(orgs) ? orgs.length : 0;
}

/** Load a billing account row (admin token), or throw 404. */
export async function getBillingAccount(accountId: string): Promise<any> {
  const directus = getTypedDirectus();
  try {
    return await directus.request(
      readItem("billing_accounts", accountId, {
        fields: [
          "id",
          "name",
          "status",
          "subscription_status",
          "trial_ends_at",
          "is_free_account",
          "billing_cycle",
          "seats_purchased",
          "included_properties",
          "stripe_customer_id",
          "stripe_subscription_id",
          "owner.id",
          "owner.email",
          "owner.first_name",
          "owner.last_name",
          "subscription_plan.id",
          "subscription_plan.name",
        ],
      })
    );
  } catch {
    throw createError({ statusCode: 404, message: "Billing account not found" });
  }
}

/**
 * Reconcile the Stripe subscription `quantity` to the current active-property
 * count and mirror it onto `seats_purchased`. Stripe prorates the change. Safe
 * no-op (no Stripe call) when the account has no subscription yet — the seat
 * count is captured at subscribe() time. Returns the resolved seat count.
 */
export async function syncBillingAccountSeats(
  accountId: string
): Promise<{ accountId: string; seats: number; synced: boolean }> {
  const directus = getTypedDirectus();
  const account = await getBillingAccount(accountId);
  const seats = Math.max(1, await countActiveProperties(accountId));

  if (!account.stripe_subscription_id) {
    // No subscription yet — just mirror the count for the dashboard.
    await directus.request(
      updateItem("billing_accounts", accountId, { seats_purchased: seats })
    );
    return { accountId, seats, synced: false };
  }

  const stripe = getStripe();
  const subscription = await stripe.subscriptions.retrieve(account.stripe_subscription_id);
  const item = subscription.items?.data?.[0];
  if (!item) {
    throw createError({
      statusCode: 500,
      message: "Subscription has no line item to update",
    });
  }

  if (item.quantity !== seats) {
    await stripe.subscriptions.update(account.stripe_subscription_id, {
      items: [{ id: item.id, quantity: seats }],
      proration_behavior: "create_prorations",
    });
  }

  await directus.request(
    updateItem("billing_accounts", accountId, { seats_purchased: seats })
  );
  return { accountId, seats, synced: true };
}
