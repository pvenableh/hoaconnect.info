import { describe, it, expect } from "vitest";
import {
  SEARCH_GROUPS,
  searchGroupsFor,
  normalizeQuery,
  buildSearchFilter,
  MAX_QUERY,
} from "#core/shared/search";

const keys = (actors: any[]) => searchGroupsFor(actors).map((g) => g.key);

describe("Spotlight search — who may search what", () => {
  it("a plain member searches no records (destinations only, client-side)", () => {
    expect(keys(["member"])).toEqual([]);
    expect(keys(["member", "team_lead"])).toEqual([]);
  });

  it("an admin searches every group", () => {
    expect(keys(["admin"])).toEqual(SEARCH_GROUPS.map((g) => g.key));
  });

  it("a board member gets the directory and records but not admin-only channels", () => {
    const k = keys(["member", "board_member"]);
    expect(k).toEqual(expect.arrayContaining(["members", "units", "documents", "requests", "projects"]));
    expect(k).not.toContain("channels");
  });

  it("a property manager gets the directory but not admin-only channels", () => {
    const k = keys(["property_manager"]);
    expect(k).toContain("members");
    expect(k).not.toContain("channels");
  });
});

describe("Spotlight search — query and filter", () => {
  it("drops queries shorter than two characters and bounds long ones", () => {
    expect(normalizeQuery("a")).toBeNull();
    expect(normalizeQuery("  ")).toBeNull();
    expect(normalizeQuery(undefined)).toBeNull();
    expect(normalizeQuery("  dana ")).toBe("dana");
    expect(normalizeQuery("x".repeat(500))!.length).toBe(MAX_QUERY);
  });

  it("every group's filter is scoped to the org — the one guard on the admin-token query", () => {
    for (const g of SEARCH_GROUPS) {
      const f = buildSearchFilter(g, "org-1", "dana");
      expect(f._and[0]).toEqual({ organization: { _eq: "org-1" } });
      expect(f._and[1]._or.length).toBe(g.searchFields.length);
    }
  });

  it("member hits deep-link to the members page with the member to open", () => {
    const members = SEARCH_GROUPS.find((g) => g.key === "members")!;
    const hit = members.toHit({ id: 7, first_name: "Dana", last_name: "Whitfield", email: "d@x.org", member_type: "owner" });
    expect(hit).toEqual({ id: "7", name: "Dana Whitfield", description: "d@x.org · owner", to: "/admin/members?member=7" });
  });
});
