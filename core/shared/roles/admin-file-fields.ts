/**
 * File fields the HOA Admin policy may not write through Directus.
 *
 * A file id carries no tenancy. A community "has" a file when one of its rows
 * names it (core/server/utils/file-owner.ts), and then the asset proxy opens
 * it to that community's members, and `filesOutsideOrg` counts it as theirs.
 * The HOA Admin create and update on these tables validated only the row's
 * own `organization` and took every field, so through the Directus API an
 * admin could save a document, meeting or amenity in their community naming
 * another community's file id, and Directus links any id that exists
 * (scripts/lib/admin-scope-perms.ts says why a validation cannot check it).
 *
 * So these fields are left out of those two rules' field lists
 * (scripts/setup-directus-permissions.ts), and the one the app writes, a new
 * document's file, goes through `/api/directus/items`, which checks it and
 * sets it with the app's token (core/server/utils/admin-file-writes.ts). The
 * others no page writes. Read and delete keep every field.
 *
 * Pure: no Directus.
 */
export const ADMIN_FILE_FIELDS: Readonly<Record<string, readonly string[]>> = {
  hoa_documents: ["file"],
  hoa_meetings: ["notice_file", "recording_file"],
  hoa_amenities: ["image"],
};

/** The file fields of `collection` the HOA Admin policy may not write; empty when none. */
export function adminFileFields(collection: string): readonly string[] {
  return ADMIN_FILE_FIELDS[collection] ?? [];
}

/**
 * The field list for the HOA Admin create and update on `collection`: every
 * field it has (as Directus lists them, aliases included), but its file
 * fields, sorted. A field added to the table later is not writable until
 * `pnpm setup:permissions` runs again.
 */
export function adminWritableFields(collection: string, liveFields: readonly string[]): string[] {
  const shut = new Set(adminFileFields(collection));
  return [...new Set(liveFields)].filter((f) => !shut.has(f)).sort();
}

/** The file fields a write names (null included: clearing one is a write too). */
export function namedFileFields(collection: string, data: unknown): string[] {
  if (!data || typeof data !== "object" || Array.isArray(data)) return [];
  return adminFileFields(collection).filter((f) => Object.prototype.hasOwnProperty.call(data, f));
}
