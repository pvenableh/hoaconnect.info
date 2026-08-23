/**
 * Deleting a project takes its tasks with it, and the ORDER it does that in is
 * the safety property.
 *
 * `hoa_tasks.project` and `hoa_tasks.project_event` are both ON DELETE SET
 * NULL, so the database's answer to "what happens to the tasks" is "they stay,
 * pointing at nothing" — while the confirm dialog told the admin they'd gone.
 * The handler decides instead, and these tests pin the three decisions that
 * aren't obvious from reading it:
 *
 *   · phases are read BEFORE the delete, or a phase-only task is unfindable
 *   · the project goes BEFORE the tasks, so a failed sweep leaves orphans
 *     (recoverable) rather than a live project stripped of its task list
 *   · a task that also serves a request is spared, which is the one thing an
 *     ON DELETE CASCADE in the schema could never have expressed
 *
 * The Directus SDK is mocked down to plain description objects so every read
 * and write is inspectable in sequence.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@directus/sdk", () => ({
  readItems: (collection: string, query: unknown) => ({ op: "read", collection, query }),
  deleteItem: (collection: string, id: string) => ({ op: "deleteOne", collection, id }),
  deleteItems: (collection: string, keys: string[]) => ({ op: "deleteMany", collection, keys }),
  updateItems: (collection: string, keys: string[], payload: unknown) => ({
    op: "updateMany",
    collection,
    keys,
    payload,
  }),
}));

type Op = { op: string; collection: string; id?: string; keys?: string[]; payload?: any; query?: any };

const ORG = "org-1";
const PROJECT = "proj-1";

let ops: Op[];
let eventRows: any[];
let taskRows: any[];
let failTaskWrites: boolean;
let errors: unknown[][];

/** Load a route handler with `defineEventHandler` stubbed to identity. */
async function loadHandler(path: string): Promise<(event: any) => Promise<any>> {
  const mod = await import(path);
  return mod.default as any;
}

beforeEach(() => {
  vi.resetModules();
  ops = [];
  eventRows = [];
  taskRows = [];
  failTaskWrites = false;
  errors = [];

  vi.stubGlobal("defineEventHandler", (fn: any) => fn);
  vi.stubGlobal("getRouterParam", (_e: any, _k: string) => (_e?.__id ?? PROJECT));
  vi.stubGlobal("getQuery", (e: any) => ({ orgId: e?.__orgId ?? ORG }));
  vi.stubGlobal("getProjectMeta", async () => ({ organization: ORG, team: "team-1" }));
  vi.stubGlobal("requireProjectsWrite", async () => ({ userId: "user-1" }));
  vi.stubGlobal("getTypedDirectus", () => ({
    request: async (desc: Op) => {
      ops.push(desc);
      if (desc.op === "read" && desc.collection === "hoa_project_events") return eventRows;
      if (desc.op === "read" && desc.collection === "hoa_tasks") return taskRows;
      if (desc.collection === "hoa_tasks" && desc.op !== "read" && failTaskWrites) {
        throw new Error("directus said no");
      }
      return { ok: true };
    },
  }));
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    errors.push(args);
  });
});

const names = () => ops.map((o) => `${o.op}:${o.collection}`);

describe("deleting a project", () => {
  it("reads the phases before deleting anything", async () => {
    // A task attached only to a phase is unfindable the moment the phase
    // cascades away with the project, so the ids have to be taken first.
    eventRows = [{ id: "ev-1" }];
    taskRows = [{ id: "task-1", request: null }];

    const handler = await loadHandler("#core/server/api/org/projects/[id].delete");
    await handler({});

    expect(names()).toEqual([
      "read:hoa_project_events",
      "read:hoa_tasks",
      "deleteOne:hoa_projects",
      "deleteMany:hoa_tasks",
    ]);
  });

  it("looks for tasks on the project AND on any of its phases", async () => {
    eventRows = [{ id: "ev-1" }, { id: "ev-2" }];
    const handler = await loadHandler("#core/server/api/org/projects/[id].delete");
    await handler({});

    const taskRead = ops.find((o) => o.op === "read" && o.collection === "hoa_tasks")!;
    expect(taskRead.query.filter._or).toEqual([
      { project: { _eq: PROJECT } },
      { project_event: { _in: ["ev-1", "ev-2"] } },
    ]);
  });

  it("omits the phase clause entirely when the project has no phases", async () => {
    // `project_event: { _in: [] }` is not the same question, and asking it
    // would be a filter that can never match dressed up as one that could.
    eventRows = [];
    const handler = await loadHandler("#core/server/api/org/projects/[id].delete");
    await handler({});

    const taskRead = ops.find((o) => o.op === "read" && o.collection === "hoa_tasks")!;
    expect(taskRead.query.filter._or).toEqual([{ project: { _eq: PROJECT } }]);
  });

  it("deletes the project's tasks and spares the ones a request still needs", async () => {
    taskRows = [
      { id: "plain", request: null },
      { id: "on-request", request: "req-1" },
      { id: "on-request-expanded", request: { id: "req-2" } },
      { id: "phase-only", request: null },
    ];

    const handler = await loadHandler("#core/server/api/org/projects/[id].delete");
    const res = await handler({});

    const del = ops.find((o) => o.op === "deleteMany")!;
    expect(del.keys).toEqual(["plain", "phase-only"]);
    expect(res).toEqual({ ok: true, tasksRemoved: 2, tasksKept: 2 });
  });

  it("corrects the category on a spared task, which no longer has a project", async () => {
    taskRows = [{ id: "on-request", request: "req-1" }];
    const handler = await loadHandler("#core/server/api/org/projects/[id].delete");
    await handler({});

    const patch = ops.find((o) => o.op === "updateMany")!;
    expect(patch.collection).toBe("hoa_tasks");
    expect(patch.keys).toEqual(["on-request"]);
    expect(patch.payload).toEqual({ category: "request" });
  });

  it("writes nothing to hoa_tasks when the project had none", async () => {
    taskRows = [];
    const handler = await loadHandler("#core/server/api/org/projects/[id].delete");
    const res = await handler({});

    expect(names()).toEqual([
      "read:hoa_project_events",
      "read:hoa_tasks",
      "deleteOne:hoa_projects",
    ]);
    expect(res).toEqual({ ok: true, tasksRemoved: 0, tasksKept: 0 });
  });

  it("still reports success when the task sweep fails after the project is gone", async () => {
    // The project IS deleted — the caller got what they asked for, and a
    // failure response would be the lie. The residue is the orphan state this
    // handler replaced, and it goes to the log instead.
    taskRows = [{ id: "plain", request: null }];
    failTaskWrites = true;

    const handler = await loadHandler("#core/server/api/org/projects/[id].delete");
    const res = await handler({});

    expect(ops.some((o) => o.op === "deleteOne" && o.collection === "hoa_projects")).toBe(true);
    expect(res.ok).toBe(true);
    expect(res.tasksRemoved).toBe(0);
    expect(errors).toHaveLength(1);
  });

  it("refuses a project belonging to another community", async () => {
    vi.stubGlobal("getProjectMeta", async () => ({ organization: "someone-else", team: null }));
    const handler = await loadHandler("#core/server/api/org/projects/[id].delete");

    await expect(handler({})).rejects.toMatchObject({ statusCode: 404 });
    expect(ops).toHaveLength(0);
  });
});

describe("deleting one phase", () => {
  beforeEach(() => {
    vi.stubGlobal("getTypedDirectus", () => ({
      request: async (desc: Op) => {
        ops.push(desc);
        if (desc.op === "read" && desc.collection === "hoa_project_events") {
          return [{ id: "ev-1", organization: ORG, project: { id: PROJECT, team: "team-1" } }];
        }
        if (desc.op === "read" && desc.collection === "hoa_tasks") return taskRows;
        return { ok: true };
      },
    }));
  });

  it("rehomes a phase-only task to the project BEFORE the phase disappears", async () => {
    // Patching after the delete is impossible: project_event is SET NULL, so
    // there would be nothing left to find the task by.
    taskRows = [{ id: "phase-only" }];
    const handler = await loadHandler("#core/server/api/org/project-events/[id].delete");
    await handler({ __id: "ev-1" });

    expect(names()).toEqual([
      "read:hoa_project_events",
      "read:hoa_tasks",
      "updateMany:hoa_tasks",
      "deleteOne:hoa_project_events",
    ]);
    const patch = ops.find((o) => o.op === "updateMany")!;
    expect(patch.payload).toEqual({ project: PROJECT, category: "project" });
  });

  it("only looks at tasks that have no project of their own", async () => {
    // A task that also names the project needs nothing done — the schema
    // nulls project_event and it simply stops being tied to the phase.
    taskRows = [];
    const handler = await loadHandler("#core/server/api/org/project-events/[id].delete");
    await handler({ __id: "ev-1" });

    const read = ops.find((o) => o.op === "read" && o.collection === "hoa_tasks")!;
    expect(read.query.filter).toEqual({
      organization: { _eq: ORG },
      project_event: { _eq: "ev-1" },
      project: { _null: true },
    });
    expect(names()).not.toContain("updateMany:hoa_tasks");
  });

  it("never deletes a task along with the phase", async () => {
    taskRows = [{ id: "phase-only" }];
    const handler = await loadHandler("#core/server/api/org/project-events/[id].delete");
    await handler({ __id: "ev-1" });

    expect(ops.some((o) => o.collection === "hoa_tasks" && o.op.startsWith("delete"))).toBe(false);
  });
});
