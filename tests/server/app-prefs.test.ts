/**
 * The app-prefs routes write a field on `directus_users` with the ADMIN token,
 * so the route is the whole fence. What these pin:
 *
 *   · the row written and read is the session's user — never an id from the
 *     body or the query, which a caller controls;
 *   · the body is reduced to the tint and dock-names keys before the write, so a request
 *     carrying `role`, `email` or a second `app_prefs` cannot reach the row;
 *   · a change merges into what is stored instead of replacing it;
 *   · no session is a 401, and an unprovisioned field degrades instead of
 *     failing the page.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { mergeAppPrefs, sanitizeAppPrefs } from "#core/shared/nav/app-prefs";

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
  stored = { tint: { on: false, swatch: "teal" } };
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
  it.each([
    ["keeps the tint keys with valid values", { tint: { on: false, swatch: "rose", extra: 1 }, role: "admin" }, { tint: { on: false, swatch: "rose" } }],
    ["drops an unknown swatch and a non-boolean switch", { tint: { on: "yes", swatch: "neon" } }, {}],
    ["keeps the community swatch when it is sent (a write may choose it)", { tint: { swatch: "community" } }, { tint: { swatch: "community" } }],
    ["drops the old dock keys entirely", { dock: { palette: "vivid", position: "top", labels: true, glass: false } }, {}],
    ["drops the dock beside a tint", { dock: { palette: "aurora" }, tint: { swatch: "blue" } }, { tint: { swatch: "blue" } }],
    ["is empty for null", null, {}],
    ["is empty for a string", "x", {}],
    ["is empty for an array", [{ tint: { on: false } }], {}],
    ["keeps the dock's names switch", { dock: { names: true } }, { dock: { names: true } }],
    ["keeps names off when it is sent (a write may choose it, to clear the key)", { dock: { names: false } }, { dock: { names: false } }],
    ["drops a non-boolean names", { dock: { names: "yes" } }, {}],
    ["keeps names beside a tint and drops the old dock keys around it", { tint: { swatch: "teal" }, dock: { names: true, palette: "aurora", labels: true } }, { tint: { swatch: "teal" }, dock: { names: true } }],
    ["does not read the old labels switch as names", { dock: { labels: true } }, {}],
  ])("sanitize %s", (_name, input, out) => {
    expect(sanitizeAppPrefs(input)).toEqual(out);
  });

  it.each([
    ["merges key by key", { tint: { on: false, swatch: "teal" } }, { tint: { swatch: "rose" } }, { tint: { on: false, swatch: "rose" } }],
    ["never stores Tint on: it is the default", { tint: { on: false, swatch: "teal" } }, { tint: { on: true } }, { tint: { swatch: "teal" } }],
    ["never stores the community swatch: it is the default", { tint: { swatch: "teal" } }, { tint: { swatch: "community" } }, {}],
    ["drops the old dock keys from what was stored", { dock: { palette: "aurora", labels: true } }, { tint: { swatch: "violet" } }, { tint: { swatch: "violet" } }],
    ["keeps a swatch while Tint is off, so it comes back", { tint: { swatch: "slate" } }, { tint: { on: false } }, { tint: { on: false, swatch: "slate" } }],
    ["stores names on: the only dock value ever written", {}, { dock: { names: true } }, { dock: { names: true } }],
    ["never stores names off: it is the default", { dock: { names: true }, tint: { swatch: "rose" } }, { dock: { names: false } }, { tint: { swatch: "rose" } }],
    ["a tint change keeps names", { dock: { names: true } }, { tint: { swatch: "blue" } }, { tint: { swatch: "blue" }, dock: { names: true } }],
    ["a names change keeps the tint", { tint: { on: false } }, { dock: { names: true } }, { tint: { on: false }, dock: { names: true } }],
  ])("merge %s", (_name, base, patch, out) => {
    expect(mergeAppPrefs(base, patch)).toEqual(out);
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
    expect(res).toEqual({ available: true, prefs: { tint: { on: false, swatch: "teal" } } });
  });

  it("sanitizes what it returns", async () => {
    stored = { tint: { swatch: "rose", junk: "<script>" }, dock: { palette: "aurora" }, other: 1 };
    const res = await (await loadGet())({});
    expect(res.prefs).toEqual({ tint: { swatch: "rose" } });
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
    body = { tint: { on: false } };
    await expect((await loadPatch())({})).rejects.toMatchObject({ statusCode: 401 });
    expect(ops).toEqual([]);
  });

  it("writes the session's user only — an id in the body is ignored", async () => {
    body = { id: SOMEONE_ELSE, user: SOMEONE_ELSE, userId: SOMEONE_ELSE, tint: { swatch: "blue" } };
    await (await loadPatch())({});
    const writes = ops.filter((o) => o.op === "updateUser");
    expect(writes).toHaveLength(1);
    expect(writes[0]!.id).toBe(ME);
  });

  it("never writes a field other than app_prefs, nor a key outside the tint", async () => {
    body = { role: "admin-role", email: "x@y.z", app_prefs: { tint: { swatch: "slate" } }, dock: { position: "top" }, tint: { swatch: "violet", evil: true } };
    await (await loadPatch())({});
    const write = ops.find((o) => o.op === "updateUser")!;
    expect(Object.keys(write.data)).toEqual(["app_prefs"]);
    expect(write.data.app_prefs).toEqual({ tint: { on: false, swatch: "violet" } });
  });

  it("writes the dock's names switch, and nothing else of the dock", async () => {
    body = { dock: { names: true, position: "top" } };
    await (await loadPatch())({});
    expect(ops.find((o) => o.op === "updateUser")!.data.app_prefs).toEqual({ tint: { on: false, swatch: "teal" }, dock: { names: true } });
  });

  it("rewrites a row that still holds the old dock keys without them", async () => {
    stored = { dock: { palette: "aurora", position: "top", labels: true, glass: false } };
    body = { tint: { on: false } };
    await (await loadPatch())({});
    expect(ops.find((o) => o.op === "updateUser")!.data.app_prefs).toEqual({ tint: { on: false } });
  });

  it("400s on a body with nothing it may write (the old dock keys included)", async () => {
    body = { role: "admin-role", dock: { palette: "fresh", labels: true } };
    await expect((await loadPatch())({})).rejects.toMatchObject({ statusCode: 400 });
    expect(ops.filter((o) => o.op === "updateUser")).toEqual([]);
  });

  it("503s, without writing, when the field is not provisioned", async () => {
    fieldExists = false;
    body = { tint: { on: false } };
    await expect((await loadPatch())({})).rejects.toMatchObject({ statusCode: 503 });
    expect(ops.filter((o) => o.op === "updateUser")).toEqual([]);
  });
});
