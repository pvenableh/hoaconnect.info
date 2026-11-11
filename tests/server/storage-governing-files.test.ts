/**
 * Governing files in the storage library and the general files route
 * (docs/prompts/governing-loose-ends.md, after Session 3).
 *
 * A governing original or page image carries a `governing-` description. It is
 * shown, renamed and removed only on the governing pages, which audit each
 * change, and its bytes are the record, so:
 *
 *  - the library and the general files route never list it;
 *  - rename, move, delete and optimize refuse it (409), and nothing changes;
 *  - the optimize sweep never picks it up;
 *  - deleting a folder with its contents refuses while one is inside;
 *  - every other file works as before.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { H3Event } from "h3";
import { GOVERNING_FILE_MARKER, NOT_GOVERNING_FILE } from "#core/shared/governing/files";
import { MemoryDirectus, matches } from "./support/memory-directus";

const h = vi.hoisted(() => ({ body: {} as any, fetched: [] as string[] }));

vi.mock("@directus/sdk", () => {
  const op = (name: string) => (...args: any[]) => ({ op: name, args });
  return Object.fromEntries(
    ["readFile", "readFiles", "readFolder", "readFolders", "updateFile", "deleteFile", "deleteFiles", "deleteFolder", "deleteFolders", "createFolder", "updateFolder", "uploadFiles", "importFile"].map((n) => [n, op(n)])
  );
});
vi.mock("#core/server/utils/org-storage", () => ({
  resolveStorageContext: async () => ({ orgId: "org", userId: "u-admin", isAdmin: true, canBrowseLibrary: true, storage: { rootId: "root", map: {} } }),
  assertFileInOrg: async () => {},
  assertFolderInOrg: async () => {},
  assertAdmin: () => {},
  getDescendantFolderIds: async () => ["root", "docs"],
  isWithinOrgRoot: async () => true,
  invalidateOrgStorage: () => {},
}));
vi.mock("#core/server/utils/storage-enforcement", () => ({ addOrgStorageUsage: async () => {} }));
vi.mock("#core/server/utils/image-optimize", () => ({
  isOptimizableImage: (type: string | null) => (type ?? "").startsWith("image/"),
  optimizeImageBuffer: async () => ({ optimized: false }),
}));
vi.stubGlobal("defineEventHandler", (fn: unknown) => fn);
vi.stubGlobal("createError", (e: any) => Object.assign(new Error(e.message ?? e.statusMessage), e));

type Handler = (event: H3Event) => Promise<any>;
const routes = {
  list: (await import("#core/server/api/org/storage/list.post")).default as Handler,
  file: (await import("#core/server/api/org/storage/file.post")).default as Handler,
  folder: (await import("#core/server/api/org/storage/folder.post")).default as Handler,
  optimize: (await import("#core/server/api/org/storage/optimize.post")).default as Handler,
  sweep: (await import("#core/server/api/org/storage/optimize-sweep.post")).default as Handler,
  files: (await import("#core/server/api/directus/files.post")).default as Handler,
};

let db: MemoryDirectus;
const call = (route: Handler, body: any) => {
  h.body = body;
  return route({} as H3Event);
};
const files = () => db.table("directus_files");

async function request(op: { op: string; args: any[] }): Promise<any> {
  const [a, b] = op.args;
  switch (op.op) {
    case "readFiles":
      return db.all("directus_files", a?.filter);
    case "readFile": {
      const row = db.one("directus_files", a);
      if (!row) throw Object.assign(new Error("not found"), { statusCode: 404 });
      return row;
    }
    case "updateFile":
      Object.assign(db.one("directus_files", a)!, b);
      return db.one("directus_files", a);
    case "deleteFile":
    case "deleteFiles": {
      const ids = Array.isArray(a) ? a : [a];
      files().splice(0, files().length, ...files().filter((f) => !ids.includes(f.id)));
      return null;
    }
    case "readFolders":
      return [];
    case "readFolder":
      return { id: a, name: a, parent: a === "root" ? null : "root" };
    default:
      return null;
  }
}

beforeEach(() => {
  db = new MemoryDirectus();
  h.fetched = [];
  db.seed("directus_files", [
    { id: "logo", type: "image/png", description: null, folder: "docs", uploaded_by: "u-admin", filesize: 10, title: "Logo" },
    { id: "minutes", type: "application/pdf", description: null, folder: "docs", uploaded_by: "u-admin", filesize: 20, title: "Minutes" },
    { id: "page", type: "image/jpeg", description: GOVERNING_FILE_MARKER, folder: "docs", uploaded_by: "u-static", filesize: 30, title: "1995 Amendment (page 1)" },
    { id: "original", type: "application/pdf", description: GOVERNING_FILE_MARKER, folder: "docs", uploaded_by: "u-static", filesize: 40, title: "By-Laws (original)" },
  ]);
  vi.stubGlobal("readBody", async () => h.body);
  vi.stubGlobal("getTypedDirectus", () => ({ request }));
  vi.stubGlobal("getUserDirectus", async () => ({ request }));
  vi.stubGlobal("useRuntimeConfig", () => ({ directus: { url: "http://directus.test", staticToken: "t" }, public: {} }));
  vi.stubGlobal("fetch", async (url: string) => {
    h.fetched.push(String(url));
    return new Response(null, { status: 404 });
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

const ids = (rows: Array<{ id: string }>) => rows.map((r) => r.id).sort();

describe("governing files in the storage library", () => {
  it("the library and the caller's own uploads never list them", async () => {
    expect(ids((await call(routes.list, { folderId: "docs" })).files)).toEqual(["logo", "minutes"]);
    db.table("directus_files").forEach((f) => (f.uploaded_by = "u-admin"));
    expect(ids((await call(routes.list, { scope: "mine" })).files)).toEqual(["logo", "minutes"]);
  });

  it("rename, move and delete refuse them with 409, and nothing changes", async () => {
    for (const fileId of ["page", "original"]) {
      for (const body of [{ action: "rename", title: "x" }, { action: "move", folderId: "root" }, { action: "delete" }]) {
        await expect(call(routes.file, { ...body, fileId })).rejects.toMatchObject({ statusCode: 409 });
      }
    }
    expect(db.one("directus_files", "page")).toMatchObject({ title: "1995 Amendment (page 1)", folder: "docs", description: GOVERNING_FILE_MARKER });
    expect(files()).toHaveLength(4);
  });

  it("other files are renamed, moved and deleted as before", async () => {
    await call(routes.file, { action: "rename", fileId: "logo", title: "Crest" });
    await call(routes.file, { action: "move", fileId: "logo", folderId: "root" });
    expect(db.one("directus_files", "logo")).toMatchObject({ title: "Crest", folder: "root" });
    await call(routes.file, { action: "delete", fileId: "minutes" });
    expect(ids(files())).toEqual(["logo", "original", "page"]);
  });

  it("a governing page image is never optimized, one at a time or in the sweep", async () => {
    await expect(call(routes.optimize, { fileId: "page" })).rejects.toMatchObject({ statusCode: 409 });
    const result = await call(routes.sweep, { offset: 0, limit: 10 });
    expect(result.processed).toBe(1);
    expect(h.fetched).toEqual(["http://directus.test/assets/logo"]);
  });

  it("deleting a folder with its contents refuses while a governing file is inside, and deletes nothing", async () => {
    await expect(call(routes.folder, { action: "delete", folderId: "docs", mode: "contents" })).rejects.toMatchObject({ statusCode: 409 });
    expect(files()).toHaveLength(4);
  });
});

describe("governing files through the general files route", () => {
  it("a list never includes them, with or without the caller's own filter", async () => {
    expect(ids(await call(routes.files, { operation: "list" }))).toEqual(["logo", "minutes"]);
    expect(ids(await call(routes.files, { operation: "list", query: { filter: { folder: { _eq: "docs" } } } }))).toEqual(["logo", "minutes"]);
  });

  it("get answers 404; update and delete answer 409 and change nothing", async () => {
    await expect(call(routes.files, { operation: "get", id: "page" })).rejects.toMatchObject({ statusCode: 404 });
    await expect(call(routes.files, { operation: "update", id: "page", data: { description: null } })).rejects.toMatchObject({ statusCode: 409 });
    await expect(call(routes.files, { operation: "delete", id: ["logo", "original"] })).rejects.toMatchObject({ statusCode: 409 });
    expect(db.one("directus_files", "page")!.description).toBe(GOVERNING_FILE_MARKER);
    expect(files()).toHaveLength(4);
  });

  it("other files work as before", async () => {
    expect((await call(routes.files, { operation: "get", id: "logo" })).title).toBe("Logo");
    await call(routes.files, { operation: "update", id: "logo", data: { title: "Crest" } });
    expect(db.one("directus_files", "logo")!.title).toBe("Crest");
    expect(await call(routes.files, { operation: "delete", id: "minutes" })).toEqual({ deleted: 1 });
  });

  it("the filter the routes use keeps a file with no description or another one, and drops a marked one", () => {
    expect(matches({ description: null }, NOT_GOVERNING_FILE)).toBe(true);
    expect(matches({ description: "support-message:m1" }, NOT_GOVERNING_FILE)).toBe(true);
    expect(matches({ description: GOVERNING_FILE_MARKER }, NOT_GOVERNING_FILE)).toBe(false);
    expect(matches({ description: "governing-upload:org:abc" }, NOT_GOVERNING_FILE)).toBe(false);
  });
});
