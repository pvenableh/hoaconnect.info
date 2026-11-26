/**
 * The routes that make inquiries, violations, directory, communications and
 * meetings holdable by a helper or committee (docs/spec-delegation.md): each
 * reads and writes with the app's token behind requireAreaWork, so a helper
 * (a plain HOA Member in Directus) works the area the way a manager does, and
 * nobody without the area gets in. Run against the in-memory Directus.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { ID, ORG, OTHER, PERSONAS, ev, seed, stubGlobals, uuid, type Db, type Who } from "./__fixtures__/responsibilities-db";

vi.mock("@directus/sdk", async () => (await import("./__fixtures__/responsibilities-db")).sdkMock());

const state: { who: Who; db: Db } = { who: PERSONAS.admin, db: seed() };

/** requireAreaWork as manager-access.ts decides it, on the personas. */
function areaGate() {
  return async (_e: any, _orgId: string, key: string) => {
    const who = state.who;
    if (who.admin) return { via: "admin" };
    if (who.grants?.[key] === true) return { via: "manager" };
    if ((who.helps ?? []).includes(key)) return { via: "helper" };
    throw Object.assign(new Error(`Not authorized for this action (${key})`), { statusCode: 403 });
  };
}

const helper = (...areas: string[]): Who => ({ ...PERSONAS.owner, helps: areas });

beforeAll(() => {
  stubGlobals(state);
  vi.stubGlobal("createError", (o: any) => Object.assign(new Error(o.message), o));
  vi.stubGlobal("requireAreaWork", areaGate());
});

beforeEach(() => {
  state.db = seed();
  state.who = PERSONAS.admin;
});

/** The common refusals: 401 without a session, 400 without orgId, 403 without the area. */
async function refusals(call: (o: { query?: any; body?: any; params?: any }) => Promise<any>, input: { query?: any; body?: any; params?: any }, area: string) {
  state.who = PERSONAS.nobody;
  await expect(call(input)).rejects.toMatchObject({ statusCode: 401 });
  state.who = PERSONAS.admin;
  const noOrg = { ...input, query: input.query ? { ...input.query, orgId: undefined } : undefined, body: input.body ? { ...input.body, orgId: undefined } : undefined };
  await expect(call(noOrg)).rejects.toMatchObject({ statusCode: 400 });
  for (const who of [PERSONAS.owner, PERSONAS.board, helper("projects"), { ...PERSONAS.manager, grants: { projects: true } }]) {
    state.who = who;
    await expect(call(input), JSON.stringify(who)).rejects.toMatchObject({ statusCode: 403 });
  }
  state.who = helper(area);
}

describe("GET /api/org/directory", () => {
  let route: (e: any) => Promise<any>;
  beforeAll(async () => {
    route = (await import("#core/server/api/org/directory/index.get")).default as any;
  });
  const call = (o: { query?: any }) => route(ev(o));

  beforeEach(() => {
    state.db.hoa_members!.push(
      { id: uuid(901), organization: ORG, first_name: "Ina", last_name: "Active", email: "ina@example.test", phone: "555-0101", member_type: "owner", status: "inactive" },
      { id: uuid(902), organization: ORG, first_name: "Cy", last_name: "Tenant", email: "cy@example.test", phone: null, member_type: "tenant", status: "active" }
    );
  });

  it("refuses without a session, an orgId or the directory area", async () => {
    await refusals(call, { query: { orgId: ORG } }, "directory");
  });

  it("a helper holding directory reads the active members with contact fields, this community only", async () => {
    for (const who of [helper("directory"), PERSONAS.manager, PERSONAS.admin]) {
      state.who = who;
      const { members } = await call({ query: { orgId: ORG } });
      const ids = members.map((m: any) => m.id);
      expect(ids).toContain(uuid(902));
      expect(ids).not.toContain(uuid(901));
      expect(ids).not.toContain(ID.memberOther);
      expect(members.find((m: any) => m.id === uuid(902))).toMatchObject({ first_name: "Cy", email: "cy@example.test", member_type: "tenant" });
    }
  });

  it("asks for the fields the page shows, filtered to the community", async () => {
    const calls = stubGlobals(state);
    vi.stubGlobal("requireAreaWork", areaGate());
    await call({ query: { orgId: ORG } });
    const read = calls.calls.find((c: any) => c.collection === "hoa_members");
    expect(read.query.filter).toEqual({ organization: { _eq: ORG }, status: { _eq: "active" } });
    expect(read.query.fields).toEqual(["id", "first_name", "last_name", "email", "phone", "member_type"]);
  });
});

describe("change requests (directory approvals)", () => {
  it("a helper holding directory is a change reviewer; a plain owner is not", async () => {
    vi.stubGlobal("getHelperAreas", async () => state.who.helps ?? []);
    const { isChangeReviewer } = await import("#core/server/utils/change-request-access");
    state.who = helper("directory");
    expect(await isChangeReviewer(ev(), ORG)).toBe(true);
    state.who = helper("projects");
    expect(await isChangeReviewer(ev(), ORG)).toBe(false);
    state.who = PERSONAS.manager;
    expect(await isChangeReviewer(ev(), ORG)).toBe(true);
  });
});

describe("inquiries routes", () => {
  const REQ = uuid(911);
  const REQ_OTHER = uuid(912);
  let list: (e: any) => Promise<any>;
  let one: (e: any) => Promise<any>;
  let patch: (e: any) => Promise<any>;
  let transition: (e: any) => Promise<any>;
  let create: (e: any) => Promise<any>;
  const notify = vi.fn(async () => null);

  beforeAll(async () => {
    vi.stubGlobal("notifyReminderEvent", notify);
    vi.stubGlobal("requireAuthenticatedUser", async () => {
      if (!state.who.userId) throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
      return { userId: state.who.userId };
    });
    list = (await import("#core/server/api/org/inquiries/index.get")).default as any;
    one = (await import("#core/server/api/org/inquiries/[id].get")).default as any;
    patch = (await import("#core/server/api/org/inquiries/[id].patch")).default as any;
    transition = (await import("#core/server/api/org/inquiries/[id]/transition.post")).default as any;
    create = (await import("#core/server/api/hoa/requests/manager-create.post")).default as any;
  });

  beforeEach(() => {
    notify.mockClear();
    state.db.hoa_requests = [
      { id: REQ, organization: ORG, type: "maintenance", title: "Leak", status: "open", submitted_by: ID.userAnn, metadata: { workflow_state: "open", location: "3B" }, date_updated: "2026-11-20T00:00:00Z" },
      { id: REQ_OTHER, organization: OTHER, type: "maintenance", title: "Elsewhere", status: "open", metadata: null },
    ];
    state.db.hoa_channels = [{ id: "ch-1", organization: ORG, request: REQ, name: "Ticket: Leak", slug: "ticket-leak" }];
    state.db.hoa_comments = [];
  });

  it("refuse without a session, an orgId or the inquiries area", async () => {
    await refusals((o) => list(ev(o)), { query: { orgId: ORG } }, "inquiries");
    await refusals((o) => one(ev(o)), { query: { orgId: ORG }, params: { id: REQ } }, "inquiries");
    await refusals((o) => patch(ev(o)), { body: { orgId: ORG, details: { location: "4C" } }, params: { id: REQ } }, "inquiries");
    await refusals((o) => transition(ev(o)), { body: { orgId: ORG, to: "assigned" }, params: { id: REQ } }, "inquiries");
    expect(state.db.hoa_requests![0].metadata.location).toBe("3B");
    expect(state.db.hoa_requests![0].status).toBe("open");
  });

  it("a helper holding inquiries lists this community's requests, and reads one with its channel", async () => {
    state.who = helper("inquiries");
    const { requests } = await list(ev({ query: { orgId: ORG } }));
    expect(requests.map((r: any) => r.id)).toEqual([REQ]);
    const res = await one(ev({ query: { orgId: ORG }, params: { id: REQ } }));
    expect(res.request.title).toBe("Leak");
    expect(res.channel).toMatchObject({ slug: "ticket-leak" });
  });

  it("another community's request is a 404 on every route", async () => {
    state.who = helper("inquiries");
    await expect(one(ev({ query: { orgId: ORG }, params: { id: REQ_OTHER } }))).rejects.toMatchObject({ statusCode: 404 });
    await expect(patch(ev({ body: { orgId: ORG, details: { location: "x" } }, params: { id: REQ_OTHER } }))).rejects.toMatchObject({ statusCode: 404 });
    await expect(transition(ev({ body: { orgId: ORG, to: "assigned" }, params: { id: REQ_OTHER } }))).rejects.toMatchObject({ statusCode: 404 });
    expect(state.db.hoa_requests![1].metadata).toBeNull();
  });

  it("save details writes the workflow's detail fields only", async () => {
    state.who = helper("inquiries");
    const res = await patch(ev({ body: { orgId: ORG, details: { location: "4C", vendor: "Acme", workflow_state: "closed", junk: 1 } }, params: { id: REQ } }));
    expect(res.request.metadata).toEqual({ workflow_state: "open", location: "4C", vendor: "Acme" });
    await expect(patch(ev({ body: { orgId: ORG, details: "nope" }, params: { id: REQ } }))).rejects.toMatchObject({ statusCode: 400 });
  });

  it("a transition writes the status from the workflow, posts the note, and tells the submitter when it is news", async () => {
    state.who = helper("inquiries");
    const res = await transition(ev({ body: { orgId: ORG, to: "assigned" }, params: { id: REQ } }));
    const row = state.db.hoa_requests![0];
    expect(row.status).toBe("in_progress");
    expect(row.metadata).toMatchObject({ workflow_state: "assigned", location: "3B" });
    expect(row.metadata.status_changed_at).toBeTruthy();
    expect(state.db.hoa_comments).toHaveLength(1);
    expect(state.db.hoa_comments![0]).toMatchObject({ target_collection: "hoa_requests", target_id: REQ, organization: ORG, is_internal: false });
    expect(state.db.hoa_comments![0].body).toContain("Assign");
    expect(res).toMatchObject({ label: "Assign", commentId: state.db.hoa_comments![0].id, announce: false });
    expect(notify).toHaveBeenCalledWith(ORG, { collection: "hoa_requests", id: REQ }, "status");
  });

  it("a move the workflow does not allow from where it stands is a 409 and writes nothing", async () => {
    state.who = helper("inquiries");
    await expect(transition(ev({ body: { orgId: ORG, to: "closed" }, params: { id: REQ } }))).rejects.toMatchObject({ statusCode: 409 });
    await expect(transition(ev({ body: { orgId: ORG }, params: { id: REQ } }))).rejects.toMatchObject({ statusCode: 400 });
    expect(state.db.hoa_requests![0].status).toBe("open");
    expect(state.db.hoa_comments).toHaveLength(0);
  });

  it("a follow-up task: a helper holding inquiries creates it under this community's ticket, never another's", async () => {
    state.who = helper("inquiries");
    const body = { organization: ORG, type: "task", title: "Follow-up: Leak", status: "open", parent_request: REQ };
    const { request } = await create(ev({ body }));
    expect(state.db.hoa_requests!.find((r) => r.id === request.id)).toMatchObject({ type: "task", parent_request: REQ, submitted_by: state.who.userId });
    await expect(create(ev({ body: { ...body, parent_request: REQ_OTHER } }))).rejects.toMatchObject({ statusCode: 403 });
    state.who = helper("projects");
    await expect(create(ev({ body }))).rejects.toMatchObject({ statusCode: 403 });
  });
});

describe("violations", () => {
  const VIO = uuid(921);
  const LEAK = uuid(922);
  let list: (e: any) => Promise<any>;
  let one: (e: any) => Promise<any>;
  let transition: (e: any) => Promise<any>;
  let members: (e: any) => Promise<any>;
  let create: (e: any) => Promise<any>;

  beforeAll(async () => {
    vi.stubGlobal("notifyReminderEvent", async () => null);
    vi.stubGlobal("requireAuthenticatedUser", async () => {
      if (!state.who.userId) throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
      return { userId: state.who.userId };
    });
    list = (await import("#core/server/api/org/inquiries/index.get")).default as any;
    one = (await import("#core/server/api/org/inquiries/[id].get")).default as any;
    transition = (await import("#core/server/api/org/inquiries/[id]/transition.post")).default as any;
    members = (await import("#core/server/api/org/violations/members.get")).default as any;
    create = (await import("#core/server/api/hoa/requests/manager-create.post")).default as any;
  });

  beforeEach(() => {
    state.db.hoa_requests = [
      { id: VIO, organization: ORG, type: "violation", title: "Trash out early", status: "open", member: ID.memberAnn, metadata: null },
      { id: LEAK, organization: ORG, type: "maintenance", title: "Leak", status: "open", metadata: null },
    ];
    state.db.hoa_comments = [];
    state.db.hoa_channels = [];
  });

  it("the member picker refuses without a session, an orgId or the violations area", async () => {
    await refusals((o) => members(ev(o)), { query: { orgId: ORG } }, "violations");
  });

  it("the member picker gives names only, of this community's active members", async () => {
    state.who = helper("violations");
    state.db.hoa_members![0].email = "ann@example.test";
    const res = await members(ev({ query: { orgId: ORG } }));
    expect(res.members).toContainEqual({ id: ID.memberAnn, first_name: "Ann", last_name: "Lee" });
    expect(res.members.map((m: any) => m.id)).not.toContain(ID.memberOther);
    expect(JSON.stringify(res)).not.toContain("example.test");
  });

  it("violations alone reads the violation requests, and the others are a 404", async () => {
    state.who = helper("violations");
    const res = await list(ev({ query: { orgId: ORG } }));
    expect(res).toMatchObject({ scope: "violations" });
    expect(res.requests.map((r: any) => r.id)).toEqual([VIO]);
    expect((await one(ev({ query: { orgId: ORG }, params: { id: VIO } }))).request.title).toBe("Trash out early");
    await expect(one(ev({ query: { orgId: ORG }, params: { id: LEAK } }))).rejects.toMatchObject({ statusCode: 404 });
    await expect(transition(ev({ body: { orgId: ORG, to: "assigned" }, params: { id: LEAK } }))).rejects.toMatchObject({ statusCode: 404 });
    expect(state.db.hoa_requests![1].status).toBe("open");
  });

  it("inquiries reads every request", async () => {
    state.who = helper("inquiries");
    const res = await list(ev({ query: { orgId: ORG } }));
    expect(res.scope).toBe("all");
    expect(res.requests.map((r: any) => r.id).sort()).toEqual([VIO, LEAK].sort());
  });

  it("a helper holding violations opens a violation, against this community's member only; inquiries alone cannot", async () => {
    const body = { organization: ORG, type: "violation", title: "Noise", status: "open", member: ID.memberBob };
    state.who = helper("violations");
    const { request } = await create(ev({ body }));
    expect(state.db.hoa_requests!.find((r) => r.id === request.id)).toMatchObject({ type: "violation", member: ID.memberBob });
    await expect(create(ev({ body: { ...body, member: ID.memberOther } }))).rejects.toMatchObject({ statusCode: 403 });
    await expect(create(ev({ body: { ...body, type: "maintenance" } }))).rejects.toMatchObject({ statusCode: 403 });
    state.who = helper("inquiries");
    await expect(create(ev({ body }))).rejects.toMatchObject({ statusCode: 403 });
  });
});

describe("communications routes", () => {
  let recipients: (e: any) => Promise<any>;
  let templates: (e: any) => Promise<any>;
  let activity: (e: any) => Promise<any>;

  beforeAll(async () => {
    recipients = (await import("#core/server/api/org/communications/recipients.get")).default as any;
    templates = (await import("#core/server/api/org/communications/templates.get")).default as any;
    activity = (await import("#core/server/api/org/communications/activity.get")).default as any;
  });

  beforeEach(() => {
    state.db.hoa_members!.find((m) => m.id === ID.memberAnn)!.email = "ann@example.test";
    state.db.hoa_members!.find((m) => m.id === ID.memberOther)!.email = "oz@example.test";
    state.db.block_settings = [
      { id: 1, organization: ORG, cc_bcc_threshold: 8 },
      { id: 2, organization: OTHER, cc_bcc_threshold: 99 },
    ];
    state.db.hoa_email_templates = [
      { id: "t-own", organization: ORG, status: "published", name: "Ours" },
      { id: "t-global", organization: null, status: "published", name: "Everyone's" },
      { id: "t-draft", organization: ORG, status: "draft", name: "Draft" },
      { id: "t-other", organization: OTHER, status: "published", name: "Theirs" },
    ];
    state.db.hoa_email_activity = [
      { id: "a-1", organization: ORG, event: "delivered", date_created: "2026-11-20T00:00:00Z" },
      { id: "a-2", organization: ORG, event: "open", date_created: "2026-11-21T00:00:00Z" },
      { id: "a-3", organization: ORG, event: "open", date_created: "2026-11-22T00:00:00Z" },
      { id: "a-4", organization: OTHER, event: "open", date_created: "2026-11-22T00:00:00Z" },
    ];
    state.db.hoa_emails = [
      { id: "e-1", organization: ORG, status: "sent", subject: "Water off", sent_at: "2026-11-20T00:00:00Z" },
      { id: "e-2", organization: ORG, status: "draft", subject: "Draft" },
      { id: "e-3", organization: OTHER, status: "sent", subject: "Theirs" },
    ];
  });

  it("each refuses without a session, an orgId or the communications area", async () => {
    await refusals((o) => recipients(ev(o)), { query: { orgId: ORG } }, "communications");
    await refusals((o) => templates(ev(o)), { query: { orgId: ORG } }, "communications");
    await refusals((o) => activity(ev(o)), { query: { orgId: ORG } }, "communications");
  });

  it("recipients: this community's active members with an email, and its CC/BCC cutoff", async () => {
    state.who = helper("communications");
    const res = await recipients(ev({ query: { orgId: ORG } }));
    expect(res.members.map((m: any) => m.id)).toEqual([ID.memberAnn]);
    expect(res.ccBccThreshold).toBe(8);
  });

  it("templates: the community's published ones and the global ones", async () => {
    state.who = helper("communications");
    const res = await templates(ev({ query: { orgId: ORG } }));
    expect(res.templates.map((t: any) => t.id).sort()).toEqual(["t-global", "t-own"]);
  });

  it("activity: this community's counts, events and sent emails; later pages carry events only", async () => {
    state.who = helper("communications");
    const first = await activity(ev({ query: { orgId: ORG } }));
    expect(first.counts).toEqual({ total: 3, delivered: 1, open: 2, click: 0, bounce: 0 });
    expect(first.activities.map((a: any) => a.id).sort()).toEqual(["a-1", "a-2", "a-3"]);
    expect(first.emails.map((e: any) => e.id)).toEqual(["e-1"]);
    expect(first.hasMore).toBe(false);
    const next = await activity(ev({ query: { orgId: ORG, page: 1 } }));
    expect(next.counts).toBeUndefined();
    expect(next.emails).toBeUndefined();
  });
});

describe("the email routes admit a helper holding communications", () => {
  it("every /api/email route that gates on communications asks requireAreaWork", async () => {
    const { readFileSync, readdirSync, statSync } = await import("node:fs");
    const { join } = await import("node:path");
    const walk = (d: string): string[] =>
      readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
    const gated = walk(join(process.cwd(), "core/server/api/email")).filter((f) => readFileSync(f, "utf8").includes('"communications")'));
    expect(gated.length).toBeGreaterThan(10);
    for (const f of gated) {
      const src = readFileSync(f, "utf8");
      expect(src, f).toContain("requireAreaWork(");
      expect(src, f).not.toMatch(/requireAdminOrManagerGrant\([^;]*"communications"/);
    }
  });
});
