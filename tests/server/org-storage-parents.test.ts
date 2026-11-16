/**
 * The library's folder parents are cached per server process (org-storage.ts).
 * Which community a folder is in never changes through the app, so the cache
 * is safe for that; whether one folder is inside another does change. Found on
 * 2026-11-16 in the app: a folder was moved inside Documents, then Documents
 * was moved inside it, and the cycle check passed on the cached parent, leaving
 * the two folders pointing at each other (repaired the same minute). A cycle
 * check now reads fresh, and a move forgets the moved folder's parent.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const PARENT: Record<string, string | null> = {};

vi.mock("@directus/sdk", () => ({
  readFolder: (id: string) => ({ op: "readFolder", id }),
  readFolders: () => ({ op: "readFolders" }),
  readItems: () => ({ op: "readItems" }),
  createFolder: () => ({ op: "createFolder" }),
  updateItem: () => ({ op: "updateItem" }),
}));
vi.stubGlobal("getTypedDirectus", () => ({
  request: async (op: { op: string; id: string }) => {
    if (op.op !== "readFolder" || !(op.id in PARENT)) throw new Error("not found");
    return { id: op.id, parent: PARENT[op.id] };
  },
}));
vi.stubGlobal("createError", (e: any) => Object.assign(new Error(e.message ?? e.statusMessage), e));

const { isWithinOrgRoot, forgetFolderParent } = await import("#core/server/utils/org-storage");

beforeEach(() => {
  Object.assign(PARENT, { root: null, docs: "root", test: "root" });
});

describe("folder parents", () => {
  it("a cached parent can predate a move; a fresh read or a forgotten parent sees it", async () => {
    expect(await isWithinOrgRoot("root", "test")).toBe(true); // caches test → root
    PARENT.test = "docs"; // moved, in another process or before this fix
    expect(await isWithinOrgRoot("docs", "test")).toBe(false); // the stale answer the cycle check got
    expect(await isWithinOrgRoot("docs", "test", { fresh: true })).toBe(true);
    PARENT.test = "root";
    await isWithinOrgRoot("root", "test", { fresh: true });
    PARENT.test = "docs";
    forgetFolderParent("test");
    expect(await isWithinOrgRoot("docs", "test")).toBe(true);
  });

  it("which community a folder is in reads the same either way", async () => {
    expect(await isWithinOrgRoot("root", "docs")).toBe(true);
    expect(await isWithinOrgRoot("root", "docs", { fresh: true })).toBe(true);
    expect(await isWithinOrgRoot("elsewhere", "docs", { fresh: true })).toBe(false);
  });
});
