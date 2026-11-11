/**
 * What the Directus **public** policy may read of `directus_files`: images,
 * except governing files. One definition, used by
 * `scripts/scope-public-file-reads.ts` (writes it) and
 * `scripts/audit-public-policy.ts` (fails when the live grant differs).
 *
 * Images stay public because the logo in every email already sent and every
 * image on an anonymous landing page is a bare `/assets/<id>` URL fetched with
 * no session. Governing originals and page images are not among those: they
 * carry `GOVERNING_FILE_PREFIX` in their description and reach people only
 * through `/api/directus/assets/:id` (Session 3 of
 * docs/prompts/governing-loose-ends.md, Peter's choice 2026-11-11).
 *
 * `description` is null on most files, and Directus's "does not start with"
 * leaves a null out, hence the `_null` arm.
 */
import { GOVERNING_FILE_PREFIX } from "../../core/shared/governing/files";

export const PUBLIC_FILES_FILTER = {
  _and: [
    { type: { _starts_with: "image/" } },
    { _or: [{ description: { _null: true } }, { description: { _nstarts_with: GOVERNING_FILE_PREFIX } }] },
  ],
};

/** The same rule in code, for tests and dry runs: would the public policy serve this file? */
export function isPublicFile(file: { type?: string | null; description?: string | null }): boolean {
  if (!(file.type ?? "").startsWith("image/")) return false;
  return file.description == null || !file.description.startsWith(GOVERNING_FILE_PREFIX);
}
