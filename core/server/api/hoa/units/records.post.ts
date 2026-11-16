/**
 * POST /api/hoa/units/records — an admin adds a pet or vehicle to a unit.
 *
 * Body: { orgId, unitId, kind: "pet" | "vehicle", record }. The unit and the
 * person must be the community's, and the photo one it may use. Written with
 * the app's token: the HOA Admin policy has no create on hoa_pets or
 * hoa_vehicles, because Directus cannot check the person a new row names
 * (core/shared/units/record-writes.ts). Reads stay GET /api/hoa/units/records.
 */
import { createItem, readItem } from "@directus/sdk";
import { RECORD_COLLECTION, createRecordBody } from "#core/shared/units/record-writes";
import { assertMemberInOrg, assertPhotoInOrg, requireUnitRecordsAdmin } from "#core/server/utils/unit-record-writes";

const asId = (v: unknown): string | null =>
  typeof v === "string" ? v : ((v as { id?: unknown } | null)?.id as string | undefined) ?? null;

export default defineEventHandler(async (event) => {
  await requireUserSession(event);
  const parsed = createRecordBody.safeParse(await readBody(event).catch(() => null));
  if (!parsed.success) throw createError({ statusCode: 400, message: parsed.error.issues[0]?.message ?? "Check the form." });
  const { orgId, unitId, kind, record } = parsed.data;

  await requireUnitRecordsAdmin(event, orgId);

  const directus = getTypedDirectus();
  let unit: { organization?: unknown } | null = null;
  try {
    unit = (await directus.request(readItem("hoa_units" as never, unitId, { fields: ["id", "organization"] } as never))) as unknown as { organization?: unknown };
  } catch {
    unit = null;
  }
  if (asId(unit?.organization) !== orgId) throw createError({ statusCode: 404, message: "Unit not found" });

  await assertMemberInOrg(orgId, record.member_id);
  await assertPhotoInOrg(orgId, record.image);

  const created = await directus.request(
    createItem(RECORD_COLLECTION[kind] as never, {
      ...record,
      unit_id: unitId,
      organization: orgId,
      status: record.status ?? "published",
      start_date: record.start_date ?? new Date().toISOString(),
    } as never)
  );
  return created;
});
