/**
 * What the Directus **HOA Member** policy may change in `directus_files`. One
 * definition, written by `scripts/scope-member-file-writes.ts`.
 *
 * Until 2026-11-11 its update and delete filters were `{}`: any file in
 * Directus. The policy has app access, and `/api/websocket/token` hands every
 * signed-in user their own Directus token, so any member of any community could
 * delete or replace another community's files, a governing original, or a
 * support attachment, or strip the `governing-` mark that keeps a page image
 * out of the public read.
 *
 * What the app itself does with a member's own token: uploads (create, left as
 * it is) and moving a file between folders on the Documents page (update). It
 * never deletes a file that way; the storage library and the governing pages
 * delete with the app's token after their own checks. So:
 *
 *   update: the member's own uploads, or a file in their community's library
 *           (its root folder and three levels below), never a governing or
 *           support file;
 *   delete: the member's own uploads only, never a governing or support file.
 */
import { FOLDER_OF_MY_ORG } from "./folder-org-filters";
import { PRIVATE_FILE_PREFIXES } from "./public-files";

/** Not a governing file and not a support file. A null description is neither. */
const NOT_PRIVATE = {
  _or: [
    { description: { _null: true } },
    { _and: PRIVATE_FILE_PREFIXES.map((prefix) => ({ description: { _nstarts_with: prefix } })) },
  ],
};
const OWN_UPLOAD = { uploaded_by: { _eq: "$CURRENT_USER" } };
// A folder is in the library when it, its parent, or a folder up to three levels
// above it is a community root. Reached through the folder's organization, never
// `$CURRENT_USER.hoa_members.organization.folder` (see folder-org-filters.ts).
const IN_COMMUNITY_LIBRARY = [
  { folder: FOLDER_OF_MY_ORG },
  { folder: { parent: FOLDER_OF_MY_ORG } },
  { folder: { parent: { parent: FOLDER_OF_MY_ORG } } },
  { folder: { parent: { parent: { parent: FOLDER_OF_MY_ORG } } } },
];

export const MEMBER_FILE_UPDATE_FILTER = { _and: [NOT_PRIVATE, { _or: [OWN_UPLOAD, ...IN_COMMUNITY_LIBRARY] }] };
export const MEMBER_FILE_DELETE_FILTER = { _and: [NOT_PRIVATE, OWN_UPLOAD] };
