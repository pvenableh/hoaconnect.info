/**
 * The checks POST and PATCH /api/hoa/units/records share
 * (core/shared/units/record-writes.ts says why they are routes), the units a
 * resident's approved pet or vehicle may go on, and the units an owner may
 * report a lease on.
 */
import type { H3Event } from "h3";
import { readFile, readItem, readItems } from "@directus/sdk";
import { currentUnitsInOrg, type UnitLink } from "#core/shared/units/record-writes";
import { LEASE_DOCUMENT_TYPE, ownedUnitsInOrg, type OwnerUnitLink } from "#core/shared/units/lease-requests";

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
 * another community's file is neither. An expense's receipt is checked the
 * same way (assertReceiptInOrg, expense-receipts.ts), with its own message.
 */
export async function assertDocumentInOrg(
  orgId: string,
  fileId: string | null | undefined,
  userId: string,
  message = "That document isn't one of this community's files."
): Promise<void> {
  if (!fileId) return;
  if (!(await filesOutsideOrg(orgId, [fileId])).length) return;
  if (await ownUnfiledUpload(fileId, userId)) return;
  throw createError({ statusCode: 403, message });
}

interface UploadedFile {
  id: string;
  type: string | null;
  filename_download: string | null;
}

/** The file, when `userId` uploaded it and filed it in no library; else null. */
type FileRow = { uploaded_by?: unknown; folder?: unknown; type?: string | null; filename_download?: string | null };

async function ownUnfiledUpload(fileId: string, userId: string): Promise<UploadedFile | null> {
  if (!userId) return null;
  let file: FileRow | null = null;
  try {
    file = (await getTypedDirectus().request(
      readFile(fileId, { fields: ["id", "uploaded_by", "folder", "type", "filename_download"] } as never)
    )) as unknown as FileRow;
  } catch {
    file = null;
  }
  if (!file || asId(file.uploaded_by) !== userId || file.folder) return null;
  return { id: fileId, type: file.type ?? null, filename_download: file.filename_download ?? null };
}

/**
 * Throw 403 unless an owner's lease document is a PDF they uploaded and filed
 * nowhere. Stricter than assertDocumentInOrg: a resident may not attach a
 * library file or another record's file, which the new lease would then let
 * them and their tenant open. Returns the file's name for the reviewer.
 */
export async function assertOwnLeaseUpload(fileId: string, userId: string): Promise<{ filename: string | null }> {
  const file = await ownUnfiledUpload(fileId, userId);
  if (!file) throw createError({ statusCode: 403, message: "Attach a lease you uploaded here." });
  if (file.type !== LEASE_DOCUMENT_TYPE) throw createError({ statusCode: 400, message: "The signed lease has to be a PDF." });
  return { filename: file.filename_download };
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

/**
 * The units `memberId` owns in `orgId` today, primary first (ownedUnitsInOrg:
 * the link's residency, else the person's own).
 */
export async function memberOwnedUnitsInOrg(orgId: string, memberId: string): Promise<{ id: string; unit_number: string | null }[]> {
  const directus = getTypedDirectus();
  const links = (await directus.request(
    readItems("hoa_member_units" as never, {
      filter: { member_id: { _eq: memberId } },
      fields: ["unit_id.id", "unit_id.organization", "unit_id.unit_number", "status", "end_date", "is_primary_unit", "member_type"],
      limit: -1,
    } as never)
  )) as unknown as OwnerUnitLink[];
  let memberType: unknown = null;
  try {
    const member = (await directus.request(readItem("hoa_members" as never, memberId, { fields: ["id", "member_type"] } as never))) as unknown as {
      member_type?: unknown;
    };
    memberType = member?.member_type ?? null;
  } catch {
    memberType = null;
  }
  return ownedUnitsInOrg(links || [], memberType, orgId, new Date().toISOString().slice(0, 10));
}
