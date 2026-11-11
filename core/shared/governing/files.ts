/**
 * The mark every governing file carries in its Directus `description`: an
 * original document and each page image rendered from it.
 *
 * Directus's public policy serves images to anyone (logos in sent emails and
 * landing pages need that), and it serves them straight from `/assets/<id>`,
 * past the app's own checks. The public grant leaves out any file whose
 * description starts with `GOVERNING_FILE_PREFIX`, so a draft's scan reaches
 * nobody except through `/api/directus/assets/:id`, which asks
 * `mayOpenGoverningSourceFile`. A description travels with the file, so moving
 * it to another folder keeps it private.
 *
 * The parts of an unfinished upload (`governing-upload:…`) share the prefix.
 * The public filter itself is in `scripts/lib/public-files.ts`.
 */
export const GOVERNING_FILE_PREFIX = "governing-";
export const GOVERNING_FILE_MARKER = `${GOVERNING_FILE_PREFIX}file`;

export const isGoverningFileMarker = (description: unknown): boolean =>
  typeof description === "string" && description.startsWith(GOVERNING_FILE_PREFIX);

/**
 * A Directus filter for every file that is not a governing file. The storage
 * library and the general files route list with it: governing files are shown,
 * renamed and removed only on the governing pages, which audit each change.
 */
export const NOT_GOVERNING_FILE = {
  _or: [{ description: { _null: true } }, { description: { _nstarts_with: GOVERNING_FILE_PREFIX } }],
};

export const GOVERNING_FILE_ELSEWHERE = "This is a governing document file. Manage it on the Governing Documents pages.";
