import { describe, it, expect } from "vitest";
import { trustSpecs } from "#core/server/utils/ai-trust-reads";

describe("trustSpecs", () => {
  const specs = trustSpecs("org-1", "user-1");

  it("reads the community's tier as getOrgAutonomyTier does", () => {
    expect(specs.tr_org).toEqual({
      collection: "hoa_organizations",
      filter: { id: { _eq: "org-1" } },
      fields: ["ai_autonomy_tier"],
      limit: 1,
    });
  });

  it("counts the caller's executed and rejected approvals in the community", () => {
    const filter = (status: string) => ({
      _and: [{ organization: { _eq: "org-1" } }, { approved_by: { _eq: "user-1" } }, { status: { _eq: status } }],
    });
    expect(specs.tr_approved).toEqual({ collection: "ai_actions", count: "*", filter: filter("executed") });
    expect(specs.tr_rejected).toEqual({ collection: "ai_actions", count: "*", filter: filter("rejected") });
  });
});
