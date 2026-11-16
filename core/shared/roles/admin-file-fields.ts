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
  return fieldsWithout(liveFields, adminFileFields(collection));
}

/** The file fields a write names (null included: clearing one is a write too). */
export function namedFileFields(collection: string, data: unknown): string[] {
  if (!data || typeof data !== "object" || Array.isArray(data)) return [];
  return adminFileFields(collection).filter((f) => Object.prototype.hasOwnProperty.call(data, f));
}

/**
 * Where a file or folder sits: `directus_files.folder`, `directus_folders.parent`.
 * A community's library is the folder tree under its root, and a file or folder
 * placed in it is that community's (core/server/utils/org-files.ts). Directus
 * cannot check a placement (a validation cannot follow a relation, and the tree
 * nests), so no community policy writes these fields: on its own token a member
 * or admin could put a file or folder into another community's library. The
 * app's routes place them with the app's token, after checking
 * (core/server/utils/caller-library.ts). Renames, titles and deletes stay on the
 * person's own token.
 */
export const PLACEMENT_FIELDS: Readonly<Record<"directus_files" | "directus_folders", readonly string[]>> = {
  directus_files: ["folder"],
  directus_folders: ["parent"],
};

/** Every live field but the ones shut, sorted: an explicit field list for a create or update rule. */
export function fieldsWithout(liveFields: readonly string[], shut: readonly string[]): string[] {
  const out = new Set(shut);
  return [...new Set(liveFields)].filter((f) => !out.has(f)).sort();
}
