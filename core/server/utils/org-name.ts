/**
 * An org's display name, or null when the org is not found.
 *
 * The one definition: money approvals and the delegation routes both name the
 * org in their ledger entries and notices. It lived in delegation.ts and
 * money-approvals.ts as two identical copies, which Nitro's server-utils
 * auto-import reported as a duplicate export and resolved by dropping one.
 */
import { readItems } from "@directus/sdk";

export async function orgName(orgId: string): Promise<string | null> {
  const rows = ((await getTypedDirectus().request(
    readItems("hoa_organizations", { filter: { id: { _eq: orgId } } as any, fields: ["name"] as any, limit: 1 })
  )) ?? []) as any[];
  return rows[0]?.name ?? null;
}
