/**
 * The checks POST and PATCH /api/hoa/units/records share
 * (core/shared/units/record-writes.ts says why they are routes), and the
 * units a resident's approved pet or vehicle may go on.
 */
import type { H3Event } from "h3";
import { readFile, readItem, readItems } from "@directus/sdk";
import { currentUnitsInOrg, type UnitLink } from "#core/shared/units/record-writes";

const asId = (v: unknown): string | null =>
  typeof v === "string" ? v : ((v as { id?: unknown } | null)?.id as string | undefined) ?? null;

/** Throw 403 unless the caller is an admin of `orgId`. */
export async function requireUnitRecordsAdmin(event: H3Event, orgId: string): Promise<void> {
  const admin = await checkAdminAccess(event, orgId);
  if (!admin.isAdmin) throw createError({ statusCode: 403, message: "Only an admin of this community can change a unit's records." });
}

/** Throw 400 unless `memberId` is a member of `orgId`. */
export async function assertMemberInOrg(orgId: string, memberId: string): Promise<void> {
  let member: { organization?: unknown } | null = null;
  try {
    member = (await getTypedDirectus().request(readItem("hoa_members" as never, memberId, { fields: ["id", "organization"] } as never))) as unknown as { organization?: unknown };
  } catch {
    member = null;
  }
  if (asId(member?.organization) !== orgId) {
    throw createError({ statusCode: 400, message: "That person isn't a member of this community." });
  }
}

/**
 * Throw 403 unless the photo may be this community's: an image, a file in its
 * library, or one a record of its already claims. A pet's photo is uploaded
 * outside every library, so images pass; a PDF of another community's does not.
 */
export async function assertPhotoInOrg(orgId: string, image: string | null | undefined): Promise<void> {
  if (!image) return;
  const refused = await filesOutsideOrg(orgId, [image], { allowPublicImages: true });
  if (refused.length) throw createError({ statusCode: 403, message: "That photo isn't one of this community's files." });
}

/**
 * Throw 403 unless a lease may carry this document: one of the community's
 * files (its library, or claimed by one of its records, such as this lease),
 * or a file the caller uploaded and has not filed in any library. The lease
 * form uploads with no folder, so a new lease's document is the second kind;
 * another community's file is neither.
 */
export async function assertDocumentInOrg(orgId: string, fileId: string | null | undefined, userId: string): Promise<void> {
  if (!fileId) return;
  if (!(await filesOutsideOrg(orgId, [fileId])).length) return;
  let file: { uploaded_by?: unknown; folder?: unknown } | null = null;
  try {
    file = (await getTypedDirectus().request(readFile(fileId, { fields: ["id", "uploaded_by", "folder"] } as never))) as unknown as {
      uploaded_by?: unknown;
      folder?: unknown;
    };
  } catch {
    file = null;
  }
  if (file && asId(file.uploaded_by) === userId && !file.folder) return;
  throw createError({ statusCode: 403, message: "That document isn't one of this community's files." });
}

/** The units `memberId` is linked to in `orgId` today, primary first. */
export async function memberUnitsInOrg(orgId: string, memberId: string): Promise<{ id: string; unit_number: string | null }[]> {
  const links = (await getTypedDirectus().request(
    readItems("hoa_member_units" as never, {
      filter: { member_id: { _eq: memberId } },
      fields: ["unit_id.id", "unit_id.organization", "unit_id.unit_number", "status", "end_date", "is_primary_unit"],
      limit: -1,
    } as never)
  )) as unknown as UnitLink[];
  return currentUnitsInOrg(links || [], orgId, new Date().toISOString().slice(0, 10));
}
