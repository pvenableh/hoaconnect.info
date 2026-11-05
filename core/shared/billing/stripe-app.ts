// HOA Connect runs on Hue's Stripe account — Hue is the business, HOA Connect
// one of its products (decided 2026-11-05). The account, its customers and its
// webhook events are therefore SHARED with Hue's other work, so everything
// HOA Connect creates carries `metadata.app = "hoaconnect"`, and the webhook
// only books what is ours.

export const STRIPE_APP = "hoaconnect" as const;

/** Metadata for a Stripe object HOA Connect creates: the app tag plus the caller's keys. */
export function appMetadata<T extends Record<string, string | number | null | undefined>>(
  extra: T = {} as T
): Record<string, string> {
  const out: Record<string, string> = { app: STRIPE_APP };
  for (const [k, v] of Object.entries(extra)) if (v != null) out[k] = String(v);
  out.app = STRIPE_APP;
  return out;
}

/**
 * Is this Stripe object (by its metadata) HOA Connect's? The tag, or — for
 * objects created before the tag existed — one of the keys only HOA Connect
 * writes: an org, an AI credit pack, an agency billing account, a band.
 */
export function isHoaConnectObject(metadata: Record<string, unknown> | null | undefined): boolean {
  if (!metadata) return false;
  if (metadata.app === STRIPE_APP) return true;
  const has = (k: string) => typeof metadata[k] === "string" && (metadata[k] as string).length > 0;
  return has("organization_id") || metadata.kind === "ai_credits" || has("billing_account_id") || has("band_slug");
}

/** Stripe Search query for one of OUR customers with this email (quotes escaped). */
export function appCustomerSearchQuery(email: string): string {
  const e = email.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  return `email:'${e}' AND metadata['app']:'${STRIPE_APP}'`;
}
