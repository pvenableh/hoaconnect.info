/**
 * Governing documents: the change history route (GET /api/governing/audit).
 * The real handler and guard on a MemoryDirectus. Proves only managers read
 * the trail, a caller gets their own organization's rows only, rows come
 * newest first with before and after as stored, and the route writes nothing.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { H3Event } from "h3";
import { MemoryDirectus } from "./support/memory-directus";

const h = vi.hoisted(() => ({ session: null as any, query: {} as any }));

vi.mock("@directus/sdk", async () => (await import("./support/email-queue-memory")).sdkDescriptors);
vi.stubGlobal("defineEventHandler", (fn: unknown) => fn);
vi.stubGlobal("createError", (e: any) => Object.assign(new Error(e.message), e));

const adminAuth = await import("#core/server/utils/admin-auth");
const managerAccess = await import("#core/server/utils/manager-access");
vi.stubGlobal("checkAdminAccess", adminAuth.checkAdminAccess);
vi.stubGlobal("checkMembership", adminAuth.checkMembership);
vi.stubGlobal("getManagerGrants", managerAccess.getManagerGrants);

const route = (await import("#core/server/api/governing/audit.get")).default as (event: H3Event) => Promise<any>;

const event = {} as H3Event;
const ROLE = { appAdmin: "role-app-admin", hoaAdmin: "role-hoa-admin", pm: "role-pm", member: "role-member" };
const ORG = "org-lenox";
const OTHER_ORG = "org-other";
const TEXT_BEFORE = "Poxies shall be in writing,  filed. \n";

let db: MemoryDirectus;
let writes: any[];

beforeEach(() => {
  db = new MemoryDirectus();
  writes = [];
  db.seed("hoa_organizations", [{ id: ORG }]);
  db.seed("hoa_governing_audit_log", [
    { id: "a1", organization: ORG, occurred_at: "2026-11-01T10:00:00Z", action: "publish", document: "doc-1", summary: "Published By-Laws", actor_name: "Pat Admin", actor_email: "pat@example.test", before: { status: "draft" }, after: { status: "published" } },
    { id: "a3", organization: ORG, occurred_at: "2026-11-03T10:00:00Z", action: "text_edit", document: "doc-1", provision: "p-1", summary: "Edited the text of By-Law 3.5", reason: "Typo in the import", before: { text: TEXT_BEFORE }, after: { text: "Proxies" } },
    { id: "a2", organization: ORG, occurred_at: "2026-11-02T10:00:00Z", action: "flag_status", document: "doc-2", flag: "f-1", summary: "Dismissed a flag", before: { status: "confirmed" }, after: { status: "dismissed" } },
    { id: "x1", organization: OTHER_ORG, occurred_at: "2026-11-04T10:00:00Z", action: "publish", document: "doc-x", summary: "Elsewhere" },
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
  vi.stubGlobal("getTypedDirectus", () => ({
    request: async (op: any) => {
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
  h.session = userId ? { user: { id: userId, role } } : null;
};
const call = (query: Record<string, string> = {}) => {
  h.query = { orgId: ORG, ...query };
  return route(event);
};

describe("who may read the change history", () => {
  it("refuses a signed-out caller, a member, a manager without the documents grant and another community's admin", async () => {
    as(null);
    await expect(call()).rejects.toMatchObject({ statusCode: 401 });
    as("u-member");
    await expect(call()).rejects.toMatchObject({ statusCode: 403 });
    as("u-pm-plain", ROLE.pm);
    await expect(call()).rejects.toMatchObject({ statusCode: 403 });
    as("u-elsewhere", ROLE.hoaAdmin);
    await expect(call()).rejects.toMatchObject({ statusCode: 403 });
  });

  it("answers an admin, a board member and a manager with the documents grant", async () => {
    for (const [user, role] of [["u-admin", ROLE.hoaAdmin], ["u-board", ROLE.member], ["u-pm-docs", ROLE.pm]] as const) {
      as(user, role);
      expect((await call()).entries).toHaveLength(3);
    }
  });
});

describe("what it returns", () => {
  beforeEach(() => as("u-admin", ROLE.hoaAdmin));

  it("gives this community's rows only, newest first, with before and after as stored", async () => {
    const { entries, next_before } = await call();
    expect(entries.map((e: any) => e.id)).toEqual(["a3", "a2", "a1"]);
    expect(next_before).toBeNull();
    expect(entries[0]).toMatchObject({
      action: "text_edit", document: "doc-1", provision: "p-1", reason: "Typo in the import",
      before: { text: TEXT_BEFORE }, after: { text: "Proxies" },
    });
    expect(entries[2]).toMatchObject({ actor_name: "Pat Admin", actor_email: "pat@example.test" });
  });

  it("filters by document, by action and by the page cursor", async () => {
    expect((await call({ document: "doc-2" })).entries.map((e: any) => e.id)).toEqual(["a2"]);
    expect((await call({ action: "publish" })).entries.map((e: any) => e.id)).toEqual(["a1"]);
    expect((await call({ before: "2026-11-03T10:00:00Z" })).entries.map((e: any) => e.id)).toEqual(["a2", "a1"]);
    // Another community's document id finds nothing.
    expect((await call({ document: "doc-x" })).entries).toEqual([]);
  });

  it("writes nothing", async () => {
    await call();
    expect(writes).toEqual([]);
  });
});
