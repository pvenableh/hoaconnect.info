/**
 * The checks POST and PATCH /api/hoa/units/records share
 * (core/shared/units/record-writes.ts says why they are routes).
 */
import type { H3Event } from "h3";
import { readItem } from "@directus/sdk";

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
