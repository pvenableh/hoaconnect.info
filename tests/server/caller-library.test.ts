/**
 * The app's own routes that act with the caller's Directus token check where a
 * file or folder goes, because Directus cannot (a create rule was tested on
 * production 2026-11-12 and not enforced):
 *
 *  - a folder is created or moved only under the caller's community library;
 *  - a file is moved into the caller's library, or out of every library;
 *  - an upload names a folder in the caller's library;
 *  - a meeting-file link points at one of the caller's communities' meetings;
 *  - what stays inside the caller's own community works as before.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { H3Event } from "h3";

const h = vi.hoisted(() => ({ body: {} as any, multipart: [] as any[], userOps: [] as any[] }));

// Folder tree: two communities. Lenox (the caller's) and Other.
const PARENT: Record<string, string | null> = { "root-lenox": null, "docs-lenox": "root-lenox", "root-other": null, "docs-other": "root-other" };

vi.mock("@directus/sdk", () => {
  const op = (name: string) => (...args: any[]) => ({ op: name, args });
  return Object.fromEntries(
    ["readItems", "readItem", "createItem", "updateItem", "deleteItem", "deleteItems", "aggregate", "readFiles", "readFile", "uploadFiles", "updateFile", "deleteFile", "deleteFiles", "importFile", "readFolders", "readFolder", "createFolder", "createFolders", "updateFolder", "updateFolders", "deleteFolder", "deleteFolders"].map((n) => [n, op(n)])
  );
});
vi.mock("#core/server/utils/org-storage", () => ({
  isWithinOrgRoot: async (root: string, folder: string) => {
    for (let at: string | null = folder; at; at = PARENT[at] ?? null) if (at === root) return true;
    return false;
  },
}));
vi.stubGlobal("defineEventHandler", (fn: unknown) => fn);
vi.stubGlobal("createError", (e: any) => Object.assign(new Error(e.message ?? e.statusMessage), e));
vi.stubGlobal("isRagConfigured", () => false);
vi.stubGlobal("RAG_SOURCE_COLLECTIONS", new Set());

type Handler = (event: H3Event) => Promise<any>;
const routes = {
  folders: (await import("#core/server/api/directus/folders.post")).default as Handler,
  files: (await import("#core/server/api/directus/files.post")).default as Handler,
  upload: (await import("#core/server/api/directus/files/upload.post")).default as Handler,
  items: (await import("#core/server/api/directus/items.post")).default as Handler,
};

// The app token: memberships, meetings, governing marks.
async function appRequest(op: { op: string; args: any[] }) {
  const [collection, query] = op.args;
  if (op.op === "readItems" && collection === "hoa_members") return [{ organization: { id: "org-lenox", folder: "root-lenox" } }];
  if (op.op === "readItems" && collection === "hoa_meetings") {
    const all = [{ id: "meet-lenox", organization: "org-lenox" }, { id: "meet-other", organization: "org-other" }];
    return all.filter((m) => query.filter.id._in.includes(m.id));
  }
  if (op.op === "readFiles") return []; // nothing governing
  return null;
}
// The caller's own token: record what reaches Directus.
const userClient = { request: async (op: any) => (h.userOps.push(op), { ok: true }) };

beforeEach(() => {
  h.userOps = [];
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubGlobal("readBody", async () => h.body);
  vi.stubGlobal("readMultipartFormData", async () => h.multipart);
  vi.stubGlobal("requireUserSession", async () => ({ user: { id: "u-oscar" } }));
  vi.stubGlobal("getUserSession", async () => ({ user: { id: "u-oscar" } }));
  vi.stubGlobal("getTypedDirectus", () => ({ request: appRequest }));
  vi.stubGlobal("getUserDirectus", async () => userClient);
  vi.stubGlobal("getPublicDirectus", () => userClient);
});

const call = (route: Handler, body: any) => {
  h.body = body;
  return route({} as H3Event);
};
const ops = () => h.userOps.map((o) => o.op);

describe("folders", () => {
  it("creates a folder under the caller's own library, and refuses another community's or none", async () => {
    await call(routes.folders, { operation: "create", data: { name: "Bylaws", parent: "docs-lenox" } });
    expect(ops()).toEqual(["createFolder"]);
    for (const parent of ["root-other", "docs-other", null, undefined]) {
      await expect(call(routes.folders, { operation: "create", data: { name: "x", parent } })).rejects.toMatchObject({ statusCode: 403 });
    }
    await expect(call(routes.folders, { operation: "createMultiple", data: [{ name: "a", parent: "docs-lenox" }, { name: "b", parent: "docs-other" }] })).rejects.toMatchObject({ statusCode: 403 });
    expect(ops()).toEqual(["createFolder"]);
  });

  it("a rename is not a move; a move goes only inside the caller's library", async () => {
    await call(routes.folders, { operation: "update", id: "docs-lenox", data: { name: "Documents" } });
    await call(routes.folders, { operation: "update", id: "docs-lenox", data: { parent: "root-lenox" } });
    await expect(call(routes.folders, { operation: "update", id: "docs-lenox", data: { parent: "root-other" } })).rejects.toMatchObject({ statusCode: 403 });
    await expect(call(routes.folders, { operation: "updateMultiple", ids: ["docs-lenox"], data: { parent: "docs-other" } })).rejects.toMatchObject({ statusCode: 403 });
    expect(ops()).toEqual(["updateFolder", "updateFolder"]);
  });
});

describe("files", () => {
  it("a file moves into the caller's library or out of every library, never into another community's", async () => {
    await call(routes.files, { operation: "update", id: "f1", data: { folder: "docs-lenox" } });
    await call(routes.files, { operation: "update", id: "f1", data: { folder: null } });
    await call(routes.files, { operation: "update", id: "f1", data: { title: "Renamed" } });
    await expect(call(routes.files, { operation: "update", id: "f1", data: { folder: "docs-other" } })).rejects.toMatchObject({ statusCode: 403 });
    expect(ops()).toEqual(["updateFile", "updateFile", "updateFile"]);
  });

  it("an upload into another community's folder is refused before anything is stored", async () => {
    const part = (name: string, value: string) => ({ name, data: Buffer.from(value) });
    h.multipart = [{ name: "file", filename: "a.png", type: "image/png", data: Buffer.from([1]) }, part("folder", "docs-other")];
    await expect(call(routes.upload, {})).rejects.toMatchObject({ statusCode: 403 });
    h.multipart = [{ name: "file", filename: "a.png", type: "image/png", data: Buffer.from([1]) }, part("folder", "docs-lenox")];
    await call(routes.upload, {});
    expect(ops()).toEqual(["uploadFiles"]);
  });
});

describe("meeting files", () => {
  it("a link to the caller's own community's meeting works; another community's is refused", async () => {
    await call(routes.items, { collection: "hoa_meetings_files", operation: "create", data: { hoa_meetings_id: "meet-lenox", directus_files_id: "f1" } });
    await expect(
      call(routes.items, { collection: "hoa_meetings_files", operation: "create", data: { hoa_meetings_id: "meet-other", directus_files_id: "f1" } })
    ).rejects.toMatchObject({ statusCode: 403 });
    await expect(
      call(routes.items, { collection: "hoa_meetings_files", operation: "update", id: "link-1", data: { hoa_meetings_id: "meet-nowhere" } })
    ).rejects.toMatchObject({ statusCode: 403 });
    // Other collections are not this check's business.
    await call(routes.items, { collection: "hoa_announcements", operation: "create", data: { title: "Pool" } });
    expect(ops()).toEqual(["createItem", "createItem"]);
  });
});
