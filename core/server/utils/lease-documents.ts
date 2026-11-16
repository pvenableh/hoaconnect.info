/**
 * Who may open a lease's signed document: an admin of the lease's community,
 * and the lease's owner and tenant. Not every member, which is what the asset
 * proxy's rule for a community's files would give (file-owner.ts), and not the
 * board: a lease is between two residents.
 */
import type { H3Event } from "h3";
import { readItems } from "@directus/sdk";

const idOf = (v: unknown): string | null =>
  typeof v === "string" ? v : ((v as { id?: unknown } | null)?.id as string | undefined) ?? null;

/** True or false when a lease names this file as its document; null when none does. */
export async function mayOpenLeaseDocument(event: H3Event, userId: string, fileId: string): Promise<boolean | null> {
  const directus = getTypedDirectus();
  let leases: Array<{ organization?: unknown; owner?: unknown; tenant?: unknown }> = [];
  try {
    leases = (await directus.request(
      readItems("hoa_leases", { filter: { document: { _eq: fileId } }, fields: ["organization", "owner", "tenant"], limit: -1 })
    )) as typeof leases;
  } catch {
    leases = [];
  }
  if (!leases.length) return null;

  for (const lease of leases) {
    const orgId = idOf(lease.organization);
    if (!orgId) continue;
    if ((await checkAdminAccess(event, orgId)).isAdmin) return true;
    const parties = [idOf(lease.owner), idOf(lease.tenant)].filter((v): v is string => !!v);
    if (!parties.length || !userId) continue;
    const mine = (await directus.request(
      readItems("hoa_members", {
        filter: { user: { _eq: userId }, organization: { _eq: orgId }, status: { _eq: "active" }, id: { _in: parties } },
        fields: ["id"],
        limit: 1,
      })
    )) as Array<{ id: string }>;
    if (mine?.length) return true;
  }
  return false;
}
