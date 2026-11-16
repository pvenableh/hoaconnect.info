/**
 * Where a file or folder sits is the app's to write. Directus cannot check a
 * placement (a create rule was tested on production 2026-11-12 and not
 * enforced), so no community policy writes `folder` or `parent`
 * (PLACEMENT_FIELDS); the app's routes check and place with the app's token:
 *
 *  - a folder is created or moved only inside one community library the caller
 *    belongs to, never a library's root, never into itself;
 *  - a file moves within its own community's library or out of every library,
 *    and a loose file only if the caller uploaded it;
 *  - an upload names a folder in the caller's library and is stored as theirs;
 *  - a record's file (a receipt, a lease) changes only with its record;
 *  - a meeting-file link points at one of the caller's communities' meetings;
 *  - renames stay on the caller's own token.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { H3Event } from "h3";

const h = vi.hoisted(() => ({ body: {} as any, multipart: [] as any[], userOps: [] as any[], appOps: [] as any[], alsoOther: false }));

// Folder tree: two communities. Lenox (the caller's) and Other.
const PARENT: Record<string, string | null> = {
  "root-lenox": null,
  "docs-lenox": "root-lenox",
  "sub-lenox": "docs-lenox",
  "root-other": null,
  "docs-other": "root-other",
};
// Files, read with the app's token.
const FILES: Record<string, { folder: string | null; uploaded_by: string; description?: string | null }> = {
  f1: { folder: "docs-lenox", uploaded_by: "u-someone" },
  "f-other": { folder: "docs-other", uploaded_by: "u-them" },
  "f-loose": { folder: null, uploaded_by: "u-oscar" },
  "f-loose-theirs": { folder: null, uploaded_by: "u-them" },
  "f-receipt": { folder: "docs-lenox", uploaded_by: "u-oscar", description: "record-expense-receipt" },
};

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
  forgetFolderParent: () => {},
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

// The app token: memberships, meetings, files and folders; records every write.
async function appRequest(op: { op: string; args: any[] }) {
  const [collection, query] = op.args;
  if (op.op === "readItems" && collection === "hoa_members") {
    const mine = [{ organization: { id: "org-lenox", folder: "root-lenox" } }];
    return h.alsoOther ? [...mine, { organization: { id: "org-other", folder: "root-other" } }] : mine;
  }
  if (op.op === "readItems" && collection === "hoa_meetings") {
    const all = [{ id: "meet-lenox", organization: "org-lenox" }, { id: "meet-other", organization: "org-other" }];
    return all.filter((m) => query.filter.id._in.includes(m.id));
  }
  if (op.op === "readFiles") {
    const [{ id, description }] = [Object.fromEntries(op.args[0].filter._and.map((c: any) => Object.entries(c)[0]))];
    return (id._in as string[]).filter((i) => FILES[i]?.description?.startsWith(description._starts_with)).map((i) => ({ id: i }));
  }
  if (op.op === "readFile") {
    const file = FILES[op.args[0]];
    if (!file) throw Object.assign(new Error("not found"), { statusCode: 403 });
    return { id: op.args[0], ...file };
  }
  if (op.op === "readFolder") {
    if (!(op.args[0] in PARENT)) throw Object.assign(new Error("not found"), { statusCode: 403 });
    return { id: op.args[0] };
  }
  h.appOps.push(op);
  if (op.op === "uploadFiles") return { id: "f-new", uploaded_by: "app-token" };
  return { ok: true };
}
// The caller's own token: record what reaches Directus.
const userClient = { request: async (op: any) => (h.userOps.push(op), { ok: true }) };

beforeEach(() => {
  h.userOps = [];
  h.appOps = [];
  h.alsoOther = false;
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
const appOps = () => h.appOps.map((o) => `${o.op} ${JSON.stringify(o.args.slice(o.op === "uploadFiles" ? 1 : 0))}`);

describe("folders", () => {
  it("creates a folder under the caller's own library with the app's token, and refuses another community's or none", async () => {
    await call(routes.folders, { operation: "create", data: { name: "Bylaws", parent: "docs-lenox" } });
    for (const parent of ["root-other", "docs-other", null, undefined]) {
      await expect(call(routes.folders, { operation: "create", data: { name: "x", parent } })).rejects.toMatchObject({ statusCode: 403 });
    }
    await expect(call(routes.folders, { operation: "createMultiple", data: [{ name: "a", parent: "docs-lenox" }, { name: "b", parent: "docs-other" }] })).rejects.toMatchObject({ statusCode: 403 });
    expect(ops()).toEqual([]);
    expect(appOps()).toEqual([`createFolder [{"name":"Bylaws","parent":"docs-lenox"}]`]);
  });

  it("renames on the caller's own token; moves within the library on the app's", async () => {
    await call(routes.folders, { operation: "update", id: "docs-lenox", data: { name: "Documents" } });
    await call(routes.folders, { operation: "update", id: "sub-lenox", data: { name: "Old", parent: "root-lenox" } });
    expect(h.userOps.map((o) => [o.op, o.args[1]])).toEqual([["updateFolder", { name: "Documents" }], ["updateFolder", { name: "Old" }]]);
    expect(appOps()).toEqual([`updateFolder ["sub-lenox",{"parent":"root-lenox"}]`]);
  });

  it("refuses a move into another community, of a library's root, into itself, or of a folder that isn't there", async () => {
    await expect(call(routes.folders, { operation: "update", id: "docs-lenox", data: { parent: "root-other" } })).rejects.toMatchObject({ statusCode: 403 });
    await expect(call(routes.folders, { operation: "updateMultiple", ids: ["docs-lenox"], data: { parent: "docs-other" } })).rejects.toMatchObject({ statusCode: 403 });
    await expect(call(routes.folders, { operation: "update", id: "root-lenox", data: { parent: "docs-other" } })).rejects.toMatchObject({ statusCode: 403 });
    await expect(call(routes.folders, { operation: "update", id: "docs-other", data: { parent: "docs-lenox" } })).rejects.toMatchObject({ statusCode: 403 });
    await expect(call(routes.folders, { operation: "update", id: "docs-lenox", data: { parent: "sub-lenox" } })).rejects.toMatchObject({ statusCode: 400 });
    await expect(call(routes.folders, { operation: "update", id: "gone", data: { parent: "root-lenox" } })).rejects.toMatchObject({ statusCode: 404 });
    // Someone in both communities still cannot carry a folder from one library to the other.
    h.alsoOther = true;
    await expect(call(routes.folders, { operation: "update", id: "docs-lenox", data: { parent: "root-other" } })).rejects.toMatchObject({ statusCode: 403 });
    expect(ops()).toEqual([]);
    expect(appOps()).toEqual([]);
  });
});

describe("files", () => {
  it("a file moves within its community's library or out of every library, on the app's token; a rename stays on the caller's", async () => {
    await call(routes.files, { operation: "update", id: "f1", data: { folder: "root-lenox" } });
    await call(routes.files, { operation: "update", id: "f1", data: { folder: null } });
    await call(routes.files, { operation: "update", id: "f1", data: { title: "Renamed" } });
    await call(routes.files, { operation: "update", id: "f-loose", data: { folder: "docs-lenox", title: "Mine" } });
    expect(h.userOps.map((o) => [o.op, o.args[1]])).toEqual([["updateFile", { title: "Renamed" }], ["updateFile", { title: "Mine" }]]);
    expect(appOps()).toEqual([
      `updateFile ["f1",{"folder":"root-lenox"}]`,
      `updateFile ["f1",{"folder":null}]`,
      `updateFile ["f-loose",{"folder":"docs-lenox"}]`,
    ]);
  });

  it("never into or out of another community's library, nor someone else's loose file", async () => {
    await expect(call(routes.files, { operation: "update", id: "f1", data: { folder: "docs-other" } })).rejects.toMatchObject({ statusCode: 403 });
    await expect(call(routes.files, { operation: "update", id: "f-other", data: { folder: "docs-lenox" } })).rejects.toMatchObject({ statusCode: 403 });
    await expect(call(routes.files, { operation: "update", id: "f-loose-theirs", data: { folder: "docs-lenox" } })).rejects.toMatchObject({ statusCode: 403 });
    await expect(call(routes.files, { operation: "update", id: "f-loose", data: { folder: "docs-other" } })).rejects.toMatchObject({ statusCode: 403 });
    await expect(call(routes.files, { operation: "update", id: "nope", data: { folder: "docs-lenox" } })).rejects.toMatchObject({ statusCode: 404 });
    h.alsoOther = true;
    await expect(call(routes.files, { operation: "update", id: "f1", data: { folder: "docs-other" } })).rejects.toMatchObject({ statusCode: 403 });
    expect(ops()).toEqual([]);
    expect(appOps()).toEqual([]);
  });

  it("a record's file changes only with its record", async () => {
    for (const body of [
      { operation: "update", id: "f-receipt", data: { title: "x" } },
      { operation: "update", id: "f-receipt", data: { folder: "root-lenox" } },
      { operation: "delete", id: "f-receipt" },
    ]) {
      await expect(call(routes.files, body)).rejects.toMatchObject({ statusCode: 409 });
    }
    expect(ops()).toEqual([]);
    expect(appOps()).toEqual([]);
  });

  it("an upload goes into the caller's library with the app's token, as theirs; another community's folder is refused first", async () => {
    const part = (name: string, value: string) => ({ name, data: Buffer.from(value) });
    h.multipart = [{ name: "file", filename: "a.png", type: "image/png", data: Buffer.from([1]) }, part("folder", "docs-other")];
    await expect(call(routes.upload, {})).rejects.toMatchObject({ statusCode: 403 });
    h.multipart = [{ name: "file", filename: "a.png", type: "image/png", data: Buffer.from([1]) }, part("folder", "docs-lenox")];
    const stored = await call(routes.upload, {});
    expect(stored).toMatchObject({ id: "f-new", uploaded_by: "u-oscar" });
    expect(ops()).toEqual([]);
    expect(h.appOps.map((o) => o.op)).toEqual(["uploadFiles", "updateFile"]);
    expect(h.appOps[1].args).toEqual(["f-new", { uploaded_by: "u-oscar" }]);
  });

  it("sends the folder and title before the file, which Directus needs to file it", async () => {
    // Directus stores the file with only the fields read before it; with the
    // file first, every upload landed in no folder and a PDF came back with no id.
    const part = (name: string, value: string) => ({ name, data: Buffer.from(value) });
    h.multipart = [{ name: "file", filename: "rules.pdf", type: "application/pdf", data: Buffer.from("%PDF-") }, part("title", "Rules"), part("folder", "docs-lenox")];
    await call(routes.upload, {});
    const form = h.appOps[0].args[0] as FormData;
    expect([...form.keys()]).toEqual(["title", "folder", "file"]);
    expect(form.get("folder")).toBe("docs-lenox");
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
