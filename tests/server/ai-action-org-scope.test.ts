/**
 * The ids INSIDE an AI action's payload stay inside the action's community.
 *
 * The routes check the caller against the action row's org, and that is
 * necessary but not enough: the payload is not trusted. The model writes it,
 * and `POST /api/ai/actions/:id/edit` lets the caller replace it wholesale. The
 * executors then run with the admin token, so a project, request, member or
 * comment target named in the payload is the executor's to check — nothing
 * downstream will. Until 2026-11-12 five executors wrote those ids as given,
 * which let an admin of one community attach tasks and notes to another's
 * records, open requests against another's members, and read the full name of
 * any platform user by guessing their email.
 *
 * Each executor below is approved through the real approve route and the real
 * `decideAiAction`: a foreign id is refused with nothing written, and the same
 * action pointed at the community's own record still lands.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@directus/sdk", () => ({
  readItem: (collection: string, id: string, query?: unknown) => ({ op: "readOne", collection, id, query }),
  readItems: (collection: string, query?: unknown) => ({ op: "read", collection, query }),
  readUsers: (query?: unknown) => ({ op: "read", collection: "directus_users", query }),
  createItem: (collection: string, payload: unknown) => ({ op: "create", collection, payload }),
  updateItem: (collection: string, id: string, payload: unknown) => ({ op: "updateOne", collection, id, payload }),
  deleteItem: (collection: string, id: string) => ({ op: "delete", collection, id }),
}));

const HOME = "org-home";
const OTHER = "org-other";
const ME = "user-me";
const OUTSIDER = "user-outsider";
const OUTSIDER_EMAIL = "olive@elsewhere.example";

type Op = { op: string; collection: string; [k: string]: any };

let ops: Op[];
let rows: Record<string, any[]>;
let seq: number;

/** M2O fields the mock expands, so a relational filter (`user.email`) can match. */
const RELATIONS: Record<string, Record<string, string>> = {
  hoa_members: { user: "directus_users" },
};

function expand(collection: string, row: any): any {
  const rel = RELATIONS[collection];
  if (!rel) return row;
  const out = { ...row };
  for (const [field, target] of Object.entries(rel)) {
    if (typeof row[field] === "string") {
      out[field] = (rows[target] || []).find((r) => String(r.id) === row[field]) ?? null;
    }
  }
  return out;
}

const isOperator = (cond: any) =>
  cond && typeof cond === "object" && Object.keys(cond).some((k) => k.startsWith("_"));

function matches(row: any, filter: any): boolean {
  if (!filter) return true;
  return Object.entries(filter).every(([field, cond]: [string, any]) => {
    const v = row?.[field];
    if (cond && typeof cond === "object" && !isOperator(cond)) {
      // Relational filter: descend into the expanded related row.
      return v && typeof v === "object" ? matches(v, cond) : false;
    }
    // `{ _eq: undefined }` falls through to `true` on purpose: JSON drops the
    // undefined on the wire, so Directus sees no condition at all.
    if (cond?._eq !== undefined) return String(v) === String(cond._eq);
    if (cond?._in !== undefined) return (cond._in as any[]).map(String).includes(String(v));
    return true;
  });
}

beforeEach(() => {
  vi.resetModules();
  ops = [];
  seq = 0;
  rows = {
    ai_actions: [],
    hoa_tasks: [],
    hoa_comments: [],
    hoa_organizations: [
      { id: HOME, name: "Home" },
      { id: OTHER, name: "Other" },
    ],
    hoa_projects: [
      { id: "proj-home", organization: HOME },
      { id: "proj-other", organization: OTHER },
    ],
    hoa_requests: [
      { id: "req-home", organization: HOME, status: "open", assigned_to: null },
      { id: "req-other", organization: OTHER, status: "open", assigned_to: null },
    ],
    hoa_announcements: [
      { id: "ann-home", organization: HOME },
      { id: "ann-other", organization: OTHER },
    ],
    hoa_meetings: [
      { id: "meet-home", organization: HOME },
      { id: "meet-other", organization: OTHER },
    ],
    hoa_members: [
      { id: "mem-home", organization: HOME, status: "active", user: ME },
      { id: "mem-home-former", organization: HOME, status: "archived", user: "user-former" },
      { id: "mem-other", organization: OTHER, status: "active", user: OUTSIDER },
    ],
    directus_users: [
      { id: ME, first_name: "Dana", last_name: "Ruiz", email: "d@example.com" },
      { id: "user-former", first_name: "Fern", last_name: "Former", email: "fern@example.com" },
      { id: OUTSIDER, first_name: "Olive", last_name: "Outsider", email: OUTSIDER_EMAIL },
    ],
  };

  vi.stubGlobal("defineEventHandler", (fn: any) => fn);
  vi.stubGlobal("getRouterParam", (e: any, k: string) => e?.__params?.[k]);
  vi.stubGlobal("readBody", async (e: any) => e?.__body ?? {});
  vi.stubGlobal("createError", (o: any) => Object.assign(new Error(o.message), o));
  vi.stubGlobal("requireUserSession", async () => ({ user: { id: ME } }));
  vi.stubGlobal("requireOrgComposeAccess", async (_e: any, orgId: string) => {
    if (orgId !== HOME) throw Object.assign(new Error("Not authorized for this organization"), { statusCode: 403 });
    return ["admin"];
  });
  vi.stubGlobal("announceEvent", async () => {});
  vi.stubGlobal("writeAuditEntry", async () => {});
  vi.stubGlobal("getTypedDirectus", () => ({
    request: async (desc: Op) => {
      ops.push(desc);
      const all = (rows[desc.collection] ||= []);
      switch (desc.op) {
        case "readOne":
          return all.find((r) => String(r.id) === String(desc.id)) ?? null;
        case "read": {
          const out = all.map((r) => expand(desc.collection, r)).filter((r) => matches(r, desc.query?.filter));
          const { limit } = desc.query ?? {};
          return typeof limit === "number" && limit > 0 ? out.slice(0, limit) : out;
        }
        case "create": {
          const created = { id: `new-${ops.length}`, ...desc.payload };
          all.push(created);
          return created;
        }
        case "updateOne": {
          const row = all.find((r) => String(r.id) === String(desc.id));
          if (row) Object.assign(row, desc.payload);
          return row;
        }
        case "delete":
          rows[desc.collection] = all.filter((r) => String(r.id) !== String(desc.id));
          return null;
        default:
          return null;
      }
    },
  }));
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

const loadApprove = async () => (await import("#core/server/api/ai/actions/[id]/approve.post")).default as any;
const loadEdit = async () => (await import("#core/server/api/ai/actions/[id]/edit.post")).default as any;

/** A pending HOME action of this type and payload, as the edit route would leave it. */
function pending(actionType: string, payload: Record<string, any>): any {
  const row = {
    id: `act-${++seq}`,
    organization: HOME,
    action_type: actionType,
    status: "pending",
    category: "internal",
    risk: "low",
    outbound: false,
    payload,
    title: actionType,
    entity_type: null,
    entity_id: null,
  };
  rows.ai_actions.push(row);
  return row;
}

/** Approve through the real route, as a HOME admin. Resolves to the route's answer or the thrown error. */
async function approve(actionType: string, payload: Record<string, any>) {
  const row = pending(actionType, payload);
  const handler = await loadApprove();
  try {
    return { row, res: await handler({ __params: { id: row.id }, __body: { orgId: HOME } }), err: null as any };
  } catch (err: any) {
    return { row, res: null, err };
  }
}

/** Every write that was not the ai_actions bookkeeping itself. */
const recordWrites = () =>
  ops.filter((o) => ["create", "updateOne", "delete"].includes(o.op) && o.collection !== "ai_actions");

function expectRefused(out: { row: any; err: any }) {
  expect(out.err).toBeTruthy();
  expect(out.err.statusCode).toBe(422);
  expect(out.row.status).toBe("failed");
  expect(recordWrites()).toEqual([]);
}

// ── create_task ──────────────────────────────────────────────────────────────

describe("create_task — the project and request it attaches to", () => {
  it("refuses another community's project", async () => {
    const out = await approve("create_task", { title: "Chase the roofer", project_id: "proj-other" });
    expectRefused(out);
    expect(rows.hoa_tasks).toHaveLength(0);
  });

  it("refuses another community's request", async () => {
    const out = await approve("create_task", { title: "Chase the roofer", request_id: "req-other" });
    expectRefused(out);
    expect(rows.hoa_tasks).toHaveLength(0);
  });

  it("refuses when either id is foreign, even if the other is ours", async () => {
    const out = await approve("create_task", { title: "x", project_id: "proj-home", request_id: "req-other" });
    expectRefused(out);
  });

  it("attaches to this community's project", async () => {
    const out = await approve("create_task", { title: "Chase the roofer", project_id: "proj-home" });
    expect(out.err).toBeNull();
    expect(rows.hoa_tasks).toHaveLength(1);
    expect(rows.hoa_tasks[0]).toMatchObject({ organization: HOME, project: "proj-home", request: null, category: "project" });
  });

  it("attaches to this community's request", async () => {
    const out = await approve("create_task", { title: "Chase the roofer", request_id: "req-home" });
    expect(out.err).toBeNull();
    expect(rows.hoa_tasks[0]).toMatchObject({ project: null, request: "req-home", category: "request" });
  });

  it("still makes a plain task when no id is named", async () => {
    const out = await approve("create_task", { title: "Order chlorine" });
    expect(out.err).toBeNull();
    expect(rows.hoa_tasks[0]).toMatchObject({ project: null, request: null, category: "quick" });
  });
});

// ── add_comment ──────────────────────────────────────────────────────────────

describe("add_comment — the record the note is pinned to", () => {
  it("refuses another community's record", async () => {
    const out = await approve("add_comment", { body: "Noted.", target_collection: "hoa_requests", target_id: "req-other" });
    expectRefused(out);
    expect(rows.hoa_comments).toHaveLength(0);
  });

  it("refuses a kind of record the action is not for, even one of our own", async () => {
    const out = await approve("add_comment", { body: "Noted.", target_collection: "hoa_members", target_id: "mem-home" });
    expectRefused(out);
    expect(rows.hoa_comments).toHaveLength(0);
  });

  it("refuses a note with no target at all", async () => {
    const out = await approve("add_comment", { body: "Noted." });
    expectRefused(out);
    expect(rows.hoa_comments).toHaveLength(0);
  });

  it("accepts every kind of record the model is offered, when the record is ours", async () => {
    // Read from the tool schema, so the executor's allow-list cannot drift
    // from what the model is told it may target.
    const { getActionTools } = await import("#core/server/utils/llm/tools");
    const tool = getActionTools().find((t) => t.name === "add_comment")!;
    const offered = (tool.input_schema as any).properties.target_collection.enum as string[];
    const ours: Record<string, string> = {
      hoa_requests: "req-home",
      hoa_projects: "proj-home",
      hoa_announcements: "ann-home",
      hoa_meetings: "meet-home",
    };
    expect([...offered].sort()).toEqual(Object.keys(ours).sort());
    for (const collection of offered) {
      const out = await approve("add_comment", { body: "Noted.", target_collection: collection, target_id: ours[collection] });
      expect(out.err).toBeNull();
    }
    expect(rows.hoa_comments.map((c) => [c.organization, c.target_collection, c.target_id])).toEqual(
      offered.map((c) => [HOME, c, ours[c]])
    );
  });
});

// ── create_request / log_violation ───────────────────────────────────────────

describe.each(["create_request", "log_violation"])("%s — the member it names", (actionType) => {
  const base = { title: "Trash cans out", type: "violation" };

  it("refuses another community's member", async () => {
    const out = await approve(actionType, { ...base, member_id: "mem-other" });
    expectRefused(out);
    expect(rows.hoa_requests).toHaveLength(2);
  });

  it("refuses a member who is no longer active here", async () => {
    const out = await approve(actionType, { ...base, member_id: "mem-home-former" });
    expectRefused(out);
  });

  it("names this community's active member", async () => {
    const out = await approve(actionType, { ...base, member_id: "mem-home" });
    expect(out.err).toBeNull();
    const created = rows.hoa_requests.find((r) => !["req-home", "req-other"].includes(r.id));
    expect(created).toMatchObject({ organization: HOME, member: "mem-home" });
  });

  it("still opens one with no member named", async () => {
    const out = await approve(actionType, base);
    expect(out.err).toBeNull();
    expect(rows.hoa_requests.at(-1)).toMatchObject({ organization: HOME, member: null });
  });
});

// ── assign_request ───────────────────────────────────────────────────────────

describe("assign_request — who it may be assigned to", () => {
  it("refuses a platform user who is not a member here, without naming them", async () => {
    const out = await approve("assign_request", { request_id: "req-home", assignee_email: OUTSIDER_EMAIL });
    expectRefused(out);
    expect(rows.hoa_requests.find((r) => r.id === "req-home").assigned_to).toBeNull();
    const everything = JSON.stringify({ message: out.err.message, actions: rows.ai_actions });
    expect(everything).not.toMatch(/Olive|Outsider/);
    // …and it was never looked up across the platform in the first place.
    expect(ops.some((o) => o.collection === "directus_users")).toBe(false);
  });

  it("fails an outsider exactly as it fails an address nobody has", async () => {
    const outsider = await approve("assign_request", { request_id: "req-home", assignee_email: OUTSIDER_EMAIL });
    const nobody = await approve("assign_request", { request_id: "req-home", assignee_email: "nobody@nowhere.example" });
    expect(outsider.err.statusCode).toBe(nobody.err.statusCode);
    expect(outsider.err.message.replace(OUTSIDER_EMAIL, "<email>")).toBe(
      nobody.err.message.replace("nobody@nowhere.example", "<email>")
    );
  });

  it("refuses a former member of this community", async () => {
    const out = await approve("assign_request", { request_id: "req-home", assignee_email: "fern@example.com" });
    expectRefused(out);
    expect(out.err.message).not.toMatch(/Fern|Former/);
  });

  it("refuses an empty email rather than matching whoever comes first", async () => {
    const out = await approve("assign_request", { request_id: "req-home" });
    expectRefused(out);
    expect(rows.hoa_requests.find((r) => r.id === "req-home").assigned_to).toBeNull();
  });

  it("refuses another community's request", async () => {
    const out = await approve("assign_request", { request_id: "req-other", assignee_email: "d@example.com" });
    expectRefused(out);
  });

  it("assigns this community's active member, and names them", async () => {
    const out = await approve("assign_request", { request_id: "req-home", assignee_email: "d@example.com" });
    expect(out.err).toBeNull();
    expect(rows.hoa_requests.find((r) => r.id === "req-home").assigned_to).toBe(ME);
    expect(out.res.result.assignedTo).toBe("Dana Ruiz");
  });
});

// ── the shared check ─────────────────────────────────────────────────────────

describe("a payload with its target id removed", () => {
  it("is refused, not matched to the community's first record", async () => {
    // `{ id: { _eq: undefined } }` serializes to no condition, so without a
    // guard the org filter alone would pick a row and the update would land on it.
    const out = await approve("update_request_status", { status: "closed" });
    expectRefused(out);
    expect(rows.hoa_requests.every((r) => r.status === "open")).toBe(true);
  });
});

// ── the path an attacker would actually take ─────────────────────────────────

describe("edit, then approve", () => {
  it("cannot repoint a pending proposal at another community's record", async () => {
    const row = pending("create_task", { title: "Chase the roofer" });
    const edit = await loadEdit();
    await edit({
      __params: { id: row.id },
      __body: { orgId: HOME, payload: { title: "Chase the roofer", project_id: "proj-other" } },
    });
    expect(row.payload.project_id).toBe("proj-other"); // the edit route accepts it…
    const handler = await loadApprove();
    await expect(handler({ __params: { id: row.id }, __body: { orgId: HOME } })).rejects.toMatchObject({
      statusCode: 422,
    });
    // …and the executor is where it stops.
    expect(rows.hoa_tasks).toHaveLength(0);
    expect(row.status).toBe("failed");
  });
});
