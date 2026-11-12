/**
 * The project, phase and task-order routes check the CALLER against the org
 * correctly, and then used to write relation ids straight out of the request
 * body. Every one of those ids is expanded on the way back out —
 * `GET /api/org/projects/:id` reads the parent project's and phase's titles,
 * the team, the vendors and each assignee's name and email — so an id that
 * belongs to another community was a read of that community's rows, and put
 * this community's row inside the other one's children / subtasks lists.
 *
 * task-links.ts already closed this for tasks. These pin that the same check
 * (`requireInOrg`, `requireOrgMembers`, a 404 either way) now runs on:
 *
 *   · POST  /api/org/projects                 team, parent_project, parent_event, assigned_to
 *   · PATCH /api/org/projects/:id             the same, plus vendors
 *   · POST  /api/org/projects/:id/events      depends_on, assigned_to
 *   · PATCH /api/org/project-events/:id       depends_on, assigned_to
 *   · POST  /api/org/requests/:id/promote     team
 *   · POST  /api/org/tasks/reorder            parent_task
 *
 * and that it runs BEFORE any write — a refused call records no create/update.
 * The Directus SDK is mocked down to description objects over a tiny two-org
 * table set, and the real task-links helpers are installed as the auto-imports
 * the routes call, so it is the real check being exercised.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@directus/sdk", () => ({
  readItems: (collection: string, query: any) => ({ op: "read", collection, query }),
  createItem: (collection: string, payload: any) => ({ op: "create", collection, payload }),
  createItems: (collection: string, payload: any) => ({ op: "createMany", collection, payload }),
  updateItem: (collection: string, id: string, payload: any) => ({ op: "update", collection, id, payload }),
}));

vi.stubGlobal("defineEventHandler", (fn: unknown) => fn);

type Op = { op: string; collection: string; id?: string; payload?: any; query?: any };
type Handler = (event: any) => Promise<any>;

const ORG = "org-a";
const OTHER = "org-b";

/** Two communities' worth of rows. Anything `-b` belongs to the other one. */
const DB: Record<string, any[]> = {
  hoa_teams: [
    { id: "team-a", organization: ORG },
    { id: "team-b", organization: OTHER },
  ],
  hoa_projects: [
    { id: "proj-a", organization: ORG, team: "team-a" },
    { id: "proj-a2", organization: ORG, team: null },
    { id: "proj-b", organization: OTHER, team: "team-b" },
  ],
  hoa_project_events: [
    { id: "ev-a", organization: ORG, event_date: null, duration_days: null, project: { id: "proj-a", team: "team-a" } },
    { id: "ev-a2", organization: ORG, event_date: null, duration_days: null, project: { id: "proj-a", team: "team-a" } },
    { id: "ev-b", organization: OTHER, event_date: null, duration_days: null, project: { id: "proj-b", team: "team-b" } },
  ],
  hoa_vendors: [
    { id: "ven-a", organization: ORG },
    { id: "ven-b", organization: OTHER },
  ],
  hoa_tasks: [
    { id: "task-a", organization: ORG, project: { team: "team-a" } },
    { id: "task-a2", organization: ORG, project: { team: "team-a" } },
    { id: "task-b", organization: OTHER, project: { team: "team-b" } },
  ],
  hoa_members: [
    { user: "user-a", organization: ORG },
    { user: "user-b", organization: OTHER },
  ],
  hoa_requests: [
    { id: "req-a", organization: ORG, title: "Fix the gate", description: null, project: null, assigned_to: null },
  ],
};

/** Just enough of Directus's filter language for the reads these routes make. */
function matches(row: any, filter: Record<string, any> | undefined): boolean {
  return Object.entries(filter ?? {}).every(([field, cond]) => {
    const raw = row[field];
    const v = raw && typeof raw === "object" ? raw.id : raw;
    if ("_eq" in cond) return v === cond._eq;
    if ("_in" in cond) return cond._in.includes(v);
    return false;
  });
}

let ops: Op[];
const writes = () => ops.filter((o) => o.op !== "read");
const readsOf = (collection: string) => ops.filter((o) => o.op === "read" && o.collection === collection);

const ACCESS = { userId: "user-a", canWriteAll: true, elevated: true, leadTeamIds: [], teamIds: [] };

beforeEach(() => {
  ops = [];
  vi.stubGlobal("readBody", async (e: any) => e.body);
  vi.stubGlobal("getRouterParam", (e: any, key: string) => e.params?.[key]);
  vi.stubGlobal("getProjectAccess", async () => ACCESS);
  vi.stubGlobal("requireProjectsWrite", async () => ACCESS);
  vi.stubGlobal("requireAdminOrManagerGrant", async () => ({ userId: "user-a" }));
  vi.stubGlobal("getProjectMeta", async (id: string) => {
    const p = DB.hoa_projects!.find((r) => r.id === id);
    if (!p) throw Object.assign(new Error("Project not found"), { statusCode: 404 });
    return { id: p.id, organization: p.organization, team: p.team, member_visible: true };
  });
  vi.stubGlobal("getTypedDirectus", () => ({
    request: async (d: Op) => {
      ops.push(d);
      if (d.op === "read") return (DB[d.collection] ?? []).filter((r) => matches(r, d.query?.filter));
      if (d.op === "create") return { id: `new-${d.collection}`, ...d.payload };
      return { id: d.id, ...d.payload };
    },
  }));
});

// The real checks, installed as the auto-imports the routes call.
const links = await import("#core/server/utils/task-links");
vi.stubGlobal("requireInOrg", links.requireInOrg);
vi.stubGlobal("requireOrgMembers", links.requireOrgMembers);

const load = async (path: string) => (await import(path)).default as Handler;
const createProject = await load("#core/server/api/org/projects/index.post");
const patchProject = await load("#core/server/api/org/projects/[id].patch");
const createEvent = await load("#core/server/api/org/projects/[id]/events.post");
const patchEvent = await load("#core/server/api/org/project-events/[id].patch");
const promote = await load("#core/server/api/org/requests/[id]/promote.post");
const reorder = await load("#core/server/api/org/tasks/reorder.post");

/** Refused with the task-links 404, and nothing written. */
async function expectRefused(run: Promise<unknown>) {
  await expect(run).rejects.toMatchObject({ statusCode: 404 });
  expect(writes()).toEqual([]);
}

describe("POST /api/org/projects", () => {
  const call = (extra: Record<string, unknown>) =>
    createProject({ body: { orgId: ORG, title: "Repave", ...extra } });

  it.each([
    ["team", { team: "team-b" }],
    ["parent_project", { parent_project: "proj-b" }],
    ["parent_event", { parent_event: "ev-b" }],
    ["assigned_to", { assigned_to: ["user-a", "user-b"] }],
  ])("refuses another community's %s before creating anything", async (_f, extra) => {
    await expectRefused(call(extra));
  });

  it("refuses an object in place of an id (Directus would read it as a nested write)", async () => {
    await expectRefused(call({ parent_project: { id: "proj-b", title: "renamed" } }));
  });

  it("creates with this community's own links", async () => {
    await call({ team: "team-a", parent_project: "proj-a", parent_event: "ev-a", assigned_to: ["user-a"] });
    const [w] = writes();
    expect(w).toMatchObject({ op: "create", collection: "hoa_projects" });
    expect(w!.payload).toMatchObject({
      organization: ORG,
      team: "team-a",
      parent_project: "proj-a",
      parent_event: "ev-a",
      assigned_to: [{ directus_users_id: "user-a" }],
    });
  });

  it("creates with no links and reads nothing to check them", async () => {
    await call({});
    expect(writes()).toHaveLength(1);
    expect(ops.filter((o) => o.op === "read")).toEqual([]);
  });
});

describe("PATCH /api/org/projects/:id", () => {
  const call = (extra: Record<string, unknown>) =>
    patchProject({ params: { id: "proj-a" }, body: { orgId: ORG, ...extra } });

  it.each([
    ["team", { team: "team-b" }],
    ["parent_project", { parent_project: "proj-b" }],
    ["parent_event", { parent_event: "ev-b" }],
    ["assigned_to", { assigned_to: ["user-b"] }],
    ["vendors", { vendors: [{ vendor: "ven-a" }, { vendor: "ven-b", role: "paving" }] }],
    ["vendors (hoa_vendors_id spelling)", { vendors: [{ hoa_vendors_id: "ven-b" }] }],
  ])("refuses another community's %s before updating anything", async (_f, extra) => {
    await expectRefused(call(extra));
  });

  it("updates with this community's own links", async () => {
    await call({
      team: "team-a",
      parent_project: "proj-a2",
      parent_event: "ev-a",
      assigned_to: ["user-a"],
      vendors: [{ vendor: "ven-a", role: "paving" }],
    });
    const [w] = writes();
    expect(w).toMatchObject({ op: "update", collection: "hoa_projects", id: "proj-a" });
    expect(w!.payload).toMatchObject({
      team: "team-a",
      parent_project: "proj-a2",
      parent_event: "ev-a",
      assigned_to: [{ directus_users_id: "user-a" }],
      vendors: [{ hoa_vendors_id: "ven-a", role: "paving" }],
    });
  });

  it("still clears every link with null / empty, without checking anything", async () => {
    await call({ team: null, parent_project: null, parent_event: null, assigned_to: [], vendors: [] });
    expect(writes()[0]!.payload).toEqual({
      team: null,
      parent_project: null,
      parent_event: null,
      assigned_to: [],
      vendors: [],
    });
    for (const c of ["hoa_teams", "hoa_projects", "hoa_project_events", "hoa_vendors", "hoa_members"]) {
      expect(readsOf(c)).toEqual([]);
    }
  });
});

describe("POST /api/org/projects/:id/events", () => {
  const call = (extra: Record<string, unknown>) =>
    createEvent({ params: { id: "proj-a" }, body: { orgId: ORG, title: "Pour", ...extra } });

  it.each([
    ["depends_on", { depends_on: "ev-b" }],
    ["assigned_to", { assigned_to: "user-b" }],
  ])("refuses another community's %s before creating anything", async (_f, extra) => {
    await expectRefused(call(extra));
  });

  it("creates with this community's own links", async () => {
    await call({ depends_on: "ev-a", assigned_to: "user-a" });
    const [w] = writes();
    expect(w).toMatchObject({ op: "create", collection: "hoa_project_events" });
    expect(w!.payload).toMatchObject({ project: "proj-a", organization: ORG, depends_on: "ev-a", assigned_to: "user-a" });
  });
});

describe("PATCH /api/org/project-events/:id", () => {
  const call = (extra: Record<string, unknown>) =>
    patchEvent({ params: { id: "ev-a" }, body: { orgId: ORG, ...extra } });

  it.each([
    ["depends_on", { depends_on: "ev-b" }],
    ["assigned_to", { assigned_to: "user-b" }],
  ])("refuses another community's %s before updating anything", async (_f, extra) => {
    await expectRefused(call(extra));
  });

  it("updates with this community's own links", async () => {
    await call({ depends_on: "ev-a2", assigned_to: "user-a" });
    expect(writes()).toEqual([
      expect.objectContaining({ op: "update", collection: "hoa_project_events", id: "ev-a", payload: { depends_on: "ev-a2", assigned_to: "user-a" } }),
    ]);
  });

  it("still clears both links with null", async () => {
    await call({ depends_on: null, assigned_to: null });
    expect(writes()[0]!.payload).toEqual({ depends_on: null, assigned_to: null });
    expect(readsOf("hoa_members")).toEqual([]);
  });
});

describe("POST /api/org/requests/:id/promote", () => {
  const call = (extra: Record<string, unknown>) =>
    promote({ params: { id: "req-a" }, body: { orgId: ORG, ...extra } });

  it("refuses another community's team before creating the project or touching the request", async () => {
    await expectRefused(call({ team: "team-b" }));
  });

  it("promotes with this community's own team", async () => {
    const res = await call({ team: "team-a" });
    expect(res.ok).toBe(true);
    expect(writes()[0]).toMatchObject({ op: "create", collection: "hoa_projects", payload: { team: "team-a", organization: ORG } });
  });
});

describe("POST /api/org/tasks/reorder", () => {
  const call = (items: Record<string, unknown>[]) => reorder({ body: { orgId: ORG, items } });

  it("refuses another community's parent_task before moving any task", async () => {
    // The first item is harmless on its own — the refusal must still come
    // before it is written, so a bad id in a batch moves nothing.
    await expectRefused(
      call([
        { id: "task-a2", sort: 1 },
        { id: "task-a", sort: 2, parent_task: "task-b" },
      ])
    );
  });

  it("moves under a parent from this community, and still clears with null", async () => {
    const res = await call([
      { id: "task-a2", sort: 1, parent_task: "task-a" },
      { id: "task-a", sort: 2, parent_task: null },
    ]);
    expect(res).toEqual({ ok: true, updated: 2 });
    expect(writes().map((w) => [w.id, w.payload.parent_task])).toEqual([
      ["task-a2", "task-a"],
      ["task-a", null],
    ]);
  });
});
