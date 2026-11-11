/**
 * What the Directus **public** policy may read of `directus_files`. One
 * definition, used by `scripts/scope-public-file-reads.ts` (writes it) and
 * `scripts/audit-public-policy.ts` (fails when the live grant differs).
 *
 * Rows: images, except governing files and support files. Images stay public
 * because the logo in every email already sent and every image on an anonymous
 * landing page is a bare `/assets/<id>` URL fetched with no session. Governing
 * originals and page images (`governing-…`, Session 3 of
 * docs/prompts/governing-loose-ends.md) and support attachments (`support-…`)
 * are not among those: they reach people only through the app's own routes.
 *
 * Fields: only `id`. Nothing anonymous reads a file's details; `/assets` needs
 * only the right to read the row. Before this, anonymous `/files` listed every
 * public image of every community with its title, file name, folder, uploader
 * and metadata.
 *
 * `description` is null on most files, and Directus's "does not start with"
 * leaves a null out, hence the `_null` arm.
 */
import { GOVERNING_FILE_PREFIX } from "../../core/shared/governing/files";
import { SUPPORT_FILE_PREFIX } from "../../core/shared/support/attachments";

export const PRIVATE_FILE_PREFIXES = [GOVERNING_FILE_PREFIX, SUPPORT_FILE_PREFIX] as const;

export const PUBLIC_FILES_FILTER = {
  _and: [
    { type: { _starts_with: "image/" } },
    {
      _or: [
        { description: { _null: true } },
        { _and: PRIVATE_FILE_PREFIXES.map((prefix) => ({ description: { _nstarts_with: prefix } })) },
      ],
    },
  ],
};

export const PUBLIC_FILES_FIELDS = ["id"];

/** The same rule in code, for tests and dry runs: would the public policy serve this file? */
export function isPublicFile(file: { type?: string | null; description?: string | null }): boolean {
  if (!(file.type ?? "").startsWith("image/")) return false;
  const description = file.description;
  return description == null || !PRIVATE_FILE_PREFIXES.some((prefix) => description.startsWith(prefix));
}
