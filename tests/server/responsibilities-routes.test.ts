/**
 * The register's routes (docs/spec-responsibilities.md): who may call each,
 * that each reads and writes only the org asked for, and the behaviours the
 * spec names — hand-over in one call, the owner view's "nothing else", the
 * admin-only switches, the idempotent seed, and the PDF's as-of header.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { ID, ORG, OTHER, PERSONAS, ev, seed, stubGlobals, uuid, type Db, type Who } from "./__fixtures__/responsibilities-db";

vi.mock("@directus/sdk", async () => (await import("./__fixtures__/responsibilities-db")).sdkMock());

let pdfDoc: any = null;
vi.mock("#core/server/utils/register-pdf", () => ({
  renderRegisterPdf: async (doc: any) => {
    pdfDoc = doc;
    return Buffer.from("%PDF-fake");
  },
}));

const state: { who: Who; db: Db; fail?: { failCreate?: string } } = { who: PERSONAS.admin, db: seed() };
let fake: ReturnType<typeof stubGlobals>;

const R = "#core/server/api/org/responsibilities";
const ROUTES = {
  index: `${R}/index.get`,
  published: `${R}/published.get`,
  create: `${R}/index.post`,
  patch: `${R}/[id].patch`,
  retire: `${R}/[id]/retire.post`,
  add: `${R}/[id]/assignees.post`,
  handOver: `${R}/[id]/hand-over.post`,
  correct: `${R}/assignees/[id].patch`,
  template: `${R}/apply-template.post`,
  visibility: `${R}/visibility.patch`,
  pdf: `${R}/export.pdf.get`,
} as const;
type Route = keyof typeof ROUTES;

const handlers: Partial<Record<Route, (e: any) => Promise<any>>> = {};
const call = (route: Route, o: { query?: any; body?: any; params?: any } = {}) => handlers[route]!(ev(o));

beforeAll(async () => {
  fake = stubGlobals(state);
  for (const [k, path] of Object.entries(ROUTES)) handlers[k as Route] = (await import(/* @vite-ignore */ path)).default;
});

beforeEach(() => {
  state.db = seed();
  state.who = PERSONAS.admin;
  state.fail = undefined;
  pdfDoc = null;
  fake.reset();
});

const activity = () => state.db.hoa_activity!;
const assignees = (job: string) => state.db.hoa_responsibility_assignees!.filter((a) => a.responsibility === job);
const as = (who: Who) => (state.who = who);

/** A valid request for each route, against Lenox. */
const VALID: Record<Route, { query?: any; body?: any; params?: any }> = {
  index: { query: { orgId: ORG } },
  published: { query: { orgId: ORG } },
  create: { body: { orgId: ORG, title: "Pays vendors", category: "finance" } },
  patch: { params: { id: ID.jobBank }, body: { orgId: ORG, cadence: "quarterly" } },
  retire: { params: { id: ID.jobPest }, body: { orgId: ORG, effective: "2026-11-20" } },
  add: { params: { id: ID.jobBank }, body: { orgId: ORG, team: ID.teamGrounds, role: "backup", start_date: "2026-11-01" } },
  handOver: { params: { id: ID.jobBank }, body: { orgId: ORG, assignee: ID.aBank, effective: "2026-11-01", next: { vendor: ID.vendorAcme } } },
  correct: { params: { id: ID.aOldSuper }, body: { orgId: ORG, notes: "Left in October" } },
  template: { body: { orgId: ORG, template: "florida_condominium" } },
  visibility: { body: { orgId: ORG, published: true } },
  pdf: { query: { orgId: ORG, asOf: "2026-11-01" } },
};

/** The same request aimed at another community's row (or community). */
const FOREIGN: Partial<Record<Route, { query?: any; body?: any; params?: any }>> = {
  patch: { params: { id: ID.jobOther }, body: { orgId: ORG, cadence: "quarterly" } },
  retire: { params: { id: ID.jobOther }, body: { orgId: ORG } },
  add: { params: { id: ID.jobOther }, body: { orgId: ORG, label: "X" } },
  handOver: { params: { id: ID.jobOther }, body: { orgId: ORG, assignee: ID.aOther, effective: "2026-11-01" } },
  correct: { params: { id: ID.aOther }, body: { orgId: ORG, notes: "x" } },
};

const READS: Route[] = ["index", "pdf"];
const EDITS: Route[] = ["create", "patch", "retire", "add", "handOver", "correct", "template"];

describe("every route", () => {
  for (const route of Object.keys(ROUTES) as Route[]) {
    it(`${route}: 401 without a session, 400 without orgId`, async () => {
      as(PERSONAS.nobody);
      await expect(call(route, VALID[route])).rejects.toMatchObject({ statusCode: 401 });
      as(PERSONAS.admin);
      const v = VALID[route];
      const bare = { ...v, query: v.query ? { ...v.query, orgId: undefined } : undefined, body: v.body ? { ...v.body, orgId: undefined } : undefined };
      await expect(call(route, bare)).rejects.toMatchObject({ statusCode: 400 });
    });

    it(`${route}: refuses someone with no seat in the community`, async () => {
      as(PERSONAS.outsider);
      await expect(call(route, VALID[route])).rejects.toMatchObject({ statusCode: 403 });
    });
  }

  for (const route of [...READS, ...EDITS, "visibility" as Route]) {
    it(`${route}: refuses a plain owner and a manager without the grant, and writes nothing`, async () => {
      for (const who of [PERSONAS.owner, PERSONAS.manager]) {
        as(who);
        await expect(call(route, VALID[route])).rejects.toMatchObject({ statusCode: 403 });
      }
      expect(fake.calls.filter((c) => c.op !== "readItems" && c.op !== "readItem")).toHaveLength(0);
    });
  }

  for (const route of Object.keys(FOREIGN) as Route[]) {
    it(`${route}: 404 for another community's row`, async () => {
      await expect(call(route, FOREIGN[route]!)).rejects.toMatchObject({ statusCode: 404 });
      expect(state.db.hoa_responsibility_assignees!.find((a) => a.id === ID.aOther)).toMatchObject({ end_date: null });
    });
  }
});

describe("who reads, who edits", () => {
  it("a board seat reads everything, history included, and cannot edit", async () => {
    as(PERSONAS.board);
    const res = await call("index", VALID.index);
    expect(res.viewer).toEqual({ canEdit: false, isAdmin: false });
    const hurricane = res.responsibilities.find((r: any) => r.id === ID.jobHurricane);
    expect(hurricane.holders).toEqual([]);
    expect(hurricane.unassignedSince).toBe("2026-10-12");
    expect(hurricane.assignees.map((a: any) => a.name)).toEqual(["Old super"]);
    expect(res.responsibilities.every((r: any) => r.organization === ORG)).toBe(true);

    for (const route of EDITS) {
      await expect(call(route, VALID[route])).rejects.toMatchObject({ statusCode: 403 });
    }
  });

  it("an office resolves to the person for the date, or vacant", async () => {
    const now = await call("index", { query: { orgId: ORG, asOf: "2026-06-01" } });
    const bank = now.responsibilities.find((r: any) => r.id === ID.jobBank);
    expect(bank.holders[0]).toMatchObject({ kind: "office", name: "Treasurer", vacant: false, people: [{ name: "Ann Lee", memberId: ID.memberAnn }] });
    const before = await call("index", { query: { orgId: ORG, asOf: "2025-12-31" } });
    expect(before.responsibilities.find((r: any) => r.id === ID.jobBank).holders).toEqual([]);
    state.db.hoa_board_members!.find((t) => t.id === ID.termAnn)!.term_end = "2026-03-31";
    const vacant = await call("index", { query: { orgId: ORG, asOf: "2026-06-01" } });
    expect(vacant.responsibilities.find((r: any) => r.id === ID.jobBank).holders[0]).toMatchObject({ vacant: true, people: [] });
  });

  it("an editor with the grant edits; the hat alone does not", async () => {
    as(PERSONAS.editor);
    const res = await call("create", VALID.create);
    expect(res.id).toBeTruthy();
    as({ ...PERSONAS.manager, grants: null });
    await expect(call("create", VALID.create)).rejects.toMatchObject({ statusCode: 403 });
  });

  it("asOf must be a date", async () => {
    await expect(call("index", { query: { orgId: ORG, asOf: "next tuesday" } })).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe("visibility", () => {
  it("is admin only: a non-admin editor gets 403", async () => {
    as(PERSONAS.editor);
    await expect(call("visibility", VALID.visibility)).rejects.toMatchObject({ statusCode: 403 });
    expect(state.db.hoa_organizations![0].responsibilities_published).toBe(false);
  });

  it("logs each switch changed, with the actor", async () => {
    const res = await call("visibility", { body: { orgId: ORG, published: true, showUnassigned: true } });
    expect(res).toEqual({ published: true, showUnassigned: true });
    expect(activity().map((a) => a.label)).toEqual([
      "Published the register to owners",
      "Turned on showing unassigned jobs to owners",
    ]);
    expect(activity().every((a) => a.user === ID.userAdmin && a.member === ID.memberAdmin && a.event_type === "responsibility")).toBe(true);
    await call("visibility", { body: { orgId: ORG, published: true } });
    expect(activity()).toHaveLength(2);
  });
});

describe("the owners' view", () => {
  const publish = (published: boolean, showUnassigned = false) =>
    Object.assign(state.db.hoa_organizations![0], { responsibilities_published: published, responsibilities_show_unassigned: showUnassigned });

  it("is empty until published, and when the module is off", async () => {
    as(PERSONAS.owner);
    expect(await call("published", VALID.published)).toEqual({ published: false, responsibilities: [] });
    publish(true);
    state.db.hoa_organizations![0].modules = { responsibilities: false };
    expect(await call("published", VALID.published)).toEqual({ published: false, responsibilities: [] });
  });

  it("shows job, who, cadence and last verified, nothing else; never 'disputed'", async () => {
    publish(true);
    as(PERSONAS.owner);
    const { responsibilities } = await call("published", VALID.published);
    expect(responsibilities.map((r: any) => r.title)).toEqual(["Reconciles bank statements", "Pest control"]);
    for (const r of responsibilities) expect(Object.keys(r).sort()).toEqual(["cadence", "category", "id", "lastVerified", "title", "who"]);
    const text = JSON.stringify(responsibilities);
    for (const secret of ["contract", "Management agreement", "Board unsure", "Disputed", "disputed", "al@acme.test", "555-0100", "Al Acme", "Old super"]) {
      expect(text, secret).not.toContain(secret);
    }
    expect(responsibilities[0].who).toEqual([{ kind: "office", name: "Treasurer", role: "owner", people: ["Ann Lee"] }]);
    expect(responsibilities[1].who).toEqual([{ kind: "vendor", name: "Acme Pest", role: "owner" }]);
  });

  it("leaves out unassigned jobs until the switch; then the title and the date only, first in the category", async () => {
    publish(true, true);
    as(PERSONAS.owner);
    const { responsibilities } = await call("published", VALID.published);
    const hurricane = responsibilities.find((r: any) => r.id === ID.jobHurricane);
    expect(hurricane).toEqual({ id: ID.jobHurricane, title: "Hurricane prep and shutdown", category: "mechanical_safety", unassignedSince: "2026-10-12" });
    // The per-row opt-out still hides a row, assigned or not; retired rows never show.
    expect(responsibilities.find((r: any) => r.id === ID.jobHidden)).toBeUndefined();
    expect(responsibilities.find((r: any) => r.id === ID.jobRetired)).toBeUndefined();
    // A disputed job with no holder reads as unassigned, not disputed.
    state.db.hoa_responsibility_assignees!.find((a) => a.id === ID.aPest)!.end_date = "2026-01-31";
    const again = await call("published", VALID.published);
    const pest = again.responsibilities.find((r: any) => r.id === ID.jobPest);
    expect(pest).toEqual({ id: ID.jobPest, title: "Pest control", category: "building", unassignedSince: "2026-02-01" });
  });

  it("unassigned jobs lead their category", async () => {
    publish(true, true);
    as(PERSONAS.owner);
    Object.assign(state.db.hoa_responsibilities!.find((j) => j.id === ID.jobHidden)!, { member_visible: true, sort: 1 });
    state.db.hoa_responsibilities!.find((j) => j.id === ID.jobHurricane)!.sort = 9;
    const { responsibilities } = await call("published", VALID.published);
    const mech = responsibilities.filter((r: any) => r.category === "mechanical_safety").map((r: any) => r.id);
    expect(mech).toEqual([ID.jobHurricane, ID.jobHidden]);
  });
});

describe("hand-over", () => {
  it("ends the current row the day before, freezes its name, and opens the next, in one call", async () => {
    const res = await call("handOver", VALID.handOver);
    const rows = assignees(ID.jobBank);
    const ended = rows.find((a) => a.id === ID.aBank)!;
    expect(ended).toMatchObject({ end_date: "2026-10-31", holder_name: "Treasurer" });
    const opened = rows.find((a) => a.id === res.opened)!;
    expect(opened).toMatchObject({ vendor: ID.vendorAcme, office: null, role: "owner", start_date: "2026-11-01", organization: ORG });
    expect(opened.end_date ?? null).toBeNull();
    expect(activity()[0]).toMatchObject({ label: "Treasurer ended on Reconciles bank statements; Acme Pest added", event_type: "responsibility" });
  });

  it("undoes the end when the next row cannot be opened", async () => {
    state.fail = { failCreate: "hoa_responsibility_assignees" };
    await expect(call("handOver", VALID.handOver)).rejects.toMatchObject({ statusCode: 500 });
    expect(assignees(ID.jobBank).find((a) => a.id === ID.aBank)).toMatchObject({ end_date: null, holder_name: null });
    expect(assignees(ID.jobBank)).toHaveLength(1);
  });

  it("without a next holder, only ends", async () => {
    await call("handOver", { ...VALID.handOver, body: { orgId: ORG, assignee: ID.aBank, effective: "2026-11-01" } });
    expect(assignees(ID.jobBank)).toHaveLength(1);
    expect(activity()[0].label).toBe("Treasurer ended on Reconciles bank statements; nobody holds it now");
  });

  it("refuses a holder from another community, the same holder, and a date on the start", async () => {
    await expect(call("handOver", { ...VALID.handOver, body: { ...VALID.handOver.body, next: { vendor: ID.vendorOther } } })).rejects.toMatchObject({ statusCode: 400 });
    await expect(call("handOver", { ...VALID.handOver, body: { ...VALID.handOver.body, next: { office: "treasurer" } } })).rejects.toMatchObject({ statusCode: 409 });
    await expect(call("handOver", { ...VALID.handOver, body: { ...VALID.handOver.body, effective: "2026-01-01" } })).rejects.toMatchObject({ statusCode: 409 });
    await expect(call("handOver", { ...VALID.handOver, body: { ...VALID.handOver.body, next: { vendor: ID.vendorAcme, label: "x" } } })).rejects.toMatchObject({ statusCode: 400 });
    expect(assignees(ID.jobBank).find((a) => a.id === ID.aBank)).toMatchObject({ end_date: null });
  });
});

describe("other writes", () => {
  it("create checks every holder and file against the community", async () => {
    await expect(call("create", { body: { ...VALID.create.body, holders: [{ member: ID.memberOther }] } })).rejects.toMatchObject({ statusCode: 400 });
    await expect(call("create", { body: { ...VALID.create.body, evidence: [ID.fileElsewhere] } })).rejects.toMatchObject({ statusCode: 403 });
    await expect(call("create", { body: { ...VALID.create.body, area: "nope" } })).rejects.toMatchObject({ statusCode: 400 });
    await expect(call("create", { body: { ...VALID.create.body, holders: [{ office: "treasurer", member: ID.memberAnn }] } })).rejects.toMatchObject({ statusCode: 400 });
    const { id } = await call("create", {
      body: { ...VALID.create.body, area: "projects", evidence: [ID.fileOk], holders: [{ user: ID.userBob, start_date: "2026-11-01" }, { label: "City of Miami Beach", role: "oversight" }] },
    });
    expect(state.db.hoa_responsibilities!.find((j) => j.id === id)).toMatchObject({ organization: ORG, basis: "unknown", status: "active", member_visible: true });
    expect(assignees(id).map((a) => [a.user ?? a.label, a.role])).toEqual([[ID.userBob, "owner"], ["City of Miami Beach", "oversight"]]);
    expect(state.db.hoa_responsibilities_files!.filter((f) => f.hoa_responsibilities_id === id)).toHaveLength(1);
  });

  it("patch moves status only between active and disputed, and stamps who verified", async () => {
    await expect(call("patch", { params: { id: ID.jobBank }, body: { orgId: ORG, status: "retired" } })).rejects.toMatchObject({ statusCode: 400 });
    await expect(call("patch", { params: { id: ID.jobBank }, body: { orgId: ORG, assignees: [] } })).rejects.toMatchObject({ statusCode: 400 });
    as(PERSONAS.editor);
    const res = await call("patch", { params: { id: ID.jobBank }, body: { orgId: ORG, last_verified: "2026-11-14" } });
    expect(res.changed).toEqual(["last_verified"]);
    expect(state.db.hoa_responsibilities!.find((j) => j.id === ID.jobBank)).toMatchObject({ last_verified: "2026-11-14", last_verified_by: PERSONAS.editor.userId });
    expect(activity()[0].label).toBe("Verified Reconciles bank statements");
  });

  it("retire ends open rows the day before and freezes their names", async () => {
    await call("retire", VALID.retire);
    expect(state.db.hoa_responsibilities!.find((j) => j.id === ID.jobPest)!.status).toBe("retired");
    expect(assignees(ID.jobPest)[0]).toMatchObject({ end_date: "2026-11-19", holder_name: "Acme Pest" });
    await expect(call("retire", VALID.retire)).rejects.toMatchObject({ statusCode: 409 });
  });

  it("add opens a row beside the others, once", async () => {
    await call("add", VALID.add);
    expect(assignees(ID.jobBank).map((a) => a.team ?? a.office)).toEqual(["treasurer", ID.teamGrounds]);
    await expect(call("add", VALID.add)).rejects.toMatchObject({ statusCode: 409 });
    expect(activity()[0].label).toBe("Grounds added on Reconciles bank statements");
  });

  it("correct never changes the holder, and never ends an open row", async () => {
    await expect(call("correct", { params: { id: ID.aBank }, body: { orgId: ORG, office: "president" } })).rejects.toMatchObject({ statusCode: 400 });
    await expect(call("correct", { params: { id: ID.aBank }, body: { orgId: ORG, end_date: "2026-11-01" } })).rejects.toMatchObject({ statusCode: 409 });
    await expect(call("correct", { params: { id: ID.aOldSuper }, body: { orgId: ORG, end_date: "2024-01-01" } })).rejects.toMatchObject({ statusCode: 400 });
    const res = await call("correct", { params: { id: ID.aOldSuper }, body: { orgId: ORG, end_date: "2026-10-12", role: "performs" } });
    expect(res.changed.sort()).toEqual(["end_date", "role"]);
    expect(activity()[0]).toMatchObject({ label: "Corrected Old super on Hurricane prep and shutdown (role and end date)" });
    expect(activity()[0].metadata.before).toEqual({ role: "owner", end_date: "2026-10-11" });
  });

  it("apply-template is additive and idempotent on title", async () => {
    const first = await call("template", VALID.template);
    // Four seed titles are already there: bank statements, pest control, hurricane prep, keys (retired rows count too).
    expect(first).toEqual({ created: 41, skipped: 4 });
    const second = await call("template", VALID.template);
    expect(second).toEqual({ created: 0, skipped: 45 });
    expect(state.db.hoa_responsibilities!.filter((j) => j.organization === ORG)).toHaveLength(5 + 41);
    expect(state.db.hoa_responsibilities!.filter((j) => j.organization === OTHER)).toHaveLength(1);
    await expect(call("template", { body: { orgId: ORG, template: "texas_hoa" } })).rejects.toMatchObject({ statusCode: 400 });
  });

  it("there is no delete route for a job or a holder row", async () => {
    const { readdirSync } = await import("node:fs");
    const { join } = await import("node:path");
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(join(dir, d.name)) : [d.name]));
    expect(walk(join(process.cwd(), "core/server/api/org/responsibilities")).filter((f) => f.includes(".delete."))).toEqual([]);
  });
});

describe("the PDF", () => {
  it("carries the as-of date in the header and groups by category", async () => {
    as(PERSONAS.board);
    const e = ev(VALID.pdf);
    const body = await handlers.pdf!(e);
    expect(String(body)).toBe("%PDF-fake");
    expect(e.__headers["Content-Type"]).toBe("application/pdf");
    expect(e.__headers["Content-Disposition"]).toContain("responsibilities-1033-lenox-2026-11-01.pdf");
    expect(pdfDoc.subtitle).toBe("As of November 1, 2026");
    expect(pdfDoc.head).toEqual(["Job", "Who", "Cadence", "Basis", "Last verified"]);
    expect(pdfDoc.sections.map((s: any) => s.title)).toEqual(["Finance", "Building", "Mechanical and safety", "Compliance and records", "People and community"]);
    const finance = pdfDoc.sections[0].body;
    expect(finance[0]).toEqual(["Reconciles bank statements", "Treasurer (Ann Lee)", "Monthly", "Contract: Management agreement §4", "October 1, 2026"]);
    const mech = pdfDoc.sections[2].body;
    expect(mech.find((r: string[]) => r[0] === "Hurricane prep and shutdown")[1]).toBe("");
    expect(JSON.stringify(pdfDoc)).not.toContain("Old pool heater");
  });

  it("is refused to an owner", async () => {
    as(PERSONAS.owner);
    await expect(call("pdf", VALID.pdf)).rejects.toMatchObject({ statusCode: 403 });
  });
});

it("uuid helper makes valid ids", () => {
  expect(uuid(5)).toMatch(/^[0-9a-f-]{36}$/);
});
