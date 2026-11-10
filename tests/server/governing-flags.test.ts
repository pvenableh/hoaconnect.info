/**
 * Governing documents: statute-flag status changes and the freshness view
 * (docs/prompts/governing-docs.md, Session 2; spec §5 and §7).
 *
 * The real handlers and guards on a MemoryDirectus. Proves: only managers may
 * change a flag's status; each change writes one audit row with the status
 * before and after; a flag's wording and every provision's text are never
 * written; a member sees a flag only once it is confirmed, and stops seeing it
 * when it is dismissed; the stale-reference list is for managers only.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { H3Event } from "h3";
import { MemoryDirectus } from "./support/memory-directus";
import { referenceStaleness, staleReferences } from "#core/shared/governing/flags";

const h = vi.hoisted(() => ({ session: null as any, query: {} as any, params: {} as any, body: {} as any }));

vi.mock("@directus/sdk", async () => (await import("./support/email-queue-memory")).sdkDescriptors);
vi.stubGlobal("defineEventHandler", (fn: unknown) => fn);
vi.stubGlobal("createError", (e: any) => Object.assign(new Error(e.message), e));

const adminAuth = await import("#core/server/utils/admin-auth");
const managerAccess = await import("#core/server/utils/manager-access");
vi.stubGlobal("checkAdminAccess", adminAuth.checkAdminAccess);
vi.stubGlobal("checkMembership", adminAuth.checkMembership);
vi.stubGlobal("getManagerGrants", managerAccess.getManagerGrants);

type Handler = (event: H3Event) => Promise<any>;
const routes = {
  status: (await import("#core/server/api/governing/flags/[id]/status.post")).default as Handler,
  provision: (await import("#core/server/api/governing/provisions/[id].get")).default as Handler,
  overview: (await import("#core/server/api/governing/overview.get")).default as Handler,
};

const event = {} as H3Event;
const ROLE = { appAdmin: "role-app-admin", hoaAdmin: "role-hoa-admin", pm: "role-pm", member: "role-member" };
const ORG = "org-lenox";
const OTHER_ORG = "org-other";
const TEXT = "Poxies shall be in writing.";
const RULE = "Statute rule, as curated.";

let db: MemoryDirectus;
let writes: any[];

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  db = new MemoryDirectus();
  writes = [];
  db.seed("hoa_governing_documents", [{ id: "doc", organization: ORG, title: "By-Laws", kind: "bylaws", status: "published", sort: 1 }]);
  db.seed("hoa_governing_provisions", [
    { id: "prov", organization: ORG, document: "doc", citation: "By-Law 3.5", heading: "Proxies", text: TEXT, review_state: "reviewed", sort: 1 },
  ]);
  db.seed("hoa_statute_references", [
    { id: "ref-fresh", jurisdiction: "FL", code: "718.112(2)(b)", url: "https://example.test/718.112", edition: "2026", checked_on: "2026-11-01" },
    { id: "ref-old", jurisdiction: "FL", code: "718.111(11)(h)", url: "https://example.test/718.111", edition: "2024", checked_on: "2024-01-15" },
    { id: "ref-recheck", jurisdiction: "FL", code: "718.303", url: "https://example.test/718.303", edition: "not shown on page; recheck", checked_on: "2026-11-01" },
    { id: "ref-never", jurisdiction: "FL", code: "718.116", url: null, edition: "2026", checked_on: null },
  ]);
  const flag = (id: string, status: string, relationship = "statute_controls", organization = ORG) => ({
    id, organization, topic: `Topic ${id}`, document_rule: "Document rule.", statute_rule: RULE, statute_citation: "718.112(2)(b)",
    relationship, severity: "high", status, origin: status === "suggested" ? "ai_suggested" : "curated", confirmed_by: null, confirmed_at: null,
  });
  db.seed("hoa_statute_flags", [
    flag("flag-suggested", "suggested"),
    flag("flag-confirmed", "confirmed", "counsel_review"),
    flag("flag-dismissed", "dismissed"),
    flag("flag-other", "suggested", "statute_controls", OTHER_ORG),
  ]);
  db.seed("hoa_statute_flags_provisions", [
    { flag: "flag-suggested", provision: "prov", sort: 1 },
    { flag: "flag-confirmed", provision: "prov", sort: 1 },
    { flag: "flag-dismissed", provision: "prov", sort: 1 },
  ]);
  db.seed("hoa_statute_flags_references", [
    { flag: "flag-suggested", reference: "ref-never", sort: 1 },
    { flag: "flag-confirmed", reference: "ref-fresh", sort: 1 },
    { flag: "flag-confirmed", reference: "ref-old", sort: 2 },
    { flag: "flag-confirmed", reference: "ref-recheck", sort: 3 },
    { flag: "flag-dismissed", reference: "ref-old", sort: 1 },
  ]);
  db.seed("hoa_members", [
    { id: "m-admin", user: "u-admin", organization: ORG, role: ROLE.hoaAdmin, status: "active" },
    { id: "m-board", user: "u-board", organization: ORG, role: ROLE.member, status: "active" },
    { id: "m-pm-docs", user: "u-pm-docs", organization: ORG, role: ROLE.pm, status: "active", manager_permissions: { documents: true } },
    { id: "m-pm-plain", user: "u-pm-plain", organization: ORG, role: ROLE.pm, status: "active", manager_permissions: { violations: true } },
    { id: "m-member", user: "u-member", organization: ORG, role: ROLE.member, status: "active" },
    { id: "m-elsewhere", user: "u-elsewhere", organization: OTHER_ORG, role: ROLE.hoaAdmin, status: "active" },
  ]);
  db.seed("hoa_board_members", [{ hoa_member: "m-board", status: "published", title: "director", term_start: null, term_end: null, sort: 1 }]);

  vi.stubGlobal("getUserSession", async () => h.session ?? {});
  vi.stubGlobal("getQuery", () => h.query);
  vi.stubGlobal("getRouterParam", (_e: unknown, k: string) => h.params[k]);
  vi.stubGlobal("readBody", async () => h.body);
  vi.stubGlobal("getTypedDirectus", () => ({
    request: async (op: any) => {
      if (op.op === "readFiles") return [];
      if (/^(create|update|delete)/.test(op.op)) writes.push(op);
      return db.request(op);
    },
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

const as = (userId: string | null, role = ROLE.member) => {
  h.session = userId ? { user: { id: userId, role, first_name: "Pat", last_name: "Admin", email: `${userId}@example.test` } } : null;
};
const setStatus = (id: string, status: unknown, reason?: string) => {
  h.query = { orgId: ORG };
  h.params = { id };
  h.body = { status, reason };
  return routes.status(event);
};
const read = (route: Handler, query: Record<string, string> = {}) => {
  h.query = { orgId: ORG, ...query };
  h.params = { id: "prov" };
  return route(event);
};
const audit = () => db.table("hoa_governing_audit_log");
const flagRow = (id: string) => db.all("hoa_statute_flags", { id })[0]!;

const MANAGERS: Array<[string, () => void]> = [
  ["an HOA Admin", () => as("u-admin")],
  ["a current board member", () => as("u-board")],
  ["a property manager with the documents grant", () => as("u-pm-docs")],
  ["an App Admin", () => as("u-staff", ROLE.appAdmin)],
];
const NOT_MANAGERS: Array<[string, () => void, number]> = [
  ["a member", () => as("u-member"), 403],
  ["a property manager without the documents grant", () => as("u-pm-plain"), 403],
  ["an admin of another community", () => as("u-elsewhere"), 403],
  ["someone signed out", () => as(null), 401],
];

describe("statute flags — status changes", () => {
  it.each(MANAGERS)("%s may confirm a suggested flag; one audit row records before and after", async (_n, signIn) => {
    signIn();
    expect(await setStatus("flag-suggested", "confirmed", "  Checked against the 2026 edition  ")).toMatchObject({ status: "confirmed", changed: true });
    const row = flagRow("flag-suggested");
    expect(row.status).toBe("confirmed");
    expect(row.confirmed_by).toBe(h.session.user.id);
    expect(row.confirmed_at).toBeTruthy();
    expect(audit()).toHaveLength(1);
    expect(audit()[0]).toMatchObject({
      action: "flag_status",
      organization: ORG,
      flag: "flag-suggested",
      actor_user: h.session.user.id,
      actor_name: "Pat Admin",
      reason: "Checked against the 2026 edition",
      before: { status: "suggested" },
      after: { status: "confirmed" },
    });
    expect(audit()[0]!.occurred_at).toBeTruthy();
  });

  it.each(NOT_MANAGERS)("%s is refused, and nothing is written", async (_n, signIn, code) => {
    signIn();
    await expect(setStatus("flag-suggested", "confirmed")).rejects.toMatchObject({ statusCode: code });
    expect(flagRow("flag-suggested").status).toBe("suggested");
    expect(writes).toHaveLength(0);
  });

  it("walks confirmed → counsel_confirmed → dismissed → confirmed, an audit row each time", async () => {
    as("u-admin");
    await setStatus("flag-confirmed", "counsel_confirmed");
    expect(flagRow("flag-confirmed").status).toBe("counsel_confirmed");
    await setStatus("flag-confirmed", "dismissed");
    expect(flagRow("flag-confirmed")).toMatchObject({ status: "dismissed", confirmed_by: null, confirmed_at: null });
    await setStatus("flag-confirmed", "confirmed");
    expect(audit().map((a: any) => [a.before.status, a.after.status])).toEqual([
      ["confirmed", "counsel_confirmed"],
      ["counsel_confirmed", "dismissed"],
      ["dismissed", "confirmed"],
    ]);
  });

  it("refuses an unknown status, `suggested`, and a move the current status does not allow", async () => {
    as("u-admin");
    await expect(setStatus("flag-suggested", "approved")).rejects.toMatchObject({ statusCode: 400 });
    await expect(setStatus("flag-confirmed", "suggested")).rejects.toMatchObject({ statusCode: 400 });
    // Counsel sign-off is for a flag the board has already confirmed.
    await expect(setStatus("flag-suggested", "counsel_confirmed")).rejects.toMatchObject({ statusCode: 409 });
    await expect(setStatus("flag-dismissed", "counsel_confirmed")).rejects.toMatchObject({ statusCode: 409 });
    expect(writes).toHaveLength(0);
  });

  it("setting the status a flag already has changes nothing and writes no audit row", async () => {
    as("u-admin");
    expect(await setStatus("flag-confirmed", "confirmed")).toMatchObject({ changed: false });
    expect(writes).toHaveLength(0);
  });

  it("a flag of another community, or one that does not exist, is a 404", async () => {
    as("u-admin");
    await expect(setStatus("flag-other", "confirmed")).rejects.toMatchObject({ statusCode: 404 });
    await expect(setStatus("flag-nope", "confirmed")).rejects.toMatchObject({ statusCode: 404 });
    expect(flagRow("flag-other").status).toBe("suggested");
    expect(writes).toHaveLength(0);
  });

  it("writes only the status fields: never a flag's wording, never a provision", async () => {
    as("u-admin");
    await setStatus("flag-suggested", "confirmed");
    await setStatus("flag-suggested", "dismissed");
    const flagWrites = writes.filter((w) => w.collection === "hoa_statute_flags");
    expect(flagWrites).toHaveLength(2);
    for (const w of flagWrites) expect(Object.keys(w.data).sort()).toEqual(["confirmed_at", "confirmed_by", "status"]);
    expect(writes.map((w) => w.collection).sort()).toEqual(["hoa_governing_audit_log", "hoa_governing_audit_log", "hoa_statute_flags", "hoa_statute_flags"]);
    expect(flagRow("flag-suggested").statute_rule).toBe(RULE);
    expect(db.all("hoa_governing_provisions", { id: "prov" })[0]!.text).toBe(TEXT);
  });
});

describe("statute flags — what a member sees follows the status", () => {
  const memberFlagIds = async () => {
    as("u-member");
    return ((await read(routes.provision)).flags as any[]).map((f) => f.id);
  };

  it("a suggested flag reaches a member only once confirmed, and leaves again when dismissed", async () => {
    expect(await memberFlagIds()).toEqual(["flag-confirmed"]);
    as("u-admin");
    await setStatus("flag-suggested", "confirmed");
    expect((await memberFlagIds()).sort()).toEqual(["flag-confirmed", "flag-suggested"]);
    as("u-admin");
    await setStatus("flag-suggested", "dismissed");
    expect(await memberFlagIds()).toEqual(["flag-confirmed"]);
  });

  it("a counsel-confirmed flag stays visible to a member", async () => {
    as("u-admin");
    await setStatus("flag-confirmed", "counsel_confirmed");
    as("u-member");
    const flags = (await read(routes.provision)).flags as any[];
    expect(flags.map((f) => [f.id, f.status])).toEqual([["flag-confirmed", "counsel_confirmed"]]);
  });

  it("the provision route returns each flag with rule, citation, link, edition and checked date", async () => {
    as("u-member");
    const [flag] = (await read(routes.provision)).flags as any[];
    expect(flag).toMatchObject({ relationship: "counsel_review", severity: "high", statute_rule: RULE, statute_citation: "718.112(2)(b)" });
    expect(flag.references[0]).toMatchObject({ code: "718.112(2)(b)", url: "https://example.test/718.112", edition: "2026", checked_on: "2026-11-01" });
  });
});

describe("statute flags — overview and freshness", () => {
  it("a manager gets the waiting and dismissed flags and the stale references; a member gets none of them", async () => {
    as("u-admin");
    const mine = await read(routes.overview);
    expect(mine.suggested.map((f: any) => f.id)).toEqual(["flag-suggested"]);
    expect(mine.dismissed.map((f: any) => f.id)).toEqual(["flag-dismissed"]);
    expect(mine.open_questions.map((f: any) => f.id)).toEqual(["flag-confirmed"]);
    // ref-fresh is current; ref-old is cited by a live flag once (the dismissed flag does not count).
    const stale = Object.fromEntries(mine.stale_references.map((s: any) => [s.reference.id, [s.reason, s.flag_count]]));
    expect(stale).toEqual({ "ref-never": ["never_checked", 1], "ref-old": ["old", 1], "ref-recheck": ["recheck_noted", 1] });
    expect(mine.stale_after_days).toBe(365);

    as("u-member");
    const theirs = await read(routes.overview);
    expect(theirs.suggested).toEqual([]);
    expect(theirs.dismissed).toEqual([]);
    expect(theirs.stale_references).toEqual([]);
    expect(theirs.open_questions.map((f: any) => f.id)).toEqual(["flag-confirmed"]);
    expect(theirs.flag_count).toBe(1);
    expect(JSON.stringify(theirs)).not.toContain("flag-suggested");
  });

  it("the age is a parameter: with a long enough window the old reference is no longer stale", async () => {
    as("u-admin");
    const wide = await read(routes.overview, { staleAfterDays: "3650" });
    expect(wide.stale_references.map((s: any) => s.reference.id).sort()).toEqual(["ref-never", "ref-recheck"]);
    expect((await read(routes.overview, { staleAfterDays: "nonsense" })).stale_after_days).toBe(365);
  });

  it("referenceStaleness: fresh, old, never checked, and marked for recheck", () => {
    const today = new Date("2026-11-10T00:00:00Z");
    expect(referenceStaleness({ edition: "2026", checked_on: "2026-11-10" }, today)).toBeNull();
    expect(referenceStaleness({ edition: "2026", checked_on: "2025-11-09" }, today)).toBe("old");
    expect(referenceStaleness({ edition: "2026", checked_on: "2025-11-09" }, today, 400)).toBeNull();
    expect(referenceStaleness({ edition: "2026", checked_on: null }, today)).toBe("never_checked");
    expect(referenceStaleness({ edition: "2019; recheck", checked_on: "2026-11-10" }, today)).toBe("recheck_noted");
    expect(staleReferences([], today)).toEqual([]);
  });
});
