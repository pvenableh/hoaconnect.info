/**
 * The storage routes' context (resolveStorageContext) reads the caller's
 * active membership and the org row as ONE readItemsBatch: Directus serves
 * requests one after another, so two reads in a row cost two round trips.
 *
 *  - the batch carries exactly the two keys, with the same filters as before;
 *  - a failed batch reads them one by one and gives the same answer;
 *  - a caller with no active membership is refused, and in the one-by-one
 *    reads the org is never read for them;
 *  - storageAccessFrom (the pure standing) is unit-tested on its own.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { H3Event } from "h3";
import { MemoryDirectus } from "./support/memory-directus";
import { memoryBatch } from "./support/memory-batch";

vi.mock("@directus/sdk", async () => ({
  ...(await import("./support/email-queue-memory")).sdkDescriptors,
  readFolder: (id: string, query?: any) => ({ op: "readFolder", collection: "directus_folders", id, query }),
  readFolders: (query?: any) => ({ op: "readFolders", collection: "directus_folders", query }),
  readFiles: (query?: any) => ({ op: "readFiles", collection: "directus_files", query }),
  createFolder: (data: any) => ({ op: "createFolder", collection: "directus_folders", data }),
}));

vi.stubGlobal("defineEventHandler", (fn: unknown) => fn);

const { resolveStorageContext, storageAccessFrom, storageContextSpecs } = await import("#core/server/utils/org-storage");
const settings = (await import("#core/server/api/org/storage/settings.post")).default as unknown as (e: H3Event) => Promise<any>;
const list = (await import("#core/server/api/org/storage/list.post")).default as unknown as (e: H3Event) => Promise<any>;
const meter = (await import("#core/server/api/org/storage/meter.post")).default as unknown as (e: H3Event) => Promise<any>;
const { orgStorageQuotaFrom, ORG_STORAGE_QUOTA_FIELDS } = await import("#core/server/utils/storage-enforcement");

const ORG = "org-lenox";
const HOA_ADMIN = "role-hoa-admin";
const HOA_MEMBER = "role-hoa-member";
const LENOX = {
  id: ORG,
  name: "Lenox",
  folder: "root-lenox",
  modules: { storage_browse_access: "all_members" },
  storage_used_bytes: "1024",
  storage_extra_bytes: "0",
  active_addons: null,
  is_free_account: false,
  subscription_plan: "plan-pro",
};
const ada = { id: "m-ada", user: "u-ada", organization: ORG, status: "active", role: HOA_ADMIN };
const rex = { id: "m-rex", user: "u-rex", organization: ORG, status: "inactive", role: HOA_ADMIN };
const cal = { id: "m-cal", user: "u-cal", organization: ORG, status: "active", role: HOA_MEMBER };
const event = {} as H3Event;

let db: MemoryDirectus;
let sessionUser: string | null;
let body: Record<string, unknown>;
let batches: string[][];

const client = {
  request: async (op: any) => {
    switch (op.op) {
      case "readFolder": {
        db.ops.push(op);
        const folder = db.one("directus_folders", op.id);
        if (!folder) throw new Error(`no folder ${op.id}`);
        return { ...folder };
      }
      case "readFolders":
        db.ops.push(op);
        return db.all("directus_folders", op.query?.filter).map((f) => ({ ...f }));
      case "readFiles":
        db.ops.push(op);
        return db.all("directus_files").filter((f) => f.folder === op.query?.filter?._and?.[0]?.folder?._eq).map((f) => ({ ...f }));
      case "createFolder":
        return db.request({ op: "createItem", collection: "directus_folders", data: op.data });
      default:
        return db.request(op);
    }
  },
};

const reads = (collection: string) => db.ops.filter((o) => o.op === "readItems" && o.collection === collection);

function stubBatch() {
  const batch = memoryBatch(db, {
    m2o: { "hoa_organizations.subscription_plan": "subscription_plans", "hoa_organizations.folder": "directus_folders" },
    o2m: { "hoa_members.board_member_terms": ["hoa_board_members", "hoa_member"] },
  });
  vi.stubGlobal("readItemsBatch", (specs: Record<string, any>) => (batches.push(Object.keys(specs)), batch(specs)));
}

beforeEach(() => {
  db = new MemoryDirectus();
  db.seed("hoa_organizations", [LENOX]);
  db.seed("subscription_plans", [{ id: "plan-pro", slug: "pro", max_storage_gb: 50, is_contact_only: false }]);
  db.seed("directus_folders", [{ id: "root-lenox", name: "Lenox", parent: null }]);
  db.seed("hoa_members", [ada, rex, cal]);
  db.seed("hoa_board_members", [{ id: "t-cal", status: "published", hoa_member: "m-cal", term_start: null, term_end: null }]);
  sessionUser = "u-cal";
  body = { orgId: ORG };
  batches = [];
  vi.stubGlobal("useRuntimeConfig", () => ({
    public: { directusRoleHoaAdmin: HOA_ADMIN, directusRoleAppAdmin: "role-app-admin" },
  }));
  vi.stubGlobal("getTypedDirectus", () => client);
  vi.stubGlobal("getUserSession", async () => (sessionUser ? { user: { id: sessionUser } } : {}));
  vi.stubGlobal("readBody", async () => body);
  stubBatch();
});

describe("storage context — one batch", () => {
  it("reads the membership and the org in one batch with its keys", async () => {
    const ctx = await resolveStorageContext(event);
    expect(batches).toEqual([["sc_member", "sc_org"]]);
    expect(reads("hoa_members")).toHaveLength(1);
    expect(reads("hoa_members")[0].query.filter).toEqual({ user: { _eq: "u-cal" }, organization: { _eq: ORG }, status: { _eq: "active" } });
    expect(ctx).toMatchObject({ userId: "u-cal", orgId: ORG, isAdmin: false, isBoard: true, browseAccess: "all_members", canBrowseLibrary: true });
    expect(await settings(event)).toEqual({ browseAccess: "all_members" });
  });

  it("gives the same answer when the batch fails, reading one by one", async () => {
    // (MemoryDirectus's plain readItems does not expand dotted terms, so the
    // caller here is the admin, whose standing needs none.)
    sessionUser = "u-ada";
    const batched = await resolveStorageContext(event);
    vi.stubGlobal("readItemsBatch", async () => {
      throw new Error("GraphQL down");
    });
    db.ops.length = 0;
    expect(await resolveStorageContext(event)).toEqual(batched);
    expect(db.ops.filter((o) => o.op === "readItems").map((o) => o.collection)).toEqual(["hoa_members", "hoa_organizations"]);
  });

  it("refuses a removed member with no rows, and one by one never reads the org for them", async () => {
    sessionUser = "u-rex";
    const refused = await settings(event).catch((e: any) => e);
    expect(refused).toMatchObject({ statusCode: 403, statusMessage: "Not a member of this organization" });
    expect(refused.data).toBeUndefined();
    vi.stubGlobal("readItemsBatch", async () => {
      throw new Error("GraphQL down");
    });
    db.ops.length = 0;
    await expect(settings(event)).rejects.toMatchObject({ statusCode: 403, statusMessage: "Not a member of this organization" });
    expect(reads("hoa_organizations")).toEqual([]);
  });

  it("asks nothing of a signed-out caller", async () => {
    sessionUser = null;
    await expect(settings(event)).rejects.toMatchObject({ statusCode: 401 });
    expect(batches).toEqual([]);
    expect(db.ops).toEqual([]);
  });

  it("reads the extra org fields a route asks for in the same spec", () => {
    const specs = storageContextSpecs("u", "o", ["modules", "storage_used_bytes"]);
    expect(specs.sc_org.fields).toEqual(["modules", "storage_used_bytes"]);
    expect(specs.sc_member.limit).toBe(1);
  });
});

describe("POST /api/org/storage/meter — the quota rides in the context's batch", () => {
  const PRO = { usedBytes: 1024, limitBytes: 50 * 1024 ** 3, remainingBytes: 50 * 1024 ** 3 - 1024, plan: "pro" };

  it("reads the membership, the org and its plan in one batch, and nothing else of Directus", async () => {
    expect(await meter(event)).toEqual(PRO);
    expect(batches).toEqual([["sc_member", "sc_org"]]);
    expect(reads("hoa_organizations")[0].query.fields).toEqual(["modules", ...ORG_STORAGE_QUOTA_FIELDS]);
    expect(db.ops.filter((o) => o.op === "readItem")).toEqual([]);
  });

  it("refuses a removed member with no quota in the answer", async () => {
    sessionUser = "u-rex";
    const refused = await meter(event).catch((e: any) => e);
    expect(refused).toMatchObject({ statusCode: 403 });
    expect(refused.data).toBeUndefined();
    expect(refused.usedBytes).toBeUndefined();
  });

  it("with no org row, reads the quota by id as before", async () => {
    const getOrg = vi.fn(async () => ({ ...LENOX, subscription_plan: { slug: "pro", max_storage_gb: 50, is_contact_only: false } }));
    const real = client.request;
    client.request = async (op: any) => (op.op === "readItem" ? getOrg() : real(op));
    try {
      vi.stubGlobal("readItemsBatch", async () => ({ sc_member: [{ ...cal, board_member_terms: [] }], sc_org: [] }));
      expect(await meter(event)).toEqual(PRO);
      expect(getOrg).toHaveBeenCalledTimes(1);
    } finally {
      client.request = real;
    }
  });
});

describe("POST /api/org/storage/list — the root's crumb rides in the context's batch", () => {
  const folderOps = () => db.ops.filter((o) => ["readFolder", "readFolders", "readFiles"].includes(o.op)).map((o) => (o.op === "readFolder" ? `readFolder ${o.id}` : o.op));

  let docsId: string;

  beforeEach(async () => {
    // ensureOrgStorage caches the layout per process: make sure this db has its Documents folder.
    docsId = (await resolveStorageContext(event)).storage.map.documents!;
    if (!db.one("directus_folders", docsId)) db.seed("directus_folders", [{ id: docsId, name: "Documents", parent: "root-lenox" }]);
    db.seed("directus_files", [{ id: "file-1", title: "Rules", folder: "root-lenox", description: null }]);
    db.ops.length = 0;
    batches.length = 0;
  });

  it("lists the root with one batch and the two listing reads: no folder read for the breadcrumb", async () => {
    const res = await list(event);
    expect(batches).toEqual([["sc_member", "sc_org"]]);
    expect(reads("hoa_organizations")[0].query.fields).toEqual(["modules", "folder.id", "folder.name"]);
    expect(folderOps().sort()).toEqual(["readFiles", "readFolders"]);
    expect(res).toMatchObject({ mode: "folder", folderId: "root-lenox", isRoot: true, breadcrumb: [{ id: "root-lenox", name: "Lenox" }] });
    expect(res.files.map((f: any) => f.id)).toEqual(["file-1"]);
  });

  it("a subfolder reads only itself up the breadcrumb, and the same answer comes when the batch fails", async () => {
    const docs = { id: docsId };
    body = { orgId: ORG, folderId: docs.id };
    const batched = await list(event);
    expect(folderOps().filter((o) => o.startsWith("readFolder "))).toEqual([`readFolder ${docs.id}`]);
    expect(batched.breadcrumb).toEqual([
      { id: "root-lenox", name: "Lenox" },
      { id: docs.id, name: "Documents" },
    ]);
    // Without the batch the root's name is read, as before.
    vi.stubGlobal("readItemsBatch", async () => {
      throw new Error("GraphQL down");
    });
    db.ops.length = 0;
    expect(await list(event)).toEqual(batched);
    expect(folderOps().filter((o) => o.startsWith("readFolder "))).toEqual([`readFolder ${docs.id}`, "readFolder root-lenox"]);
  });

  it("a member the tier keeps out is refused with no folders or files read", async () => {
    await db.request({ op: "updateItem", collection: "hoa_organizations", id: ORG, data: { modules: { storage_browse_access: "admins_only" } } });
    db.ops.length = 0;
    const refused = await list(event).catch((e: any) => e);
    expect(refused).toMatchObject({ statusCode: 403 });
    expect(refused.folders).toBeUndefined();
    expect(folderOps()).toEqual([]);
  });
});

describe("orgStorageQuotaFrom", () => {
  it("plan bytes plus extra; unlimited when contact-only; the free floor without a plan", () => {
    expect(
      orgStorageQuotaFrom({ storage_used_bytes: "10", storage_extra_bytes: "5", subscription_plan: { slug: "pro", max_storage_gb: "2.00", is_contact_only: false } })
    ).toEqual({ usedBytes: 10, limitBytes: 2 * 1024 ** 3 + 5, remainingBytes: 2 * 1024 ** 3 - 5, plan: "pro" });
    expect(orgStorageQuotaFrom({ storage_used_bytes: 7, subscription_plan: { slug: "ent", is_contact_only: true } })).toEqual({
      usedBytes: 7,
      limitBytes: null,
      remainingBytes: null,
      plan: "ent",
    });
    expect(orgStorageQuotaFrom({ subscription_plan: { slug: "mid", max_storage_gb: null } }).limitBytes).toBe(50 * 1024 ** 3);
    expect(orgStorageQuotaFrom(null)).toEqual({ usedBytes: 0, limitBytes: 5 * 1024 ** 3, remainingBytes: 5 * 1024 ** 3, plan: null });
  });
});

describe("storageAccessFrom", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-01T00:00:00Z"));
  });

  const term = (term_start: string | null, term_end: string | null) => ({ term_start, term_end });

  it("an admin role browses whatever the tier", () => {
    expect(storageAccessFrom({ role: HOA_ADMIN }, { modules: { storage_browse_access: "admins_only" } })).toEqual({
      isAdmin: true,
      isBoard: false,
      browseAccess: "admins_only",
      canBrowseLibrary: true,
    });
    expect(storageAccessFrom({ role: { id: "role-app-admin" } }, null).isAdmin).toBe(true);
  });

  it("a board term counts only inside its dates, and only under admins_board", () => {
    const board = { role: HOA_MEMBER, board_member_terms: [term("2026-01-01", "2026-12-31")] };
    expect(storageAccessFrom(board, { modules: {} })).toMatchObject({ isBoard: true, browseAccess: "admins_board", canBrowseLibrary: true });
    expect(storageAccessFrom(board, { modules: { storage_browse_access: "admins_only" } }).canBrowseLibrary).toBe(false);
    const ended = { role: HOA_MEMBER, board_member_terms: [term("2025-01-01", "2025-12-31")] };
    expect(storageAccessFrom(ended, { modules: {} })).toMatchObject({ isBoard: false, canBrowseLibrary: false });
    const future = { role: HOA_MEMBER, board_member_terms: [term("2026-07-01", null)] };
    expect(storageAccessFrom(future, null).isBoard).toBe(false);
  });

  it("all_members lets any member browse; an unknown tier reads as admins_board", () => {
    expect(storageAccessFrom({ role: HOA_MEMBER }, { modules: { storage_browse_access: "all_members" } }).canBrowseLibrary).toBe(true);
    expect(storageAccessFrom({ role: HOA_MEMBER }, { modules: { storage_browse_access: "everyone" } }).browseAccess).toBe("admins_board");
  });
});
