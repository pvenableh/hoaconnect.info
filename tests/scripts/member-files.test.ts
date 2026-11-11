// What the Directus HOA Member policy may change in directus_files
// (scripts/lib/member-files.ts). Pinned here because the live rows are written
// from these exact objects by scripts/scope-member-file-writes.ts.
import { describe, expect, it } from "vitest";
import { MEMBER_FILE_DELETE_FILTER, MEMBER_FILE_UPDATE_FILTER } from "../../scripts/lib/member-files";

const NOT_PRIVATE = {
  _or: [
    { description: { _null: true } },
    { _and: [{ description: { _nstarts_with: "governing-" } }, { description: { _nstarts_with: "support-" } }] },
  ],
};
const MINE = { hoa_organizations: { id: { _in: "$CURRENT_USER.hoa_members.organization" } } };

describe("HOA Member file writes", () => {
  it("update: own uploads or the community's library, never a governing or support file", () => {
    expect(MEMBER_FILE_UPDATE_FILTER).toEqual({
      _and: [
        NOT_PRIVATE,
        {
          _or: [
            { uploaded_by: { _eq: "$CURRENT_USER" } },
            { folder: MINE },
            { folder: { parent: MINE } },
            { folder: { parent: { parent: MINE } } },
            { folder: { parent: { parent: { parent: MINE } } } },
          ],
        },
      ],
    });
  });

  it("delete: own uploads only, never a governing or support file", () => {
    expect(MEMBER_FILE_DELETE_FILTER).toEqual({ _and: [NOT_PRIVATE, { uploaded_by: { _eq: "$CURRENT_USER" } }] });
    expect(JSON.stringify(MEMBER_FILE_DELETE_FILTER)).not.toContain("folder");
  });

  it("never needs $CURRENT_USER.hoa_members.organization.folder (see folder-org-filters.ts)", () => {
    expect(JSON.stringify([MEMBER_FILE_UPDATE_FILTER, MEMBER_FILE_DELETE_FILTER])).not.toContain("organization.folder");
  });
});
