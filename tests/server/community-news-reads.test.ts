/**
 * GET /api/hoa/community-news reads the community, the caller's membership
 * and the emails that reached it as one batch (community-news-reads.ts), then
 * the feed by the community's id as before. These pin the batch's filters
 * and the audience it yields, including when it must hand back to the
 * route's reads one by one.
 */
import { describe, it, expect } from "vitest";
import { communityNewsAudience, communityNewsSpecs } from "#core/server/utils/community-news-reads";

describe("communityNewsSpecs", () => {
  it("names the community by slug and the membership by caller", () => {
    const s = communityNewsSpecs("u1", "demo") as any;
    const org = { slug: { _eq: "demo" }, status: { _in: ["active", "published"] } };
    const member = { user: { _eq: "u1" }, organization: org, status: { _eq: "active" } };
    expect(s.cn_org).toEqual({ collection: "hoa_organizations", filter: org, fields: ["id"], limit: 2 });
    expect(s.cn_members).toEqual({ collection: "hoa_members", filter: member, fields: ["id"], limit: -1 });
    expect(s.cn_recipients).toEqual({ collection: "hoa_email_recipients", filter: { member }, fields: ["email"], limit: -1 });
  });
});

describe("communityNewsAudience", () => {
  const base = { cn_org: [{ id: "o" }], cn_members: [{ id: "m" }], cn_recipients: [] as any[] };

  it("is none without the community or a membership", () => {
    expect(communityNewsAudience({ ...base, cn_org: [] })).toBe("none");
    expect(communityNewsAudience({ ...base, cn_members: [] })).toBe("none");
  });

  it("hands back to the route for a shared slug or a second membership", () => {
    expect(communityNewsAudience({ ...base, cn_org: [{ id: "a" }, { id: "b" }] })).toBeNull();
    expect(communityNewsAudience({ ...base, cn_members: [{ id: "a" }, { id: "b" }] })).toBeNull();
  });

  it("collects the emails that reached the caller, once each", () => {
    const out = communityNewsAudience({
      ...base,
      cn_recipients: [{ email: "e2" }, { email: { id: "e3" } }, { email: null }, { email: "e2" }],
    });
    expect(out).toEqual({ orgId: "o", personalIds: ["e2", "e3"] });
  });
});
