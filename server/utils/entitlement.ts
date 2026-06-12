/**
 * Server-side effective entitlement.
 *
 * The single authoritative read for "is this org entitled to use the app?" —
 * resolving up to a parent billing_account when one is set (agency /
 * multi-property billing, docs/plan-agency-multi-property-billing.md §6). The
 * actual rule lives in the shared, pure `resolveEntitlement`; this just fetches
 * the data with the admin token (elevated — the route is responsible for
 * authorizing the caller).
 *
 * For self-billed orgs (`billing_account = null`, the default) the result is
 * exactly the org's own subscription fields, so existing behaviour is unchanged.
 */
import { readItem } from "@directus/sdk";
import type { HoaOrganization } from "~~/types/directus";

export async function getEffectiveEntitlement(
  orgId: string,
): Promise<EffectiveEntitlement> {
  const directus = getTypedDirectus();

  const org: any = await directus.request(
    readItem("hoa_organizations", orgId, {
      fields: ["id", ...(entitlementFields() as (keyof HoaOrganization)[])],
    }),
  );

  return resolveEntitlement(org);
}
