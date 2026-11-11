// The Directus public read on directus_files (scripts/lib/public-files.ts):
// images, except governing files. Pinned here because the live grant is
// audited against this exact object (scripts/audit-public-policy.ts).
import { describe, expect, it } from "vitest";
import { GOVERNING_FILE_MARKER, GOVERNING_FILE_PREFIX, isGoverningFileMarker } from "#core/shared/governing/files";
import { isPublicFile, PUBLIC_FILES_FIELDS, PUBLIC_FILES_FILTER } from "../../scripts/lib/public-files";

describe("public file read", () => {
  it("is images whose description is empty or starts with neither governing- nor support-, and only their id", () => {
    expect(PUBLIC_FILES_FILTER).toEqual({
      _and: [
        { type: { _starts_with: "image/" } },
        {
          _or: [
            { description: { _null: true } },
            { _and: [{ description: { _nstarts_with: "governing-" } }, { description: { _nstarts_with: "support-" } }] },
          ],
        },
      ],
    });
    expect(PUBLIC_FILES_FIELDS).toEqual(["id"]);
  });

  it("serves logos and landing images as before, with or without a description", () => {
    expect(isPublicFile({ type: "image/png", description: null })).toBe(true);
    expect(isPublicFile({ type: "image/jpeg", description: "" })).toBe(true);
    expect(isPublicFile({ type: "image/webp", description: "Pool deck, summer" })).toBe(true);
  });

  it("never serves a governing file or a support attachment, nor anything that is not an image", () => {
    expect(isPublicFile({ type: "image/jpeg", description: GOVERNING_FILE_MARKER })).toBe(false);
    expect(isPublicFile({ type: "image/png", description: "governing-upload:org:abc" })).toBe(false);
    expect(isPublicFile({ type: "image/png", description: "support-message:m1" })).toBe(false);
    expect(isPublicFile({ type: "image/png", description: "support-upload:u1" })).toBe(false);
    expect(isPublicFile({ type: "application/pdf", description: null })).toBe(false);
    expect(isPublicFile({ type: null, description: null })).toBe(false);
  });

  it("the marker the app writes is the one the filter leaves out", () => {
    expect(GOVERNING_FILE_MARKER.startsWith(GOVERNING_FILE_PREFIX)).toBe(true);
    expect(isGoverningFileMarker(GOVERNING_FILE_MARKER)).toBe(true);
    expect(isGoverningFileMarker("support-attachment")).toBe(false);
    expect(isGoverningFileMarker(null)).toBe(false);
  });
});
