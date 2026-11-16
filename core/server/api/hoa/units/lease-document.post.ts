/**
 * POST /api/hoa/units/lease-document — an admin uploads the signed lease for
 * a lease on the unit page. Multipart: `orgId`, `file` (one PDF, 4 MB at most).
 * Returns `{ id, filename }`; the lease form then saves the lease through
 * /api/hoa/units/records, which accepts it as one of the community's files
 * (assertDocumentInOrg): it is filed in the community's Records › Leases folder,
 * marked as a record's file (storeLeaseDocument says why).
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
