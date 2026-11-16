/**
 * PATCH /api/hoa/units/records — an admin changes a pet, vehicle or lease, or
 * ends it (end_date, and status "archived" for a pet or vehicle, "expired" for
 * a lease; history is never deleted).
 *
 * Body: { orgId, id, kind: "pet" | "vehicle" | "lease", patch }. The row must be
 * the community's (its own organization and every row it names agree); a new
 * person must be a member of it, and a new photo or document one it may use.
 * The unit and organization cannot change here. Written with the app's token:
 * the HOA Admin policy has no update on hoa_pets, hoa_vehicles or hoa_leases
 * (core/shared/units/record-writes.ts).
 */
import { readItem, updateItem } from "@directus/sdk";
import { RECORD_COLLECTION, leaseCommunity, patchRecordBody, recordCommunity } from "#core/shared/units/record-writes";
import {
  assertDocumentInOrg,
  assertMemberInOrg,
  assertPhotoInOrg,
  requireUnitRecordsAdmin,
} from "#core/server/utils/unit-record-writes";

const NOT_FOUND = { pet: "Pet not found", vehicle: "Vehicle not found", lease: "Lease not found" } as const;

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const parsed = patchRecordBody.safeParse(await readBody(event).catch(() => null));
  if (!parsed.success) throw createError({ statusCode: 400, message: parsed.error.issues[0]?.message ?? "Check the form." });
  const body = parsed.data;
  const { orgId, id, kind } = body;

  await requireUnitRecordsAdmin(event, orgId);

  const directus = getTypedDirectus();
  const collection = RECORD_COLLECTION[kind];
  const fields =
    kind === "lease"
      ? ["id", "organization", "unit.organization", "tenant.organization", "owner.organization"]
      : ["id", "organization", "unit_id.organization", "member_id.organization"];
  let row: Record<string, unknown> | null = null;
  try {
    row = (await directus.request(readItem(collection as never, id, { fields } as never))) as unknown as Record<string, unknown>;
  } catch {
    row = null;
  }
  const community = !row ? null : kind === "lease" ? leaseCommunity(row) : recordCommunity(row);
  if (community !== orgId) throw createError({ statusCode: 404, message: NOT_FOUND[kind] });

  if (body.kind === "lease") {
    const { patch } = body;
    if (patch.tenant) await assertMemberInOrg(orgId, patch.tenant);
    if (patch.owner) await assertMemberInOrg(orgId, patch.owner);
    await assertDocumentInOrg(orgId, patch.document, String((session.user as { id?: unknown } | undefined)?.id ?? ""));
    return await directus.request(updateItem(collection as never, id, patch as never));
  }

  const { patch } = body;
  if (patch.member_id) await assertMemberInOrg(orgId, patch.member_id);
  await assertPhotoInOrg(orgId, patch.image);

  return await directus.request(updateItem(collection as never, id, patch as never));
});
