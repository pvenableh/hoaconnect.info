/**
 * GET /api/org/projects and /projects-timeline read their lists in
 * the same request as the caller's access snapshot
 * (core/server/utils/project-reads.ts). The live equivalence with the old
 * reads was checked against every member and community; these pin the specs.
 */
import { describe, it, expect } from "vitest";
import {
  PROJECT_LIST_FIELDS,
  projectListSpecs,
  projectTimelineSpecs,
} from "#core/server/utils/project-reads";

const ORG = "org-1";

describe("projectListSpecs", () => {
  it("reads every project and the member-visible ones with the same filters", () => {
    const s = projectListSpecs(ORG, { status: "active", team: "t-1", parent: "p-1" });
    const base = { organization: { _eq: ORG }, status: { _eq: "active" }, team: { _eq: "t-1" }, parent_project: { _eq: "p-1" } };
    expect(s.pr_all.filter).toEqual(base);
    expect(s.pr_visible.filter).toEqual({ ...base, member_visible: { _eq: true } });
  });

  it("parent=none is top-level only; no query reads the whole community", () => {
    expect(projectListSpecs(ORG, { parent: "none" }).pr_all.filter).toEqual({ organization: { _eq: ORG }, parent_project: { _null: true } });
    expect(projectListSpecs(ORG, {}).pr_all.filter).toEqual({ organization: { _eq: ORG } });
  });

  it("keeps the old read's fields, sort and limit", () => {
    const s = projectListSpecs(ORG, {});
    expect([s.pr_all.sort, s.pr_all.limit]).toEqual([["sort", "-date_updated"], 200]);
    expect(s.pr_all.fields).toBe(PROJECT_LIST_FIELDS);
    expect(PROJECT_LIST_FIELDS).toContain("assigned_to.directus_users_id.avatar");
    expect(PROJECT_LIST_FIELDS).toContain("budget_amount");
  });
});

describe("projectTimelineSpecs", () => {
  it("reads every project and the member-visible ones", () => {
    const s = projectTimelineSpecs(ORG);
    expect(s.pr_all.filter).toEqual({ organization: { _eq: ORG } });
    expect(s.pr_visible.filter).toEqual({ organization: { _eq: ORG }, member_visible: { _eq: true } });
    expect([s.pr_all.sort, s.pr_all.limit]).toEqual([["sort", "start_date"], 300]);
  });
});
