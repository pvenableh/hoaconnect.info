/**
 * A lease's signed document: storing it, and who may open it.
 *
 * Who may open it: an admin of the lease's community, and the lease's owner
 * and tenant. Not every member, which is what the asset proxy's rule for a
 * community's files would give (file-owner.ts), and not the board: a lease is
 * between two residents.
 */
import type { H3Event } from "h3";
import { readItems, updateFile, uploadFiles } from "@directus/sdk";
import { LEASE_DOCUMENT_MAX_BYTES, LEASE_DOCUMENT_TYPE } from "#core/shared/units/lease-requests";

/** One part of a multipart body (h3's readMultipartFormData). */
export interface UploadPart {
  name?: string;
  filename?: string;
  type?: string;
  data: Buffer;
}

const isPdf = (bytes: Uint8Array) => bytes.length > 4 && Buffer.from(bytes.subarray(0, 5)).toString("latin1") === "%PDF-";

/**
 * Store a signed lease: one PDF, 4 MB at most, uploaded with the app's token
 * and filed in no folder, with `uploaded_by` set to the person who sent it.
 *
 * Why the app's token: a resident or an admin may read only the files in
 * their community's library folders (the Directus file rules), so Directus
 * answers their own upload of a file in no folder with no data and the page
 * never learns its id. Why no folder: a library file is open to every member,
 * and a lease is not. Until a lease names it only the app can read it; then
 * mayOpenLeaseDocument decides. Why a PDF only: the public file rule serves
 * every image to anyone with its id.
 */
export async function storeLeaseDocument(orgId: string, userId: string, part: UploadPart | undefined): Promise<{ id: string; filename: string }> {
  if (!part?.data?.length) throw createError({ statusCode: 400, message: "Attach the signed lease." });
  if (part.data.length > LEASE_DOCUMENT_MAX_BYTES) {
    throw createError({ statusCode: 413, message: "That PDF is over 4 MB. Save a smaller copy and try again." });
  }
  if (!isPdf(part.data)) throw createError({ statusCode: 400, message: "The signed lease has to be a PDF." });
  await enforceStorageLimit(orgId, part.data.length);

  const filename = (part.filename || "lease.pdf").replace(/[\\/]/g, "_").slice(0, 200);
  const form = new FormData();
  form.append("title", filename.replace(/\.pdf$/i, ""));
  form.append("file", new File([new Uint8Array(part.data)], filename, { type: LEASE_DOCUMENT_TYPE }), filename);

  const directus = getTypedDirectus();
  const uploaded = (await directus.request(uploadFiles(form))) as unknown as { id?: string } | null;
  if (!uploaded?.id) throw createError({ statusCode: 502, message: "Couldn't store the lease. Try again." });
  // Directus stamps the app's account on create; the person who sent it uploaded it.
  await directus.request(updateFile(uploaded.id, { uploaded_by: userId } as never));
  return { id: uploaded.id, filename };
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
