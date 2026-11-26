/**
 * GET /api/email/blocks — the block-builder's library. The library read rides
 * with the caller's standing as one batch; the compose check refuses before
 * any row is used, and a failed batch checks and reads as the route did before.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { blockLibrarySpec } from "#core/server/utils/email-block-reads";

const h = vi.hoisted(() => ({
  allowed: true,
  batchFails: false,
  batches: [] as { orgId: string; keys: string[] }[],
  reads: [] as any[],
  rows: [] as any[],
}));

vi.mock("@directus/sdk", () => ({ readItems: (collection: string, query: any) => ({ collection, query }) }));

const ORG = "org-1";
const ROWS = [
  { id: "b1", name: "Header", category: "layout", is_system: true, sort: 1 },
  { id: "b2", name: "Ours", category: "layout", is_system: false, sort: 2 },
  { id: "b3", name: "Loose", category: null, is_system: false, sort: 1 },
];

beforeEach(() => {
  vi.resetModules();
  h.allowed = true;
  h.batchFails = false;
  h.batches = [];
  h.reads = [];
  h.rows = ROWS;
  vi.stubGlobal("defineEventHandler", (fn: any) => fn);
  vi.stubGlobal("getQuery", (e: any) => e?.__query ?? {});
  vi.stubGlobal("createError", (o: any) => Object.assign(new Error(o.message), o));
  vi.stubGlobal("requireUserSession", async () => ({ user: { id: "me" } }));
  vi.stubGlobal("batchWithAccessSnapshot", async (_e: any, orgId: string, specs: Record<string, any>) => {
    h.batches.push({ orgId, keys: Object.keys(specs) });
    if (h.batchFails) throw new Error("GraphQL down");
    return { blocks: h.rows };
  });
  vi.stubGlobal("requireOrgComposeAccess", async () => {
    if (!h.allowed) throw createError({ statusCode: 403, message: "Not authorized for this organization" });
    return ["admin"];
  });
  vi.stubGlobal("getTypedDirectus", () => ({
    request: async (op: any) => {
      h.reads.push(op);
      return h.rows;
    },
  }));
});

const load = async () => (await import("#core/server/api/email/blocks.get")).default as any;
const call = async (query: Record<string, string> = { orgId: ORG }) => (await load())({ __query: query });

describe("GET /api/email/blocks", () => {
  it("reads the library with the caller's standing in one batch", async () => {
    const res = await call();
    expect(h.batches).toEqual([{ orgId: ORG, keys: ["blocks"] }]);
    expect(h.reads).toEqual([]);
    expect(res).toEqual({ blocks: ROWS, library: { layout: [ROWS[0], ROWS[1]], other: [ROWS[2]] } });
  });

  it("reads the platform's blocks and this org's own, in palette order", () => {
    expect(blockLibrarySpec(ORG)).toMatchObject({
      collection: "hoa_newsletter_blocks",
      filter: { _or: [{ is_system: { _eq: true } }, { organization: { _eq: ORG } }] },
      sort: ["category", "sort", "name"],
      limit: 200,
    });
  });

  it("answers the same when the batch fails", async () => {
    const batched = await call();
    h.batchFails = true;
    expect(await call()).toEqual(batched);
    const { collection, ...query } = blockLibrarySpec(ORG);
    expect(h.reads).toEqual([{ collection, query }]);
  });

  it("a refusal carries no rows; 400 without an orgId", async () => {
    h.allowed = false;
    const err = await call().catch((e: any) => e);
    expect(err).toMatchObject({ statusCode: 403 });
    expect(JSON.stringify(err)).not.toMatch(/Header|Ours/);
    expect(h.reads).toEqual([]);
    h.batches = [];
    await expect(call({})).rejects.toMatchObject({ statusCode: 400 });
    expect(h.batches).toEqual([]);
  });
});
