/**
 * Governing documents: the read routes (docs/plan-governing-docs.md §5).
 *
 * The real handlers and guards on a MemoryDirectus holding the real 1033 Lenox
 * seed, loaded by the same import code the script uses, plus the things a
 * member must never see: a draft document, a document in review, an OCR-draft
 * provision, a suggested AI flag, a dismissed flag, and another community's
 * documents.
 *
 * Acceptance criteria covered (spec §9): 2 (search, through the route), 3
 * (By-Law 3.5 verbatim), 4 (By-Law 6.5's flag), 5 (open questions), 6 (links),
 * 7 (members never see drafts or unconfirmed suggestions).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { H3Event } from "h3";
import { MemoryDirectus } from "./support/memory-directus";
import { C, LENOX_PROVISION_LINKS, applyImportPlan, buildImportPlan, type ImportStore } from "../../scripts/lib/governing-import";

const h = vi.hoisted(() => ({ session: null as any, query: {} as any, params: {} as any }));

vi.mock("@directus/sdk", async () => (await import("./support/email-queue-memory")).sdkDescriptors);
vi.stubGlobal("defineEventHandler", (fn: unknown) => fn);
vi.stubGlobal("createError", (e: any) => Object.assign(new Error(e.message), e));

// Nitro auto-imports these in the app; the guards call them as globals.
const adminAuth = await import("#core/server/utils/admin-auth");
const managerAccess = await import("#core/server/utils/manager-access");
vi.stubGlobal("checkAdminAccess", adminAuth.checkAdminAccess);
vi.stubGlobal("checkMembership", adminAuth.checkMembership);
vi.stubGlobal("getManagerGrants", managerAccess.getManagerGrants);

type Handler = (event: H3Event) => Promise<any>;
const routes = {
  documents: (await import("#core/server/api/governing/documents.get")).default as Handler,
  document: (await import("#core/server/api/governing/documents/[id].get")).default as Handler,
  provision: (await import("#core/server/api/governing/provisions/[id].get")).default as Handler,
  search: (await import("#core/server/api/governing/search.get")).default as Handler,
  overview: (await import("#core/server/api/governing/overview.get")).default as Handler,
};

const event = {} as H3Event;
const ROLE = { appAdmin: "role-app-admin", hoaAdmin: "role-hoa-admin", pm: "role-pm", member: "role-member" };
const ORG = "org-lenox";
const OTHER_ORG = "org-other";

const SEED = resolve(__dirname, "../../docs/governing-docs/seed");
const json = (f: string) => JSON.parse(readFileSync(resolve(SEED, f), "utf8"));
const seedProvisions = json("provisions.json") as Array<{ id: string; text: string }>;
const seedFlags = json("statute_flags.json");
const plan = buildImportPlan(json("manifest.json"), seedProvisions as any, seedFlags, { links: LENOX_PROVISION_LINKS });

let db: MemoryDirectus;
const idOf = (collection: string, sourceKey: string) => db.all(collection, { source_key: sourceKey })[0]!.id as string;

async function seed() {
  db = new MemoryDirectus();
  const store: ImportStore = {
    findOne: async (c, match) => (db.all(c, match)[0] as any) ?? null,
    create: async (c, data) => (await db.request({ op: "createItem", collection: c, data })).id,
    update: async (c, id, data) => void (await db.request({ op: "updateItem", collection: c, id, data })),
  };
  await applyImportPlan(store, ORG, plan);

  // What a member must not see.
  db.seed(C.documents, [
    { id: "doc-draft", organization: ORG, title: "DRAFT Rules Upload", kind: "rules", status: "draft", sort: 90 },
    { id: "doc-review", organization: ORG, title: "INREVIEW Amendment", kind: "amendment", status: "in_review", sort: 91 },
    { id: "doc-other", organization: OTHER_ORG, title: "OTHERORG Declaration", kind: "declaration", status: "published", sort: 1 },
  ]);
  db.seed(C.provisions, [
    { id: "prov-draft", organization: ORG, document: "doc-draft", citation: "Rule 1", heading: "Draftonly", text: "zebracorn draft text about proxies", review_state: "ocr_draft", sort: 1 },
    { id: "prov-review", organization: ORG, document: "doc-review", citation: "2026 Amend. ¶1", heading: "Reviewonly", text: "zebracorn in review", review_state: "reviewed", sort: 1 },
    { id: "prov-ocr", organization: ORG, document: idOf(C.documents, "bylaws"), citation: "By-Law 99", heading: "Ocronly", text: "zebracorn unreviewed scan", review_state: "ocr_draft", sort: 999 },
    { id: "prov-other", organization: OTHER_ORG, document: "doc-other", citation: "Decl. 1", heading: "Otherorg", text: "zebracorn other community", review_state: "reviewed", sort: 1 },
  ]);
  const bylaw65 = idOf(C.provisions, "bylaws:6.5");
  const reference = db.all(C.references, { code: "718.111(11)(h)" })[0]!.id;
  db.seed(C.flags, [
    { id: "flag-suggested", organization: ORG, topic: "SUGGESTED by the model", relationship: "counsel_review", severity: "high", status: "suggested", origin: "ai_suggested", statute_rule: "unconfirmed" },
    { id: "flag-dismissed", organization: ORG, topic: "DISMISSED by an admin", relationship: "counsel_review", severity: "high", status: "dismissed", origin: "ai_suggested", statute_rule: "dismissed" },
    { id: "flag-on-draft", organization: ORG, topic: "CONFIRMED but on a draft", relationship: "statute_controls", severity: "high", status: "confirmed", origin: "curated" },
  ]);
  db.seed(C.flagProvisions, [
    { flag: "flag-suggested", provision: bylaw65, sort: 1 },
    { flag: "flag-dismissed", provision: bylaw65, sort: 1 },
    { flag: "flag-on-draft", provision: "prov-draft", sort: 1 },
  ]);
  db.seed(C.flagReferences, [{ flag: "flag-suggested", reference, sort: 1 }]);
  db.seed(C.links, [{ id: "link-draft", organization: ORG, from_provision: "prov-draft", to_provision: bylaw65, type: "amends", note: null }]);

  // Original files: one on a published document, one on a draft, one in another community.
  db.seed("hoa_governing_sources", [
    { id: "src-bylaws", organization: ORG, document: idOf(C.documents, "bylaws"), file: "file-bylaws", is_recorded_copy: true, is_authoritative: true, notes: null, page_count: 12 },
    { id: "src-draft", organization: ORG, document: "doc-draft", file: "file-draftscan", is_recorded_copy: false, is_authoritative: false, notes: "DRAFT scan", page_count: 3 },
    { id: "src-other", organization: OTHER_ORG, document: "doc-other", file: "file-otherscan", is_recorded_copy: true, is_authoritative: true, notes: null, page_count: 1 },
  ]);
  db.seed("directus_files", [
    { id: "file-bylaws", filename_download: "bylaws-recorded.pdf", type: "application/pdf", filesize: 2048 },
    { id: "file-draftscan", filename_download: "DRAFT-upload.pdf", type: "application/pdf", filesize: 1024 },
    { id: "file-otherscan", filename_download: "OTHERORG.pdf", type: "application/pdf", filesize: 1024 },
  ]);

  db.seed("hoa_members", [
    { id: "m-admin", user: "u-admin", organization: ORG, role: ROLE.hoaAdmin, status: "active" },
    { id: "m-board", user: "u-board", organization: ORG, role: ROLE.member, status: "active" },
    { id: "m-pm-docs", user: "u-pm-docs", organization: ORG, role: ROLE.pm, status: "active", manager_permissions: { documents: true } },
    { id: "m-pm-plain", user: "u-pm-plain", organization: ORG, role: ROLE.pm, status: "active", manager_permissions: { violations: true } },
    { id: "m-member", user: "u-member", organization: ORG, role: ROLE.member, status: "active" },
    { id: "m-former-board", user: "u-former-board", organization: ORG, role: ROLE.member, status: "active" },
    { id: "m-inactive", user: "u-inactive", organization: ORG, role: ROLE.member, status: "inactive" },
    { id: "m-elsewhere", user: "u-elsewhere", organization: OTHER_ORG, role: ROLE.hoaAdmin, status: "active" },
  ]);
  db.seed("hoa_board_members", [
    { hoa_member: "m-board", status: "published", title: "director", term_start: null, term_end: null, sort: 1 },
    { hoa_member: "m-former-board", status: "published", title: "president", term_start: "2020-01-01", term_end: "2021-01-01", sort: 1 },
  ]);
}

const as = (userId: string | null, role = ROLE.member) => {
  h.session = userId ? { user: { id: userId, role } } : null;
};
const call = (route: Handler, opts: { query?: any; params?: any } = {}) => {
  // The organization arrives in the query here, as it does for a caller whose
  // session has none selected, so an outsider naming this community is tested too.
  h.query = { orgId: ORG, ...(opts.query ?? {}) };
  h.params = opts.params ?? {};
  return route(event);
};

beforeEach(async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  await seed();
  as("u-member");
  vi.stubGlobal("getUserSession", async () => h.session ?? {});
  vi.stubGlobal("getQuery", () => h.query);
  vi.stubGlobal("getRouterParam", (_e: unknown, k: string) => h.params[k]);
  vi.stubGlobal("getTypedDirectus", () => ({
    request: async (op: any) => (op.op === "readFiles" ? db.all("directus_files", op.query?.filter) : db.request(op)),
  }));
  vi.stubGlobal("useRuntimeConfig", () => ({
    public: {
      directusRoleAppAdmin: ROLE.appAdmin,
      directusRoleHoaAdmin: ROLE.hoaAdmin,
      directusRolePropertyManager: ROLE.pm,
      directusRoleMember: ROLE.member,
    },
  }));
});

const MANAGERS: Array<[string, () => void]> = [
  ["an HOA Admin", () => as("u-admin")],
  ["a current board member", () => as("u-board")],
  ["a property manager with the documents grant", () => as("u-pm-docs")],
  ["an App Admin", () => as("u-staff", ROLE.appAdmin)],
];
const READERS: Array<[string, () => void]> = [
  ["a member", () => as("u-member")],
  ["a property manager without the documents grant", () => as("u-pm-plain")],
  ["a member whose board term has ended", () => as("u-former-board")],
];
const OUTSIDERS: Array<[string, () => void, number]> = [
  ["someone signed out", () => as(null), 401],
  ["an admin of another community", () => as("u-elsewhere"), 403],
  ["a member whose membership is inactive", () => as("u-inactive"), 403],
  ["a signed-in user with no membership", () => as("u-nobody"), 403],
];

// ── Guards ───────────────────────────────────────────────────────────────────

describe("governing routes — who gets in", () => {
  for (const [who, become, status] of OUTSIDERS) {
    it(`${who} is refused by every route (${status}) before any governing row is read`, async () => {
      become();
      for (const [name, route] of Object.entries(routes)) {
        db.ops.length = 0;
        await expect(call(route, { params: { id: "x" }, query: { q: "proxies" } }), name).rejects.toMatchObject({ statusCode: status });
        expect(db.ops.filter((op) => /^hoa_(governing|statute)/.test(op.collection)), name).toEqual([]);
      }
    });
  }

  it("needs an organization", async () => {
    h.query = {};
    h.params = {};
    await expect(routes.documents(event)).rejects.toMatchObject({ statusCode: 400 });
  });

  for (const [who, become] of READERS) {
    it(`${who} reads but does not manage`, async () => {
      become();
      expect((await call(routes.documents)).can_manage).toBe(false);
    });
  }
  for (const [who, become] of MANAGERS) {
    it(`${who} manages`, async () => {
      become();
      expect((await call(routes.documents)).can_manage).toBe(true);
    });
  }
});

// ── Criterion 7 ──────────────────────────────────────────────────────────────

describe("governing routes — members never see drafts or unconfirmed suggestions (criterion 7)", () => {
  const HIDDEN = /DRAFT|INREVIEW|OTHERORG|Draftonly|Reviewonly|Ocronly|Otherorg|zebracorn|SUGGESTED|DISMISSED|CONFIRMED but on a draft|unconfirmed|prov-draft|prov-review|prov-ocr|doc-draft|doc-review|flag-suggested|flag-dismissed|flag-on-draft|link-draft|src-draft|src-other|file-draftscan|file-otherscan/;

  for (const [who, become] of READERS) {
    it(`${who}: no route's answer contains any of it`, async () => {
      become();
      const bylaws = idOf(C.documents, "bylaws");
      const answers = [
        await call(routes.documents),
        await call(routes.document, { params: { id: bylaws } }),
        await call(routes.provision, { params: { id: idOf(C.provisions, "bylaws:6.5") } }),
        await call(routes.overview),
        await call(routes.search, { query: { q: "zebracorn" } }),
        await call(routes.search, { query: { q: "proxies" } }),
        await call(routes.search, { query: { q: "Rule 1" } }),
        await call(routes.search, { query: { hasFlags: "true" } }),
        await call(routes.search, { query: { relationship: "counsel_review" } }),
      ];
      // A search answer echoes the query, so only its results are checked.
      for (const answer of answers) expect(JSON.stringify(answer.results ?? answer)).not.toMatch(HIDDEN);
      expect(answers[4].results).toEqual([]);
      // The original of a published document does reach them, from both routes that carry it.
      for (const answer of [answers[1], answers[2]]) {
        expect(answer.sources).toEqual([
          expect.objectContaining({ id: "src-bylaws", file: "file-bylaws", filename: "bylaws-recorded.pdf", page_count: 12, is_recorded_copy: true, is_authoritative: true }),
        ]);
      }
    });

    it(`${who}: asking for a hidden document or provision by id is a 404`, async () => {
      become();
      for (const id of ["doc-draft", "doc-review", "doc-other"]) {
        await expect(call(routes.document, { params: { id } })).rejects.toMatchObject({ statusCode: 404 });
      }
      for (const id of ["prov-draft", "prov-review", "prov-ocr", "prov-other"]) {
        await expect(call(routes.provision, { params: { id } })).rejects.toMatchObject({ statusCode: 404 });
      }
    });
  }

  it("a member's list is the 7 published documents and 209 provisions (criterion 1, as shown)", async () => {
    const { documents } = await call(routes.documents);
    expect(documents).toHaveLength(7);
    expect(documents.reduce((n: number, d: any) => n + d.provision_count, 0)).toBe(209);
    expect((await call(routes.overview)).provision_count).toBe(209);
  });

  it("a member's counts leave out suggested and dismissed flags", async () => {
    const overview = await call(routes.overview);
    expect(overview.flag_count).toBe(43);
    expect(overview.by_relationship.counsel_review).toBe(10);
  });

  for (const [who, become] of MANAGERS) {
    it(`${who} sees the drafts and the suggestion, but never another community's documents`, async () => {
      become();
      const { documents } = await call(routes.documents);
      expect(documents.map((d: any) => d.id)).toEqual(expect.arrayContaining(["doc-draft", "doc-review"]));
      expect(documents).toHaveLength(9);
      expect((await call(routes.document, { params: { id: "doc-draft" } })).sources.map((s: any) => s.id)).toEqual(["src-draft"]);
      const found = await call(routes.provision, { params: { id: idOf(C.provisions, "bylaws:6.5") } });
      expect(found.flags.map((f: any) => f.id)).toEqual(expect.arrayContaining(["flag-suggested", "flag-dismissed"]));
      expect((await call(routes.search, { query: { q: "zebracorn" } })).results.map((r: any) => r.provision.id).sort()).toEqual(["prov-draft", "prov-ocr", "prov-review"]);
      await expect(call(routes.document, { params: { id: "doc-other" } })).rejects.toMatchObject({ statusCode: 404 });
      await expect(call(routes.provision, { params: { id: "prov-other" } })).rejects.toMatchObject({ statusCode: 404 });
      expect((await call(routes.overview)).open_questions.map((f: any) => f.id)).not.toContain("flag-dismissed");
    });
  }
});

// ── What the routes return ───────────────────────────────────────────────────

describe("governing routes — reading", () => {
  it("By-Law 3.5 reads exactly as in provisions.json, including “Poxies” (criterion 3)", async () => {
    const found = await call(routes.provision, { params: { id: idOf(C.provisions, "bylaws:3.5") } });
    const seedText = seedProvisions.find((p) => p.id === "bylaws:3.5")!.text;
    expect(found.provision.text).toBe(seedText);
    expect(found.provision.text).toContain("Poxies may be made");
    expect(found.citation).toBe("By-Law 3.5, O.R. Book 9640, Page 300");
    expect(found.document.title).toBe("By-Laws");
    expect(found.previous.citation).toBe("By-Law 3.4");
    expect(found.next.citation).toBe("By-Law 3.6");
  });

  it("the document view returns every provision's text unchanged, in order", async () => {
    const { provisions, document } = await call(routes.document, { params: { id: idOf(C.documents, "bylaws") } });
    const expected = seedProvisions.filter((p) => p.id.startsWith("bylaws:"));
    expect(provisions.map((p: any) => p.text)).toEqual(expected.map((p) => p.text));
    expect(document.or_book).toBe("9640");
  });

  it("By-Law 6.5 shows a statute_controls flag citing 718.111(11)(h) with link and edition (criterion 4)", async () => {
    const found = await call(routes.provision, { params: { id: idOf(C.provisions, "bylaws:6.5") } });
    expect(found.flags).toHaveLength(1);
    const [flag] = found.flags;
    const seedFlag = seedFlags.flags.find((f: any) => f.provision_ids.includes("bylaws:6.5"));
    expect(flag.relationship).toBe("statute_controls");
    expect(flag.severity).toBe("high");
    expect(flag.statute_rule).toBe(seedFlag.statute_rule);
    expect(flag.document_rule).toBe(seedFlag.document_rule);
    expect(flag.references).toHaveLength(1);
    expect(flag.references[0].code).toBe("718.111(11)(h)");
    expect(flag.references[0].url).toBe(seedFlags._meta.sources["718.111"].url);
    expect(flag.references[0].url).toMatch(/^https:\/\//);
    expect(flag.references[0].edition).toBe(seedFlags._meta.sources["718.111"].edition);
    expect(flag.references[0].checked_on).toBe(seedFlags._meta.verified_on);
  });

  it("the overview lists the counsel_review flags as open questions (criterion 5)", async () => {
    const overview = await call(routes.overview);
    const expected = seedFlags.flags.filter((f: any) => f.relationship === "counsel_review").map((f: any) => f.topic);
    expect(overview.open_questions.map((f: any) => f.topic).sort()).toEqual([...expected].sort());
    expect(overview.open_questions.every((f: any) => f.provisions.length > 0 && f.provisions[0].citation)).toBe(true);
    expect(overview.by_relationship).toEqual({ counsel_review: 10, statute_controls: 8, statute_supplements: 15, document_controls: 4, consistent: 6 });
  });

  it("shows the amendment chain: 1978 ¶7 → Declaration 11, and the leasing conflict (criterion 6)", async () => {
    const decl11 = await call(routes.provision, { params: { id: idOf(C.provisions, "decl:11") } });
    expect(decl11.links).toEqual([expect.objectContaining({ type: "amends", direction: "to", other: expect.objectContaining({ citation: "1978 Amend. ¶7" }) })]);
    expect(decl11.children.map((c: any) => c.citation)).toEqual(["Decl. 11.1", "Decl. 11.2", "Decl. 11.3", "Decl. 11.4"]);

    const ban = await call(routes.provision, { params: { id: idOf(C.provisions, "amend-1978:¶6") } });
    expect(ban.links).toEqual([expect.objectContaining({ type: "conflicts_with", direction: "from", other: expect.objectContaining({ citation: "1994 Amend. ¶1" }) })]);

    const amendment = await call(routes.document, { params: { id: idOf(C.documents, "amend-1978") } });
    expect(amendment.amends.title).toBe("Declaration of Condominium");
    const declaration = await call(routes.document, { params: { id: idOf(C.documents, "decl") } });
    expect(declaration.amended_by).toHaveLength(3);
  });

  it("search through the route: proxies → By-Law 3.5; By-Law 6.5 and fidelity → the bond provision (criterion 2)", async () => {
    const first = async (q: string) => (await call(routes.search, { query: { q } })).results[0];
    expect((await first("proxies")).provision.citation).toBe("By-Law 3.5");
    expect((await first("By-Law 6.5")).provision.citation).toBe("By-Law 6.5");
    const fidelity = await first("fidelity");
    expect(fidelity.provision.citation).toBe("By-Law 6.5");
    expect(fidelity.citation).toBe("By-Law 6.5, O.R. Book 9640, Page 308");
    expect(fidelity.flags).toEqual([expect.objectContaining({ relationship: "statute_controls", severity: "high" })]);
  });

  it("ignores a relationship or severity that is not one of the known values", async () => {
    const { results } = await call(routes.search, { query: { q: "fidelity", relationship: "yes", severity: "catastrophic" } });
    expect(results[0].provision.citation).toBe("By-Law 6.5");
  });
});
