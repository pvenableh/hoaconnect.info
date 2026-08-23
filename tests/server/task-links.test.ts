/**
 * A task's links are only as trustworthy as the check on the way in.
 *
 * The row is written with the CALLER's organization id while `project`,
 * `project_event`, `request`, `team`, `parent_task` and `assigned_to` all
 * arrived in the request body. `GET /api/org/tasks` then expands those into
 * titles, so an id belonging to another community comes straight back out as
 * that community's project or request name inside a list the caller is
 * entitled to read. These pin that every one of them is resolved and
 * org-checked first, and that the team the write check runs against is taken
 * from the strongest link rather than from whatever the body claimed.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@directus/sdk", () => ({
  readItems: (collection: string, query: unknown) => ({ op: "read", collection, query }),
}));

const ORG = "org-1";
const OTHER = "org-2";

type Read = { op: string; collection: string; query: any };

let reads: Read[];
/** collection → rows the stubbed Directus returns for a read. */
let rows: Record<string, any[]>;

beforeEach(() => {
  vi.resetModules();
  reads = [];
  rows = {};

  vi.stubGlobal("getTypedDirectus", () => ({
    request: async (desc: Read) => {
      reads.push(desc);
      return rows[desc.collection] ?? [];
    },
  }));
  vi.stubGlobal("getProjectMeta", async (id: string) => {
    const r = (rows["hoa_projects"] || []).find((p) => p.id === id);
    if (!r) throw Object.assign(new Error("Project not found"), { statusCode: 404 });
    return { id: r.id, organization: r.organization, team: r.team ?? null, member_visible: true };
  });
});

const load = async () => (await import("#core/server/utils/task-links")).resolveTaskLinks;

describe("links belonging to another community are rejected", () => {
  it("404s a project from another org", async () => {
    rows["hoa_projects"] = [{ id: "p-x", organization: OTHER, team: null }];
    const resolveTaskLinks = await load();
    await expect(resolveTaskLinks(ORG, { project: "p-x" })).rejects.toMatchObject({ statusCode: 404 });
  });

  it("404s a phase from another org", async () => {
    rows["hoa_project_events"] = [{ id: "ev-x", organization: OTHER, project: { id: "p", team: "t" } }];
    const resolveTaskLinks = await load();
    await expect(resolveTaskLinks(ORG, { project_event: "ev-x" })).rejects.toMatchObject({ statusCode: 404 });
  });

  it("404s a request from another org — the leak this closes", async () => {
    // GET expands `request: ["id", "title"]`, so storing this id would read
    // the other community's request title back out of our own task list.
    rows["hoa_requests"] = [{ id: "req-x", organization: OTHER }];
    const resolveTaskLinks = await load();
    await expect(resolveTaskLinks(ORG, { request: "req-x" })).rejects.toMatchObject({ statusCode: 404 });
  });

  it("404s a team from another org", async () => {
    rows["hoa_teams"] = [{ id: "team-x", organization: OTHER }];
    const resolveTaskLinks = await load();
    await expect(resolveTaskLinks(ORG, { team: "team-x" })).rejects.toMatchObject({ statusCode: 404 });
  });

  it("404s a parent task from another org", async () => {
    rows["hoa_tasks"] = [{ id: "t-x", organization: OTHER }];
    const resolveTaskLinks = await load();
    await expect(resolveTaskLinks(ORG, { parent_task: "t-x" })).rejects.toMatchObject({ statusCode: 404 });
  });

  it("404s an id that does not exist at all", async () => {
    rows["hoa_requests"] = [];
    const resolveTaskLinks = await load();
    await expect(resolveTaskLinks(ORG, { request: "nope" })).rejects.toMatchObject({ statusCode: 404 });
  });

  it("accepts links that do belong to the org", async () => {
    rows["hoa_projects"] = [{ id: "p-1", organization: ORG, team: "team-1" }];
    rows["hoa_requests"] = [{ id: "req-1", organization: ORG }];
    rows["hoa_tasks"] = [{ id: "t-1", organization: ORG }];
    const resolveTaskLinks = await load();
    await expect(
      resolveTaskLinks(ORG, { project: "p-1", request: "req-1", parent_task: "t-1" })
    ).resolves.toEqual({ teamId: "team-1", linkedToProject: true });
  });

  it("reads nothing when no links are named", async () => {
    const resolveTaskLinks = await load();
    await expect(resolveTaskLinks(ORG, {})).resolves.toEqual({ teamId: null, linkedToProject: false });
    expect(reads).toHaveLength(0);
  });
});

describe("which team the write check gets", () => {
  it("prefers the project's own team over one named in the body", async () => {
    // requireProjectsWrite lets a team LEAD through for their own team. Taking
    // the team from the body would let a lead name their own team to authorise
    // a write against somebody else's project.
    rows["hoa_projects"] = [{ id: "p-1", organization: ORG, team: "owning-team" }];
    rows["hoa_teams"] = [{ id: "my-team", organization: ORG }];
    const resolveTaskLinks = await load();
    const res = await resolveTaskLinks(ORG, { project: "p-1", team: "my-team" });
    expect(res.teamId).toBe("owning-team");
  });

  it("falls back to the phase's project team when no project is named", async () => {
    rows["hoa_project_events"] = [
      { id: "ev-1", organization: ORG, project: { id: "p-1", team: "phase-team" } },
    ];
    rows["hoa_teams"] = [{ id: "my-team", organization: ORG }];
    const resolveTaskLinks = await load();
    const res = await resolveTaskLinks(ORG, { project_event: "ev-1", team: "my-team" });
    expect(res.teamId).toBe("phase-team");
  });

  it("uses the body's team only when nothing stronger is named", async () => {
    rows["hoa_teams"] = [{ id: "my-team", organization: ORG }];
    const resolveTaskLinks = await load();
    const res = await resolveTaskLinks(ORG, { team: "my-team" });
    expect(res).toEqual({ teamId: "my-team", linkedToProject: false });
  });

  it("a phase whose project has no team resolves to no team, not to the body's", async () => {
    rows["hoa_project_events"] = [{ id: "ev-1", organization: ORG, project: { id: "p-1", team: null } }];
    rows["hoa_teams"] = [{ id: "my-team", organization: ORG }];
    const resolveTaskLinks = await load();
    const res = await resolveTaskLinks(ORG, { project_event: "ev-1", team: "my-team" });
    // null means "org-wide project write only" — the strict direction.
    expect(res.teamId).toBeNull();
  });
});

describe("assignees", () => {
  it("rejects a user with no membership in this community", async () => {
    // Assignment is not a quiet field: it writes a bell row, may push, and
    // emails the person with this community's branding on it.
    rows["hoa_members"] = [{ user: "user-1" }];
    const resolveTaskLinks = await load();
    await expect(
      resolveTaskLinks(ORG, { assigned_to: ["user-1", "stranger"] })
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("accepts users who are members, whatever their membership status", async () => {
    // Deliberately not active-only: this check is about which community
    // someone belongs to, and tightening it would make an unrelated edit fail
    // whenever a task still names someone since deactivated.
    rows["hoa_members"] = [{ user: "user-1" }, { user: { id: "user-2" } }];
    const resolveTaskLinks = await load();
    await expect(resolveTaskLinks(ORG, { assigned_to: ["user-1", "user-2"] })).resolves.toBeTruthy();
  });

  it("scopes the membership lookup to the org and the ids asked for", async () => {
    rows["hoa_members"] = [{ user: "user-1" }];
    const resolveTaskLinks = await load();
    await resolveTaskLinks(ORG, { assigned_to: ["user-1", "user-1"] });
    const read = reads.find((r) => r.collection === "hoa_members")!;
    expect(read.query.filter).toEqual({
      organization: { _eq: ORG },
      user: { _in: ["user-1"] },
    });
  });

  it("skips the lookup for an empty assignee list", async () => {
    const resolveTaskLinks = await load();
    await resolveTaskLinks(ORG, { assigned_to: [] });
    expect(reads).toHaveLength(0);
  });
});
