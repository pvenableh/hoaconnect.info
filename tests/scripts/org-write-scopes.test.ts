// The scopes written over the HOA policies' unrestricted update and delete
// rights (scripts/lib/org-write-scopes.ts), applied to production 2026-11-11.
import { describe, expect, it } from "vitest";
import { BELOW_MY_COMMUNITY_ROOT, HERO_OF_MY_COMMUNITY, MY_OWN, ORG_WRITE_SCOPES } from "../../scripts/lib/org-write-scopes";

const MINE = { hoa_organizations: { id: { _in: "$CURRENT_USER.hoa_members.organization" } } };

describe("org write scopes", () => {
  it("a folder may be changed only below one of your community roots, never the root itself", () => {
    expect(BELOW_MY_COMMUNITY_ROOT).toEqual({
      _or: [
        { parent: MINE },
        { parent: { parent: MINE } },
        { parent: { parent: { parent: MINE } } },
        { parent: { parent: { parent: { parent: MINE } } } },
      ],
    });
    // No arm matches the folder itself being a root.
    expect(BELOW_MY_COMMUNITY_ROOT._or.some((arm) => "hoa_organizations" in arm)).toBe(false);
  });

  it("a hero only of your own community; dashboards and panels only your own", () => {
    expect(HERO_OF_MY_COMMUNITY).toEqual(MINE);
    expect(MY_OWN).toEqual({ user_created: { _eq: "$CURRENT_USER" } });
  });

  it("covers exactly the rights that were unrestricted, update and delete only", () => {
    const listed = Object.entries(ORG_WRITE_SCOPES).flatMap(([policy, cols]) =>
      Object.entries(cols).flatMap(([collection, actions]) => Object.keys(actions).map((action) => `${policy} ${collection} ${action}`))
    );
    expect(listed.sort()).toEqual(
      [
        "HOA Member directus_folders update", "HOA Member directus_folders delete",
        "HOA Member directus_dashboards update", "HOA Member directus_dashboards delete",
        "HOA Member directus_panels update", "HOA Member directus_panels delete",
        "HOA Admin directus_folders delete",
        "HOA Admin block_hero update", "HOA Admin block_hero delete",
        "HOA Admin directus_dashboards update", "HOA Admin directus_dashboards delete",
        "HOA Admin directus_panels update", "HOA Admin directus_panels delete",
      ].sort()
    );
  });

  it("never needs $CURRENT_USER.hoa_members.organization.folder (see folder-org-filters.ts)", () => {
    expect(JSON.stringify(ORG_WRITE_SCOPES)).not.toContain("organization.folder");
  });
});
