/**
 * Guardrails for the public "try the app" demo orgs (is_demo === true).
 *
 * A demo org is a real, writable tenant that anonymous visitors share, so the
 * side-effectful surfaces must be neutered: no real outbound email, no real
 * Stripe charges. These helpers are the single source of truth for "is this a
 * demo org?" and "may the demo send real email right now?" — call them from the
 * send/charge chokepoints. AI is capped separately by the wallet balance the
 * seed provisions (and the nightly reset restores).
 */

import { readItems } from "@directus/sdk";

// is_demo rarely changes; cache per-process (cleared on restart / re-seed).
const _isDemo = new Map<string, boolean>();

/** True when the org is a public demo tenant. Best-effort; false on any error. */
export async function isDemoOrg(orgId?: string | null): Promise<boolean> {
  if (!orgId) return false;
  const cached = _isDemo.get(orgId);
  if (cached !== undefined) return cached;
  try {
    const directus = getTypedDirectus();
    const rows = (await directus.request(
      readItems("hoa_organizations", {
        filter: { id: { _eq: orgId } },
        fields: ["is_demo"],
        limit: 1,
      })
    )) as Array<{ is_demo?: boolean }>;
    const val = !!rows?.[0]?.is_demo;
    _isDemo.set(orgId, val);
    return val;
  } catch {
    return false;
  }
}

/**
 * Whether demo orgs may send REAL email. Off by default (email is simulated);
 * set DEMO_ALLOW_EMAIL=true to let the owner test live delivery, then unset.
 */
export function demoEmailAllowed(): boolean {
  return String(useRuntimeConfig().demoAllowEmail || "").toLowerCase() === "true";
}

/**
 * Central email guard: true → the caller should SKIP the real send (simulate).
 * A demo org is blocked unless DEMO_ALLOW_EMAIL is on.
 */
export async function shouldBlockDemoEmail(orgId?: string | null): Promise<boolean> {
  if (demoEmailAllowed()) return false;
  return isDemoOrg(orgId);
}
