/**
 * GET /api/org/projects, /projects-timeline and /tasks read their lists in
 * the same request as the caller's access snapshot
 * (core/server/utils/project-reads.ts). The live equivalence with the old
 * reads was checked against every member and community; these pin the specs.
 */
import { describe, it, expect } from "vitest";
import {
  PROJECT_LIST_FIELDS,
  projectListSpecs,
  projectTimelineSpecs,
  taskListSpecs,
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

describe("taskListSpecs", () => {
  it("scopes to the caller's own tasks with assignee=me, with no member-visible read", () => {
    const s = taskListSpecs(ORG, { assignee: "me", project: "p-1" }, "u-1");
    expect(s.tk_all.filter).toEqual({
      organization: { _eq: ORG },
      project: { _eq: "p-1" },
      assigned_to: { directus_users_id: { _eq: "u-1" } },
    });
    expect(s.tk_visible).toBeUndefined();
  });

  it("a project scope also reads the tasks of that project only while it is member-visible", () => {
    const s = taskListSpecs(ORG, { project: "p-1", schedule: "today" }, "u-1");
    expect(s.tk_all.filter).toEqual({ organization: { _eq: ORG }, project: { _eq: "p-1" }, schedule: { _eq: "today" } });
    expect(s.tk_visible!.filter).toEqual({
      organization: { _eq: ORG },
      project: { id: { _eq: "p-1" }, member_visible: { _eq: true } },
      schedule: { _eq: "today" },
    });
  });

  it("without a project or assignee scope, only the elevated read", () => {
    const s = taskListSpecs(ORG, { event: "e-1", request: "r-1", team: "t-1", parent: "none" }, "u-1");
    expect(s.tk_all.filter).toEqual({
      organization: { _eq: ORG },
      project_event: { _eq: "e-1" },
      request: { _eq: "r-1" },
      team: { _eq: "t-1" },
      parent_task: { _null: true },
    });
    expect(s.tk_visible).toBeUndefined();
    expect([s.tk_all.sort, s.tk_all.limit]).toEqual([["sort", "-date_created"], 300]);
  });
});
