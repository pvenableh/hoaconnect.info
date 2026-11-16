/**
 * POST /api/org/change-requests/lease-document — an owner uploads the signed
 * lease for a lease report. Multipart: `orgId`, `file` (one PDF, 4 MB at most).
 *
 * Why not /api/directus/files/upload: that uploads with the resident's own
 * token, and a resident may read only files in their community's library
 * folders, so Directus answers the upload of a file in no folder with nothing
 * and the page never learns its id. Here the app's token uploads it, with no
 * folder (in no library: only the app can read it until a lease claims it),
 * and `uploaded_by` is set to the owner, which is what the request checks
 * (assertOwnLeaseUpload).
 */
import { updateFile, uploadFiles } from "@directus/sdk";
import { LEASE_DOCUMENT_MAX_BYTES, LEASE_DOCUMENT_TYPE } from "#core/shared/units/lease-requests";
import { memberOwnedUnitsInOrg } from "#core/server/utils/unit-record-writes";

const isPdf = (bytes: Uint8Array) => bytes.length > 4 && Buffer.from(bytes.subarray(0, 5)).toString("latin1") === "%PDF-";

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuthenticatedUser(event);
  const parts = (await readMultipartFormData(event)) ?? [];
  const orgId = parts.find((p) => p.name === "orgId")?.data.toString("utf8").trim() ?? "";
  const file = parts.find((p) => p.name === "file" && p.filename);
  if (!orgId) throw createError({ statusCode: 400, message: "orgId is required" });

  const { memberId } = await requireMembership(event, orgId);
  if (!memberId) throw createError({ statusCode: 403, message: "No member record in this organization" });
  if (!(await memberOwnedUnitsInOrg(orgId, memberId)).length) {
    throw createError({ statusCode: 403, message: "Only an owner of a unit here can report a lease." });
  }

  if (!file?.data?.length) throw createError({ statusCode: 400, message: "Attach the signed lease." });
  if (file.data.length > LEASE_DOCUMENT_MAX_BYTES) {
    throw createError({ statusCode: 413, message: "That PDF is over 4 MB. Save a smaller copy and try again." });
  }
  if (!isPdf(file.data)) throw createError({ statusCode: 400, message: "The signed lease has to be a PDF." });
  await enforceStorageLimit(orgId, file.data.length);

  const filename = (file.filename || "lease.pdf").replace(/[\\/]/g, "_").slice(0, 200);
  const form = new FormData();
  form.append("title", filename.replace(/\.pdf$/i, ""));
  form.append("file", new File([new Uint8Array(file.data)], filename, { type: LEASE_DOCUMENT_TYPE }), filename);

  const directus = getTypedDirectus();
  const uploaded = (await directus.request(uploadFiles(form))) as unknown as { id?: string } | null;
  if (!uploaded?.id) throw createError({ statusCode: 502, message: "Couldn't store the lease. Try again." });
  // Directus stamps the app's account on create; the owner is who uploaded it.
  await directus.request(updateFile(uploaded.id, { uploaded_by: userId } as never));

  return { id: uploaded.id, filename };
});
