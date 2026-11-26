/**
 * createAs (core/server/utils/create-as.ts): Directus stamps the app token's
 * own user as `user_created` on create, so the author is set in a second write.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@directus/sdk", () => ({
  createItem: (collection: string, data: any, query?: any) => ({ op: "create", collection, data, query }),
  createItems: (collection: string, data: any[], query?: any) => ({ op: "createMany", collection, data, query }),
  updateItem: (collection: string, id: string, data: any, query?: any) => ({ op: "update", collection, id, data, query }),
  updateItems: (collection: string, ids: string[], data: any, query?: any) => ({ op: "updateMany", collection, ids, data, query }),
}));

const ops: any[] = [];
let failUpdate = false;
const client = {
  request: async (d: any) => {
    ops.push(d);
    if (d.op === "create") return { id: "r1", ...d.data, user_created: "token-user" };
    if (d.op === "createMany") return d.data.map((r: any, i: number) => ({ id: `r${i + 1}`, ...r, user_created: "token-user" }));
    if (failUpdate) throw new Error("down");
    if (d.op === "update") return { id: d.id, user_created: d.data.user_created };
    return d.ids.map((id: string) => ({ id, user_created: d.data.user_created }));
  },
};

const { createAs, createManyAs, createAsCaller } = await import("#core/server/utils/create-as");

beforeEach(() => {
  ops.length = 0;
  failUpdate = false;
  vi.stubGlobal("getTypedDirectus", () => client);
  vi.stubGlobal("getUserSession", async () => ({ user: { id: "caller" } }));
});

describe("createAs", () => {
  it("creates without the payload's author, then writes the caller as author", async () => {
    const row = await createAs("hoa_tasks", { title: "Fix", user_created: "someone-else" }, "ann");
    expect(ops[0]).toMatchObject({ op: "create", collection: "hoa_tasks" });
    expect(ops[0].data).toEqual({ title: "Fix" });
    expect(ops[1]).toMatchObject({ op: "update", collection: "hoa_tasks", id: "r1", data: { user_created: "ann" } });
    expect(row).toMatchObject({ id: "r1", title: "Fix", user_created: "ann" });
  });

  it("with no user, writes once and leaves Directus's stamp", async () => {
    await createAs("hoa_tasks", { title: "System" }, null);
    expect(ops.map((o) => o.op)).toEqual(["create"]);
  });

  it("passes the read-back query to both writes", async () => {
    await createAs("hoa_comments", { body: "x" }, "ann", { query: { fields: ["id", "user_created.id"] } });
    expect(ops.map((o) => o.query)).toEqual([{ fields: ["id", "user_created.id"] }, { fields: ["id", "user_created.id"] }]);
  });

  it("a failed author write never fails the create", async () => {
    failUpdate = true;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(createAs("hoa_tasks", { title: "Fix" }, "ann")).resolves.toMatchObject({ id: "r1" });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("an explicit client is used instead of the app's", async () => {
    const other = { request: vi.fn(async (d: any) => (d.op === "create" ? { id: "x" } : { id: "x" })) };
    await createAs("hoa_emails", { subject: "Hi" }, "ann", { client: other });
    expect(other.request).toHaveBeenCalledTimes(2);
    expect(ops).toEqual([]);
  });
});

describe("createManyAs", () => {
  it("authors every row in one write", async () => {
    const rows = await createManyAs("hoa_responsibilities", [{ title: "A", user_created: "x" }, { title: "B" }], "ann");
    expect(ops[0].data).toEqual([{ title: "A" }, { title: "B" }]);
    expect(ops[1]).toMatchObject({ op: "updateMany", ids: ["r1", "r2"], data: { user_created: "ann" } });
    expect(rows.map((r: any) => r.user_created)).toEqual(["ann", "ann"]);
  });

  it("writes nothing for no rows", async () => {
    expect(await createManyAs("hoa_responsibilities", [], "ann")).toEqual([]);
    expect(ops).toEqual([]);
  });
});

describe("createAsCaller", () => {
  it("authors as the session's user", async () => {
    await createAsCaller({} as any, "hoa_meetings", { title: "Board" });
    expect(ops[1]).toMatchObject({ op: "update", data: { user_created: "caller" } });
  });
});
