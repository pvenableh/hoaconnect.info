/**
 * A lease's signed document: storing it, and who may open it.
 *
 * Who may open it: an admin of the lease's community, and the lease's owner
 * and tenant. Not every member, which is what the asset proxy's rule for a
 * community's files would give (file-owner.ts), and not the board: a lease is
 * between two residents.
 */
import type { H3Event } from "h3";
import { readItems } from "@directus/sdk";
import { LEASE_DOCUMENT_MAX_BYTES } from "#core/shared/units/lease-requests";
import { storeRecordUpload, type UploadPart } from "./private-uploads";

export type { UploadPart } from "./private-uploads";

/**
 * Store a signed lease: one PDF, 4 MB at most, in the community's Records ›
 * Leases folder, marked as a record's file, as the sender's (private-uploads.ts
 * says why). A PDF only: a lease is between two residents, and an image is
 * served publicly by its id until the public rule leaves record files out.
 */
export async function storeLeaseDocument(orgId: string, userId: string, part: UploadPart | undefined): Promise<{ id: string; filename: string }> {
  const { id, filename } = await storeRecordUpload(orgId, userId, part, {
    record: "lease",
    accept: ["pdf"],
    maxBytes: LEASE_DOCUMENT_MAX_BYTES,
    missing: "Attach the signed lease.",
    wrongKind: "The signed lease has to be a PDF.",
    tooBig: "That PDF is over 4 MB. Save a smaller copy and try again.",
    fallbackName: "lease",
  });
  return { id, filename };
}

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
