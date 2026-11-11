// File and folder permissions reach the organization through the folder
// (scripts/lib/folder-org-filters.ts). The rewrite is what
// scripts/fix-folder-org-filters.ts applied to production on 2026-11-11.
import { describe, expect, it } from "vitest";
import { FOLDER_OF_MY_ORG, FOLDER_PATH, ORG_PATH, rewriteFolderFilter, usesFolderPath } from "../../scripts/lib/folder-org-filters";
import { MEMBER_FILE_UPDATE_FILTER } from "../../scripts/lib/member-files";

const MINE = { hoa_organizations: { id: { _in: ORG_PATH } } };

describe("folder org filters", () => {
  it("a folder rule follows the alias; a file rule follows its folder", () => {
    expect(FOLDER_OF_MY_ORG).toEqual(MINE);
    expect(rewriteFolderFilter({ id: { _in: FOLDER_PATH } })).toEqual(MINE);
    expect(rewriteFolderFilter({ folder: { _in: FOLDER_PATH } })).toEqual({ folder: MINE });
    expect(rewriteFolderFilter({ folder: { parent: { _in: FOLDER_PATH } } })).toEqual({ folder: { parent: MINE } });
  });

  it("leaves everything else as it was, inside _and and _or too", () => {
    const other = { _and: [{ uploaded_by: { _eq: "$CURRENT_USER" } }, { _or: [{ description: { _null: true } }, { folder: { _in: FOLDER_PATH } }] }] };
    expect(rewriteFolderFilter(other)).toEqual({ _and: [{ uploaded_by: { _eq: "$CURRENT_USER" } }, { _or: [{ description: { _null: true } }, { folder: MINE }] }] });
    expect(rewriteFolderFilter({ organization: { _in: ORG_PATH } })).toEqual({ organization: { _in: ORG_PATH } });
    expect(rewriteFolderFilter(null)).toBeNull();
  });

  it("is idempotent, and its result never needs the folder path", () => {
    const once = rewriteFolderFilter({ folder: { _in: FOLDER_PATH } });
    expect(rewriteFolderFilter(once)).toEqual(once);
    expect(usesFolderPath(once)).toBe(false);
    expect(usesFolderPath({ id: { _in: FOLDER_PATH } })).toBe(true);
  });

  it("rewriting the member update rule as it was gives the rule as it is now", () => {
    const old = JSON.parse(JSON.stringify(MEMBER_FILE_UPDATE_FILTER).replaceAll(JSON.stringify(MINE), JSON.stringify({ _in: FOLDER_PATH })));
    expect(usesFolderPath(old)).toBe(true);
    expect(rewriteFolderFilter(old)).toEqual(MEMBER_FILE_UPDATE_FILTER);
  });
});
