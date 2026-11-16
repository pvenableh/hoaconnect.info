/**
 * POST /api/hoa/units/records — an admin adds a pet, vehicle or lease to a unit.
 *
 * Body: { orgId, unitId, kind: "pet" | "vehicle" | "lease", record }. The unit
 * and every person named must be the community's, and a photo or lease
 * document one it may use. Written with the app's token: the HOA Admin policy
 * has no create on hoa_pets, hoa_vehicles or hoa_leases, because Directus
 * cannot check the rows a new record names (core/shared/units/record-writes.ts).
 * Reads stay GET /api/hoa/units/records.
 */
import { createItem, readItem } from "@directus/sdk";
import { RECORD_COLLECTION, createRecordBody } from "#core/shared/units/record-writes";
import {
  assertDocumentInOrg,
  assertMemberInOrg,
  assertPhotoInOrg,
  requireUnitRecordsAdmin,
} from "#core/server/utils/unit-record-writes";

const asId = (v: unknown): string | null =>
  typeof v === "string" ? v : ((v as { id?: unknown } | null)?.id as string | undefined) ?? null;

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const parsed = createRecordBody.safeParse(await readBody(event).catch(() => null));
  if (!parsed.success) throw createError({ statusCode: 400, message: parsed.error.issues[0]?.message ?? "Check the form." });
  const body = parsed.data;
  const { orgId, unitId } = body;

  await requireUnitRecordsAdmin(event, orgId);

  const directus = getTypedDirectus();
  let unit: { organization?: unknown } | null = null;
  try {
    unit = (await directus.request(readItem("hoa_units" as never, unitId, { fields: ["id", "organization"] } as never))) as unknown as { organization?: unknown };
  } catch {
    unit = null;
  }
  if (asId(unit?.organization) !== orgId) throw createError({ statusCode: 404, message: "Unit not found" });

  const now = new Date().toISOString();

  if (body.kind === "lease") {
    const { record } = body;
    await assertMemberInOrg(orgId, record.tenant);
    if (record.owner) await assertMemberInOrg(orgId, record.owner);
    await assertDocumentInOrg(orgId, record.document, String((session.user as { id?: unknown } | undefined)?.id ?? ""));
    return await directus.request(
      createItem("hoa_leases" as never, {
        ...record,
        unit: unitId,
        organization: orgId,
        status: record.status ?? "active",
        start_date: record.start_date ?? now,
      } as never)
    );
  }

  const { kind, record } = body;
  await assertMemberInOrg(orgId, record.member_id);
  await assertPhotoInOrg(orgId, record.image);

  return await directus.request(
    createItem(RECORD_COLLECTION[kind] as never, {
      ...record,
      unit_id: unitId,
      organization: orgId,
      status: record.status ?? "published",
      start_date: record.start_date ?? now,
    } as never)
  );
});
