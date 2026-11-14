/**
 * resolveNotified(orgId, area) — members with the manager hat and notify on
 * for the area, else the community's admins (docs/spec-role-context.md).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@directus/sdk", () => ({
  readItems: (collection: string, query?: any) => ({ op: "read", collection, query }),
}));

const LENOX = "org-lenox";
const LINCOLN = "org-lincoln";
const HOA_ADMIN = "r-hoa-admin";
const PM = "r-pm";
const MEMBER = "r-member";

type Row = Record<string, any>;
let rows: Row[];
let reads: any[];

const directus = {
  request: async (op: any) => {
    reads.push(op);
    const f = op.query?.filter ?? {};
    return rows.filter(
      (r) => (!f.organization || r.organization === f.organization._eq) && (!f.status || r.status === f.status._eq)
    );
  },
};

const admin = (id: string, user: string | null, org = LENOX, extra: Row = {}): Row => ({
  id,
  user,
  organization: org,
  status: "active",
  role: HOA_ADMIN,
  ...extra,
});
const manager = (id: string, user: string, areas: Row, extra: Row = {}): Row => ({
  id,
  user,
  organization: LENOX,
  status: "active",
  role: PM,
  is_manager: true,
  manager_areas: areas,
  ...extra,
});

beforeEach(() => {
  reads = [];
  rows = [];
  vi.stubGlobal("getTypedDirectus", () => directus);
  vi.stubGlobal("useRuntimeConfig", () => ({
    public: { directusRoleAppAdmin: "r-app-admin", directusRoleHoaAdmin: HOA_ADMIN, directusRolePropertyManager: PM },
  }));
  vi.stubGlobal("serverRoleIds", () => ({ appAdmin: "r-app-admin", propertyManager: PM, adminRoleIds: [HOA_ADMIN] }));
});

const load = async () => (await import("#core/server/utils/resolve-notified")).resolveNotified;

describe("resolveNotified", () => {
  it("the managers with notify on for the area", async () => {
    rows = [
      admin("m-admin", "u-admin"),
      manager("m-acc", "u-acc", { billing: { work: false, notify: true } }, { manager_title: "Accounting" }),
      manager("m-mnt", "u-mnt", { inquiries: { work: true, notify: true }, billing: { work: false, notify: false } }),
    ];
    const resolve = await load();
    expect(await resolve(LENOX, "billing")).toEqual({ userIds: ["u-acc"], memberIds: ["m-acc"], via: "area" });
    expect(await resolve(LENOX, "inquiries")).toEqual({ userIds: ["u-mnt"], memberIds: ["m-mnt"], via: "area" });
  });

  it("the admins when nobody has the switch", async () => {
    rows = [
      admin("m-a1", "u-a1"),
      admin("m-a2", "u-a2"),
      manager("m-mnt", "u-mnt", { inquiries: { work: true, notify: true } }),
      { id: "m-owner", user: "u-owner", organization: LENOX, status: "active", role: MEMBER },
    ];
    const resolve = await load();
    expect(await resolve(LENOX, "vendors")).toEqual({ userIds: ["u-a1", "u-a2"], memberIds: ["m-a1", "m-a2"], via: "admins" });
  });

  it("legacy rows (before the schema script) fall back to the admins", async () => {
    rows = [admin("m-admin", "u-admin"), { id: "m-pm", user: "u-pm", organization: LENOX, status: "active", role: PM, manager_permissions: { inquiries: true } }];
    const resolve = await load();
    expect(await resolve(LENOX, "inquiries")).toEqual({ userIds: ["u-admin"], memberIds: ["m-admin"], via: "admins" });
  });

  it("never another community's members", async () => {
    rows = [
      admin("m-lincoln-admin", "u-lincoln-admin", LINCOLN),
      { ...manager("m-lincoln-pm", "u-lincoln-pm", { billing: { work: false, notify: true } }), organization: LINCOLN },
      admin("m-lenox-admin", "u-lenox-admin"),
    ];
    const resolve = await load();
    const res = await resolve(LENOX, "billing");
    expect(res).toEqual({ userIds: ["u-lenox-admin"], memberIds: ["m-lenox-admin"], via: "admins" });
    expect(reads[0].query.filter).toEqual({ organization: { _eq: LENOX }, status: { _eq: "active" } });
    expect(reads[0].query.fields).toEqual(["*"]);
  });

  it("the hat switched off, or no login, never counts", async () => {
    rows = [
      admin("m-admin", "u-admin"),
      admin("m-admin-nologin", null),
      manager("m-off", "u-off", { billing: { work: false, notify: true } }, { is_manager: false }),
    ];
    const resolve = await load();
    expect(await resolve(LENOX, "billing")).toEqual({ userIds: ["u-admin"], memberIds: ["m-admin"], via: "admins" });
  });

  it("an admin who is also a notified manager is addressed once", async () => {
    rows = [admin("m-both", "u-both", LENOX, { is_manager: true, manager_areas: { billing: { notify: true } } }), admin("m-other", "u-other")];
    const resolve = await load();
    expect(await resolve(LENOX, "billing")).toEqual({ userIds: ["u-both"], memberIds: ["m-both"], via: "area" });
  });

  it("nobody at all: an empty list, still via admins", async () => {
    rows = [];
    const resolve = await load();
    expect(await resolve(LENOX, "billing")).toEqual({ userIds: [], memberIds: [], via: "admins" });
  });

  it("refuses an unknown area or a missing org", async () => {
    const resolve = await load();
    await expect(resolve(LENOX, "nope" as any)).rejects.toMatchObject({ statusCode: 400 });
    await expect(resolve("", "billing")).rejects.toMatchObject({ statusCode: 400 });
  });
});
