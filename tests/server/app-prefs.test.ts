/**
 * The app-prefs routes write a field on `directus_users` with the ADMIN token,
 * so the route is the whole fence. What these pin:
 *
 *   · the row written and read is the session's user — never an id from the
 *     body or the query, which a caller controls;
 *   · the body is reduced to the four dock keys before the write, so a request
 *     carrying `role`, `email` or a second `app_prefs` cannot reach the row;
 *   · a change merges into what is stored instead of replacing it;
 *   · no session is a 401, and an unprovisioned field degrades instead of
 *     failing the page.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { mergeAppPrefs, sanitizeAppPrefs, DOCK_PALETTE_IDS } from "#core/shared/nav/app-prefs";
import { PALETTE_IDS } from "#core/app/composables/useAppNav";

vi.mock("@directus/sdk", () => ({
  readUser: (id: string, query: unknown) => ({ op: "readUser", id, query }),
  updateUser: (id: string, data: unknown) => ({ op: "updateUser", id, data }),
}));

const ME = "user-me";
const SOMEONE_ELSE = "user-other";

type Op = { op: string; id: string; query?: unknown; data?: any };
let ops: Op[];
let stored: unknown;
let fieldExists: boolean;
let session: { user?: { id: string } } | null;
let body: unknown;

beforeEach(() => {
  ops = [];
  stored = { dock: { palette: "aurora", labels: true } };
  fieldExists = true;
  session = { user: { id: ME } };
  body = {};
  vi.stubGlobal("defineEventHandler", (fn: any) => fn);
  vi.stubGlobal("getUserSession", async () => session);
  vi.stubGlobal("readBody", async () => body);
  vi.stubGlobal("getTypedDirectus", () => ({
    request: async (op: Op) => {
      ops.push(op);
      if (!fieldExists) throw new Error('You don\'t have permission to access field "app_prefs"');
      if (op.op === "readUser") return { app_prefs: stored };
      return {};
    },
  }));
});

const loadGet = async () => (await import("#core/server/api/user/app-prefs.get")).default as any;
const loadPatch = async () => (await import("#core/server/api/user/app-prefs.patch")).default as any;

describe("sanitizeAppPrefs / mergeAppPrefs", () => {
  it("keeps only the four dock keys with valid values", () => {
    expect(
      sanitizeAppPrefs({
        dock: { palette: "vivid", position: "top", labels: false, glass: true, extra: 1 },
        role: "admin",
      })
    ).toEqual({ dock: { palette: "vivid", position: "top", labels: false, glass: true } });
    expect(sanitizeAppPrefs({ dock: { palette: "neon", position: "left", labels: "yes" } })).toEqual({});
    expect(sanitizeAppPrefs(null)).toEqual({});
    expect(sanitizeAppPrefs("x")).toEqual({});
  });

  it("merges key by key", () => {
    expect(mergeAppPrefs({ dock: { palette: "aurora", labels: true } }, { dock: { labels: false } })).toEqual({
      dock: { palette: "aurora", labels: false },
    });
  });

  it("knows exactly the palettes the dock offers", () => {
    expect([...DOCK_PALETTE_IDS].sort()).toEqual([...PALETTE_IDS].sort());
  });
});

describe("GET /api/user/app-prefs", () => {
  it("401s without a session", async () => {
    session = null;
    const handler = await loadGet();
    await expect(handler({})).rejects.toMatchObject({ statusCode: 401 });
    expect(ops).toEqual([]);
  });

  it("reads the session's user and nobody else, whatever the query says", async () => {
    const handler = await loadGet();
    const res = await handler({ query: { userId: SOMEONE_ELSE } });
    expect(ops.map((o) => o.id)).toEqual([ME]);
    expect(res).toEqual({ available: true, prefs: { dock: { palette: "aurora", labels: true } } });
  });

  it("sanitizes what it returns", async () => {
    stored = { dock: { palette: "aurora", junk: "<script>" }, other: 1 };
    const res = await (await loadGet())({});
    expect(res.prefs).toEqual({ dock: { palette: "aurora" } });
  });

  it("degrades, not fails, when the field is not provisioned", async () => {
    fieldExists = false;
    const res = await (await loadGet())({});
    expect(res).toEqual({ available: false, prefs: {} });
  });
});

describe("PATCH /api/user/app-prefs", () => {
  it("401s without a session and writes nothing", async () => {
    session = null;
    body = { dock: { labels: false } };
    await expect((await loadPatch())({})).rejects.toMatchObject({ statusCode: 401 });
    expect(ops).toEqual([]);
  });

  it("writes the session's user only — an id in the body is ignored", async () => {
    body = { id: SOMEONE_ELSE, user: SOMEONE_ELSE, userId: SOMEONE_ELSE, dock: { glass: false } };
    await (await loadPatch())({});
    const writes = ops.filter((o) => o.op === "updateUser");
    expect(writes).toHaveLength(1);
    expect(writes[0]!.id).toBe(ME);
  });

  it("never writes a field other than app_prefs, nor a key outside the dock", async () => {
    body = { role: "admin-role", email: "x@y.z", app_prefs: { dock: { palette: "vivid" } }, dock: { position: "top", evil: true } };
    await (await loadPatch())({});
    const write = ops.find((o) => o.op === "updateUser")!;
    expect(Object.keys(write.data)).toEqual(["app_prefs"]);
    expect(write.data.app_prefs).toEqual({ dock: { palette: "aurora", labels: true, position: "top" } });
  });

  it("400s on a body with nothing it may write", async () => {
    body = { role: "admin-role" };
    await expect((await loadPatch())({})).rejects.toMatchObject({ statusCode: 400 });
    expect(ops.filter((o) => o.op === "updateUser")).toEqual([]);
  });

  it("503s, without writing, when the field is not provisioned", async () => {
    fieldExists = false;
    body = { dock: { labels: false } };
    await expect((await loadPatch())({})).rejects.toMatchObject({ statusCode: 503 });
    expect(ops.filter((o) => o.op === "updateUser")).toEqual([]);
  });
});
