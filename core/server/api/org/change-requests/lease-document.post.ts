/**
 * POST /api/org/change-requests/lease-document — an owner uploads the signed
 * lease for a lease report. Multipart: `orgId`, `file` (one PDF, 4 MB at most).
 *
 * Not /api/directus/files/upload: a file in no folder uploaded with the
 * resident's own token comes back with no id (storeLeaseDocument says why).
 * `uploaded_by` is the owner, which is what the request checks
 * (assertOwnLeaseUpload).
 */
import { memberOwnedUnitsInOrg } from "#core/server/utils/unit-record-writes";
import { storeLeaseDocument } from "#core/server/utils/lease-documents";

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuthenticatedUser(event);
  const parts = (await readMultipartFormData(event)) ?? [];
  const orgId = parts.find((p) => p.name === "orgId")?.data.toString("utf8").trim() ?? "";
  if (!orgId) throw createError({ statusCode: 400, message: "orgId is required" });

  const { memberId } = await requireMembership(event, orgId);
  if (!memberId) throw createError({ statusCode: 403, message: "No member record in this organization" });
  if (!(await memberOwnedUnitsInOrg(orgId, memberId)).length) {
    throw createError({ statusCode: 403, message: "Only an owner of a unit here can report a lease." });
  }

  return storeLeaseDocument(orgId, userId, parts.find((p) => p.name === "file" && p.filename));
});
