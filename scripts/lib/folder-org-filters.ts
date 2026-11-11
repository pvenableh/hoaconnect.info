/**
 * Org scoping for `directus_files` and `directus_folders` permissions without
 * `$CURRENT_USER.hoa_members.organization.folder`.
 *
 * WHY
 * ---
 * Almost every HOA permission scopes rows with `$CURRENT_USER.hoa_members.organization`
 * (263 rows on 2026-11-11). The file and folder rules alone used
 * `$CURRENT_USER.hoa_members.organization.folder` (11 rows). Directus fetches
 * every `$CURRENT_USER` path a request needs in one read of the user, so when a
 * request needs both, `organization` comes back as an object (to reach its
 * `folder`) and the plain path no longer yields ids. Every such request
 * answered a bare 500: any nested read of a file, folder or user with a
 * member's own token (`/users/me?fields=avatar.id`, the Documents page's
 * `hoa_documents` list with `file.*`, `files.uploaded_by.*`, an org's
 * `folder.*`), while each collection read on its own worked. Requests that
 * needed one path only, such as files with their folder, were fine.
 *
 * THE FIX
 * -------
 * `directus_folders` gets a reverse alias, `hoa_organizations` (the O2M side of
 * `hoa_organizations.folder`; metadata only, no column, as `0776dba` did for
 * `directus_users.hoa_members`), and the file and folder rules reach the
 * organization through the folder, on the same path everything else uses:
 *
 *   folders: { id: { _in: <folder path> } }      -> { hoa_organizations: { id: { _in: <org path> } } }
 *   files:   { folder: { _in: <folder path> } }  -> { folder: { hoa_organizations: { id: { _in: <org path> } } } }
 *
 * Same rows as before: a folder that is an organization's root, and files in
 * one. A payload validation cannot follow a relation, so a validation that used
 * the folder path is dropped (HOA Admin create and update kept new files in the
 * root folder; HOA Member create never had one).
 */
export const FOLDER_PATH = "$CURRENT_USER.hoa_members.organization.folder";
export const ORG_PATH = "$CURRENT_USER.hoa_members.organization";
export const FOLDER_ORG_ALIAS = "hoa_organizations";

/** A folder whose organization is one of the current user's. */
export const FOLDER_OF_MY_ORG = { [FOLDER_ORG_ALIAS]: { id: { _in: ORG_PATH } } };

const isFolderPathIn = (value: unknown) =>
  !!value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 1 && (value as Record<string, unknown>)._in === FOLDER_PATH;

/**
 * Rewrite a permission filter so it no longer needs FOLDER_PATH. `id` (a
 * folder's own id) becomes the alias; any other key (`folder`, `parent`: a
 * link to a folder) keeps its key and follows the alias. Everything else is
 * returned as it was.
 */
export function rewriteFolderFilter(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(rewriteFolderFilter);
  if (!node || typeof node !== "object") return node;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (isFolderPathIn(value)) {
      if (key === "id") Object.assign(out, FOLDER_OF_MY_ORG);
      else out[key] = FOLDER_OF_MY_ORG;
    } else {
      out[key] = rewriteFolderFilter(value);
    }
  }
  return out;
}

export const usesFolderPath = (node: unknown) => JSON.stringify(node ?? null).includes(`"${FOLDER_PATH}"`);
