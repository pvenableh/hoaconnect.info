/**
 * POST /api/hoa/units/lease-document — an admin uploads the signed lease for
 * a lease on the unit page. Multipart: `orgId`, `file` (one PDF, 4 MB at most).
 * Returns `{ id, filename }`; the lease form then saves the lease through
 * /api/hoa/units/records, which accepts a file the admin uploaded and filed
 * nowhere (assertDocumentInOrg).
 *
 * Not /api/directus/files/upload: a file in no folder uploaded with the
 * admin's own token comes back with no id, so the lease was saved with no
 * document (storeLeaseDocument says why).
 */
import { requireUnitRecordsAdmin } from "#core/server/utils/unit-record-writes";
import { storeLeaseDocument } from "#core/server/utils/lease-documents";

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuthenticatedUser(event);
  const parts = (await readMultipartFormData(event)) ?? [];
  const orgId = parts.find((p) => p.name === "orgId")?.data.toString("utf8").trim() ?? "";
  if (!orgId) throw createError({ statusCode: 400, message: "orgId is required" });

  await requireUnitRecordsAdmin(event, orgId);
  return storeLeaseDocument(orgId, userId, parts.find((p) => p.name === "file" && p.filename));
});
