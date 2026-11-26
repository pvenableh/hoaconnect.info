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
  createFolder: (data: any) => ({ op: "createFolder", collection: "directus_folders", data }),
}));

vi.stubGlobal("defineEventHandler", (fn: unknown) => fn);

const { resolveStorageContext, storageAccessFrom, storageContextSpecs } = await import("#core/server/utils/org-storage");
const settings = (await import("#core/server/api/org/storage/settings.post")).default as unknown as (e: H3Event) => Promise<any>;

const ORG = "org-lenox";
const HOA_ADMIN = "role-hoa-admin";
const HOA_MEMBER = "role-hoa-member";
const LENOX = { id: ORG, name: "Lenox", folder: "root-lenox", modules: { storage_browse_access: "all_members" } };
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
        const folder = db.one("directus_folders", op.id);
        if (!folder) throw new Error(`no folder ${op.id}`);
        return { ...folder };
      }
      case "readFolders":
        return db.all("directus_folders", op.query?.filter).map((f) => ({ ...f }));
      case "createFolder":
        return db.request({ op: "createItem", collection: "directus_folders", data: op.data });
      default:
        return db.request(op);
    }
  },
};

const reads = (collection: string) => db.ops.filter((o) => o.op === "readItems" && o.collection === collection);

function stubBatch() {
  const batch = memoryBatch(db, { o2m: { "hoa_members.board_member_terms": ["hoa_board_members", "hoa_member"] } });
  vi.stubGlobal("readItemsBatch", (specs: Record<string, any>) => (batches.push(Object.keys(specs)), batch(specs)));
}

beforeEach(() => {
  db = new MemoryDirectus();
  db.seed("hoa_organizations", [LENOX]);
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
