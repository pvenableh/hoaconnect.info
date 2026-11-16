/**
 * PATCH /api/hoa/units/records — an admin changes a pet or vehicle, or ends
 * it on move-out (end_date and status "archived"; history is never deleted).
 *
 * Body: { orgId, id, kind: "pet" | "vehicle", patch }. The row must be the
 * community's (its own organization, its unit's and its person's agree); a new
 * person must be a member of it, and a new photo one it may use. The unit and
 * organization cannot change here. Written with the app's token: the HOA Admin
 * policy has no update on hoa_pets or hoa_vehicles
 * (core/shared/units/record-writes.ts).
 */
import { readItem, updateItem } from "@directus/sdk";
import { RECORD_COLLECTION, patchRecordBody, recordCommunity } from "#core/shared/units/record-writes";
import { assertMemberInOrg, assertPhotoInOrg, requireUnitRecordsAdmin } from "#core/server/utils/unit-record-writes";

export default defineEventHandler(async (event) => {
  await requireUserSession(event);
  const parsed = patchRecordBody.safeParse(await readBody(event).catch(() => null));
  if (!parsed.success) throw createError({ statusCode: 400, message: parsed.error.issues[0]?.message ?? "Check the form." });
  const { orgId, id, kind, patch } = parsed.data;

  await requireUnitRecordsAdmin(event, orgId);

  const directus = getTypedDirectus();
  const collection = RECORD_COLLECTION[kind];
  let row: Parameters<typeof recordCommunity>[0] | null = null;
  try {
    row = (await directus.request(
      readItem(collection as never, id, { fields: ["id", "organization", "unit_id.organization", "member_id.organization"] } as never)
    )) as unknown as Parameters<typeof recordCommunity>[0];
  } catch {
    row = null;
  }
  if (!row || recordCommunity(row) !== orgId) throw createError({ statusCode: 404, message: kind === "pet" ? "Pet not found" : "Vehicle not found" });

  if (patch.member_id) await assertMemberInOrg(orgId, patch.member_id);
  await assertPhotoInOrg(orgId, patch.image);

  return await directus.request(updateItem(collection as never, id, patch as never));
});
