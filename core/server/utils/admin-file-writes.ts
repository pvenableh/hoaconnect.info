/**
 * A write through `/api/directus/items` that names a file field the HOA Admin
 * policy may not write (core/shared/roles/admin-file-fields.ts): a new
 * document's file is the one the app sends.
 *
 * The proxy holds those fields back from the caller's own Directus write,
 * which no longer allows them, after checking:
 *   - the caller is an admin of the row's community (a new row's
 *     `organization`; an existing row's own, read with the app's token);
 *   - each file named is one of the community's files (its library, or one a
 *     record of its already names) or one the caller uploaded and filed
 *     nowhere (`assertDocumentInOrg`), unless it is the file the row has now.
 * Then it sets them with the app's token.
 */
import type { H3Event } from "h3";
import { deleteItem, readItem, updateItem } from "@directus/sdk";
import { adminFileFields, namedFileFields } from "#core/shared/roles/admin-file-fields";
import { assertDocumentInOrg } from "./unit-record-writes";

type Data = Record<string, unknown>;

export interface HeldFileFields {
  /** What the caller's own write carries: the data without the file fields. */
  data: Data;
  /** The file fields to set with the app's token afterwards. */
  files: Record<string, string | null>;
}

const asId = (v: unknown): string | null =>
  typeof v === "string" ? v : ((v as { id?: unknown } | null)?.id as string | undefined) ?? null;

/**
 * Null when the write names none of the collection's held file fields (it
 * goes through as it is). Otherwise the data to write with the caller's token
 * and the file fields to set after, once both checks pass; throws 400, 403 or
 * 404 before anything is written.
 */
export async function holdAdminFileFields(
  event: H3Event,
  collection: string,
  operation: string,
  id: unknown,
  data: unknown
): Promise<HeldFileFields | null> {
  if (operation !== "create" && operation !== "update") return null;
  if (!adminFileFields(collection).length || !data || typeof data !== "object") return null;
  const rows = (Array.isArray(data) ? data : [data]) as unknown[];
  if (!rows.some((r) => namedFileFields(collection, r).length)) return null;
  if (Array.isArray(data) || Array.isArray(id)) {
    throw createError({ statusCode: 400, message: "Set a file on one row at a time." });
  }

  const write = data as Data;
  const named = namedFileFields(collection, write);
  let orgId: string | null;
  let current: Data = {};
  if (operation === "create") {
    orgId = asId(write.organization);
  } else {
    if (typeof id !== "string" && typeof id !== "number") throw createError({ statusCode: 400, message: "ID required for update operation" });
    try {
      current = (await getTypedDirectus().request(
        readItem(collection as never, id as never, { fields: ["id", "organization", ...named] } as never)
      )) as unknown as Data;
    } catch {
      throw createError({ statusCode: 404, message: "Not found" });
    }
    orgId = asId(current?.organization);
  }
  if (!orgId) throw createError({ statusCode: 400, message: "Name the community the row belongs to." });

  const admin = await checkAdminAccess(event, orgId);
  if (!admin.isAdmin) throw createError({ statusCode: 403, message: "Only an admin of this community can attach a file here." });

  const session = await getUserSession(event);
  const userId = String((session?.user as { id?: unknown } | undefined)?.id ?? "");
  const files: Record<string, string | null> = {};
  for (const field of named) {
    const raw = write[field];
    // An object here would be a nested write: a new file, or a link Directus makes unchecked.
    if (raw != null && typeof raw !== "string") throw createError({ statusCode: 400, message: "Name a file by its id." });
    const value = (raw as string | null | undefined) || null;
    if (value && value !== asId(current[field])) {
      await assertDocumentInOrg(orgId, value, userId, "That file isn't one of this community's files.");
    }
    files[field] = value;
  }

  const rest: Data = { ...write };
  for (const field of named) delete rest[field];
  return { data: rest, files };
}

/** Set held file fields on the row with the app's token; returns the row Directus answers with. */
export async function setHeldFileFields(collection: string, rowId: string | number, files: HeldFileFields["files"]): Promise<unknown> {
  return getTypedDirectus().request(updateItem(collection as never, rowId as never, files as never));
}

/**
 * After the caller's own create: set the held fields, or, if that fails, take
 * the new row away again with the app's token, so a document is never left
 * without the file it was created for.
 */
export async function finishHeldCreate(collection: string, created: unknown, files: HeldFileFields["files"]): Promise<unknown> {
  const rowId = (created as { id?: string | number } | null)?.id;
  if (rowId == null || Object.values(files).every((v) => v == null)) return created;
  try {
    await setHeldFileFields(collection, rowId, files);
  } catch (e) {
    await getTypedDirectus()
      .request(deleteItem(collection as never, rowId as never))
      .catch(() => undefined);
    throw e;
  }
  return { ...(created as object), ...files };
}
