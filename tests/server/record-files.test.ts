/**
 * A record's file (an expense's receipt, a lease's signed copy) is filed in its
 * community's library, in Records › Expense receipts or Leases, with the
 * `record-` mark (core/shared/records/files.ts). Filed with its community, but
 * not a library document:
 *
 *  - the library shows the Records folder to the community's admins only;
 *  - the storage library's file actions refuse it (409): it changes with its record;
 *  - the asset proxy does not serve a marked photo as an ordinary image: the
 *    record's rule decides, as for a PDF.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { H3Event } from "h3";

const h = vi.hoisted(() => ({
  body: {} as any,
  ctx: null as any,
  receipt: null as boolean | null,
  member: false,
}));

// The library: root › Documents, root › Records › Expense receipts.
const FOLDERS: Record<string, { name: string; parent: string | null }> = {
  root: { name: "Lenox", parent: null },
  docs: { name: "Documents", parent: "root" },
  records: { name: "Records", parent: "root" },
  receipts: { name: "Expense receipts", parent: "records" },
};
const ID = {
  bylaws: "00000000-0000-4000-8000-000000000b01",
  receipt: "00000000-0000-4000-8000-000000000b02",
  photo: "00000000-0000-4000-8000-000000000b03",
};
const FILES: Record<string, any> = {
  [ID.bylaws]: { id: ID.bylaws, folder: "docs", type: "application/pdf", description: null, uploaded_by: "u-admin", title: "Bylaws" },
  [ID.receipt]: { id: ID.receipt, folder: "receipts", type: "image/jpeg", description: "record-expense-receipt", uploaded_by: "u-admin", title: "Acme 114" },
  [ID.photo]: { id: ID.photo, folder: "docs", type: "image/jpeg", description: null, uploaded_by: "u-admin", title: "Pool" },
};

vi.mock("@directus/sdk", () => {
  const op = (name: string) => (...args: any[]) => ({ op: name, args });
  return Object.fromEntries(["readFile", "readFiles", "readFolder", "readFolders", "updateFile", "deleteFile"].map((n) => [n, op(n)]));
});
vi.mock("#core/server/utils/org-storage", () => {
  const within = async (root: string, folder: string | null | undefined) => {
    for (let at = folder ?? null; at; at = FOLDERS[at]?.parent ?? null) if (at === root) return true;
    return false;
  };
  return {
    resolveStorageContext: async () => h.ctx,
    assertFolderInOrg: async () => {},
    assertFileInOrg: async () => {},
    isWithinOrgRoot: within,
    getDescendantFolderIds: async () => Object.keys(FOLDERS),
  };
});
vi.mock("#core/server/utils/storage-enforcement", () => ({ addOrgStorageUsage: async () => {} }));
vi.mock("#core/server/utils/governing-sources", () => ({ mayOpenGoverningSourceFile: async () => null }));
vi.mock("#core/server/utils/lease-documents", () => ({ mayOpenLeaseDocument: async () => null }));
vi.mock("#core/server/utils/expense-receipts", () => ({ mayOpenExpenseReceipt: async () => h.receipt }));
vi.mock("#core/server/utils/asset-stream", () => ({ streamDirectusFile: async (_e: unknown, file: { id: string }) => `streamed ${file.id}` }));
vi.stubGlobal("defineEventHandler", (fn: unknown) => fn);
vi.stubGlobal("createError", (e: any) => Object.assign(new Error(e.message ?? e.statusMessage), e));

async function request(op: { op: string; args: any[] }): Promise<any> {
  const [a] = op.args;
  switch (op.op) {
    case "readFolders":
      return Object.entries(FOLDERS)
        .filter(([, f]) => f.parent === a.filter.parent._eq)
        .map(([id, f]) => ({ id, name: f.name, parent: f.parent }));
    case "readFolder":
      return { id: a, ...FOLDERS[a] };
    case "readFiles": {
      const folder = a.filter._and[0].folder._eq;
      return Object.values(FILES).filter((f) => f.folder === folder);
    }
    case "readFile":
      if (!FILES[a]) throw Object.assign(new Error("not found"), { statusCode: 404 });
      return FILES[a];
    default:
      return { ok: true };
  }
}

type Handler = (event: H3Event) => Promise<any>;
const routes = {
  list: (await import("#core/server/api/org/storage/list.post")).default as Handler,
  file: (await import("#core/server/api/org/storage/file.post")).default as Handler,
  asset: (await import("#core/server/api/directus/assets/[id].get")).default as Handler,
};

const ctx = (over: Record<string, unknown>) => ({
  orgId: "org",
  userId: "u-admin",
  isAdmin: true,
  isBoard: false,
  canBrowseLibrary: true,
  storage: { rootId: "root", map: { documents: "docs", records: "records", "records/receipts": "receipts" } },
  ...over,
});
const call = (route: Handler, body: any, params?: Record<string, string>) => {
  h.body = body;
  return route({ __params: params } as unknown as H3Event);
};
const names = (rows: Array<{ name?: string; title?: string; id: string }>) => rows.map((r) => r.name ?? r.title ?? r.id);

beforeEach(() => {
  h.ctx = ctx({});
  h.receipt = null;
  h.member = true;
  vi.stubGlobal("readBody", async () => h.body);
  vi.stubGlobal("getRouterParam", (e: any, name: string) => e.__params?.[name]);
  vi.stubGlobal("requireUserSession", async () => ({ user: { id: h.ctx.userId } }));
  vi.stubGlobal("getTypedDirectus", () => ({ request }));
  vi.stubGlobal("fileOwnerOrgIds", async (id: string) => new Set(id === ID.bylaws ? ["org"] : []));
  vi.stubGlobal("isDataExportArchive", async () => false);
  vi.stubGlobal("checkMembership", async () => ({ isMember: h.member }));
  vi.stubGlobal("checkAdminAccess", async () => ({ isAdmin: h.ctx.isAdmin }));
});

describe("the Records folder in the library", () => {
  it("is there for the community's admins", async () => {
    expect(names((await call(routes.list, { folderId: "root" })).folders)).toEqual(["Documents", "Records"]);
    expect(names((await call(routes.list, { folderId: "receipts" })).files)).toEqual(["Acme 114"]);
  });

  it("is hidden from everyone else who may browse the library, and can't be opened by its id", async () => {
    h.ctx = ctx({ userId: "u-board", isAdmin: false, isBoard: true });
    expect(names((await call(routes.list, { folderId: "root" })).folders)).toEqual(["Documents"]);
    for (const folderId of ["records", "receipts"]) {
      await expect(call(routes.list, { folderId })).rejects.toMatchObject({ statusCode: 403 });
    }
    expect(names((await call(routes.list, { folderId: "docs" })).files)).toEqual(["Bylaws", "Pool"]);
  });
});

describe("a record's file in the storage library", () => {
  it("is not renamed, moved or deleted there, by an admin or the person who uploaded it", async () => {
    for (const who of [ctx({}), ctx({ userId: "u-admin", isAdmin: false })]) {
      h.ctx = who;
      for (const body of [{ action: "rename", title: "x" }, { action: "move", folderId: "docs" }, { action: "delete" }]) {
        await expect(call(routes.file, { ...body, fileId: ID.receipt })).rejects.toMatchObject({ statusCode: 409 });
      }
    }
    await expect(call(routes.file, { action: "rename", fileId: ID.bylaws, title: "Bylaws 2026" })).resolves.toBeTruthy();
  });
});

describe("a record's photo through the asset proxy", () => {
  it("goes to whoever its record allows, not to anyone signed in", async () => {
    h.ctx = ctx({ userId: "u-owner", isAdmin: false });
    h.receipt = false;
    await expect(call(routes.asset, {}, { id: ID.receipt }).catch((e) => e)).resolves.toMatchObject({ statusCode: 403 });
    h.receipt = true;
    await expect(call(routes.asset, {}, { id: ID.receipt })).resolves.toBe(`streamed ${ID.receipt}`);
  });

  it("an ordinary image still needs only a session; a library PDF needs the community", async () => {
    h.ctx = ctx({ userId: "u-owner", isAdmin: false });
    await expect(call(routes.asset, {}, { id: ID.photo })).resolves.toBe(`streamed ${ID.photo}`);
    await expect(call(routes.asset, {}, { id: ID.bylaws })).resolves.toBe(`streamed ${ID.bylaws}`);
    h.member = false;
    await expect(call(routes.asset, {}, { id: ID.bylaws }).catch((e) => e)).resolves.toMatchObject({ statusCode: 403 });
  });
});
