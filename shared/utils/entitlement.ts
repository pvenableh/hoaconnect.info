/**
 * Effective-entitlement resolution (shared, pure).
 *
 * One rule, in one place: an organization's billing can resolve to itself OR
 * "up" to a billing_account it belongs to (agency / multi-property billing —
 * see docs/plan-agency-multi-property-billing.md §6). Today every org has
 * `billing_account = null` and resolves to itself, so behaviour is unchanged.
 *
 * Lives in `shared/` so it is auto-imported in BOTH the Nuxt app and the Nitro
 * server (the resolver is also called from `server/utils/entitlement.ts`). Keep
 * it pure — no auto-imports, no Directus calls — the caller supplies the data.
 */

export type SubscriptionStatus =
  | "active"
  | "trial"
  | "past_due"
  | "canceled"
  | "expired";

/** The minimal billing fields entitlement depends on (org OR billing_account). */
export interface EntitlementSource {
  subscription_status?: string | null;
  trial_ends_at?: string | null;
  is_free_account?: boolean | null;
}

/** An org as far as entitlement cares: its own fields + an optional parent account. */
export interface EntitlementOrg extends EntitlementSource {
  billing_account?: EntitlementSource | string | null;
}

export interface EffectiveEntitlement {
  /** Whether the answer came from the parent billing account or the org itself. */
  source: "billing_account" | "organization";
  subscription_status: string | null;
  trial_ends_at: string | null;
  is_free_account: boolean;
  /** The single gate every consumer should read: may they use the app? */
  isEntitled: boolean;
}

/**
 * Is this billing source currently entitled? Free accounts always pass; active
 * always passes; a trial passes while it has no end date or the end date is in
 * the future. Anything else (expired / canceled / past_due / empty) is blocked.
 * A null source fails OPEN (matches the middleware's "don't lock users out on a
 * missing read" stance).
 */
export function isEntitledFrom(
  src: EntitlementSource | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!src) return true; // fail open
  if (src.is_free_account === true) return true;

  const status = src.subscription_status;
  if (status === "active") return true;
  if (status === "trial") {
    if (!src.trial_ends_at) return true;
    return new Date(src.trial_ends_at) > now;
  }
  return false;
}

/** Pull the m2o billing_account object off an org, if it was expanded (not just an id). */
function parentAccount(org: EntitlementOrg | null | undefined): EntitlementSource | null {
  const ba = org?.billing_account;
  return ba && typeof ba === "object" ? (ba as EntitlementSource) : null;
}

/**
 * Resolve an org's effective entitlement, preferring its parent billing account
 * when one is set (and expanded). For self-billed orgs (the default) this just
 * reflects the org's own fields.
 */
export function resolveEntitlement(
  org: EntitlementOrg | null | undefined,
  now: Date = new Date(),
): EffectiveEntitlement {
  const account = parentAccount(org);
  const src: EntitlementSource | null = account ?? org ?? null;

  return {
    source: account ? "billing_account" : "organization",
    subscription_status: src?.subscription_status ?? null,
    trial_ends_at: src?.trial_ends_at ?? null,
    is_free_account: src?.is_free_account === true,
    isEntitled: isEntitledFrom(src, now),
  };
}

/**
 * Directus `fields` selection that hydrates everything `resolveEntitlement`
 * needs, given a path prefix to the org (e.g. `"organization"` from an
 * hoa_members query, or `""` when querying hoa_organizations directly).
 */
export function entitlementFields(orgPrefix = ""): string[] {
  const p = orgPrefix ? `${orgPrefix}.` : "";
  return [
    `${p}subscription_status`,
    `${p}trial_ends_at`,
    `${p}is_free_account`,
    `${p}billing_account.id`,
    `${p}billing_account.subscription_status`,
    `${p}billing_account.trial_ends_at`,
    `${p}billing_account.is_free_account`,
    `${p}billing_account.status`,
  ];
}
