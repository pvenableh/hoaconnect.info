/**
 * Community Ledger retrieval and indexing (ledger-retrieve, ledger-index).
 *
 * The helpers they lean on (visibilityFilter, selectLedgerContext, the lexical
 * scorer, embeddableLedgerText) have their own tests. What is pinned here is
 * the wiring, where the real risks are:
 *
 *  - retrieval applies the viewer's tiers to the vector scan (a board-only
 *    chunk is never loaded) AND to the authoritative re-read (a chunk whose
 *    denormalized tier is wrong still can't surface its entry), both scoped to
 *    the org;
 *  - with no Voyage key or nothing indexed it falls back to lexical, and it
 *    never throws;
 *  - indexing is idempotent on the content hash, stores the narrower tier for
 *    anything unrecognised, meters the embedding, and on the write path can
 *    neither throw nor wait past its budget.
 *
 * Voyage's network call and the Directus transports are stubbed; cosine
 * similarity and the shared selection rules are real.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NO_ACCESS, type LedgerViewer } from "#core/shared/ledger/visibility";

vi.mock("@directus/sdk", () => ({
  readItems: (collection: string, query?: unknown) => ({ op: "read", collection, query }),
}));

// ── Voyage: configuration and embedding stubbed, cosine real ─────────────────
let ragConfigured: boolean;
let embedCalls: Array<{ texts: string[]; kind: string }>;
let embedImpl: (texts: string[], kind: string) => Promise<{ vectors: number[][]; tokens: number }>;

vi.mock("#core/server/utils/voyage", async (importOriginal) => {
  const real = await importOriginal<typeof import("#core/server/utils/voyage")>();
  return {
    ...real,
    isRagConfigured: () => ragConfigured,
    embed: (texts: string[], kind: string) => {
      embedCalls.push({ texts, kind });
      return embedImpl(texts, kind);
    },
  };
});

let embedCharges: any[];
vi.mock("#core/server/utils/rag-ingest", () => ({
  chargeEmbeddingRest: async (...args: any[]) => {
    embedCharges.push(args);
  },
}));

// ── The world ────────────────────────────────────────────────────────────────
const HOME = "org-home";
const OTHER = "org-other";
const ME = "user-me";

const OWNER: LedgerViewer = { ...NO_ACCESS, isMember: true };
const BOARD: LedgerViewer = { ...NO_ACCESS, isMember: true, isBoard: true };

/** org_audit_log rows. */
let ledger: any[];
/** ai_ledger_chunks rows. */
let chunks: any[];
let fetches: Array<{ url: string; method: string; body: any }>;
let sdkReads: any[];
let queryCharges: any[];

const entry = (id: string, visibility: string, occurred_at: string, summary: string, org = HOME) => ({
  id,
  organization: org,
  event_type: "governance.vote_recorded",
  occurred_at,
  actor_name: "Dana Ruiz",
  visibility,
  summary,
  payload: null,
});

/** A chunk whose embedding points `angle` radians away from the question. */
const chunk = (entryId: string, visibility: string, angle: number, org = HOME) => ({
  id: `chunk-${entryId}`,
  organization: org,
  entry: entryId,
  visibility,
  occurred_at: null,
  embedding: [Math.cos(angle), Math.sin(angle)],
});

function matches(row: any, filter: any): boolean {
  if (!filter) return true;
  return Object.entries(filter).every(([field, cond]: [string, any]) => {
    const v = row[field];
    if (cond?._eq !== undefined) return String(v) === String(cond._eq);
    if (cond?._in !== undefined) return (cond._in as any[]).map(String).includes(String(v));
    return true;
  });
}

function json(data: unknown, ok = true, status = 200) {
  const text = JSON.stringify(data);
  return { ok, status, json: async () => data, text: async () => text } as any;
}

beforeEach(() => {
  vi.resetModules();
  process.env.DIRECTUS_URL = "https://dx.test";
  process.env.DIRECTUS_STATIC_TOKEN = "static-token";
  ragConfigured = true;
  embedCalls = [];
  embedCharges = [];
  queryCharges = [];
  fetches = [];
  sdkReads = [];
  embedImpl = async (texts) => ({ vectors: texts.map(() => [1, 0]), tokens: 12 });
  ledger = [];
  chunks = [];

  // Directus REST: ai_ledger_chunks reads and writes.
  vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    const body = init.body ? JSON.parse(String(init.body)) : null;
    fetches.push({ url, method, body });
    const u = new URL(url);
    if (u.pathname === "/items/ai_ledger_chunks" && method === "GET") {
      const filter = JSON.parse(u.searchParams.get("filter") || "null");
      const limit = Number(u.searchParams.get("limit") || 0);
      const out = chunks.filter((c) => matches(c, filter));
      return json({ data: limit ? out.slice(0, limit) : out });
    }
    if (u.pathname === "/items/ai_ledger_chunks" && method === "POST") {
      const row = { id: `chunk-new-${chunks.length + 1}`, ...body };
      chunks.push(row);
      return json({ data: row });
    }
    const patch = u.pathname.match(/^\/items\/ai_ledger_chunks\/(.+)$/);
    if (patch && method === "PATCH") {
      const row = chunks.find((c) => c.id === patch[1]);
      Object.assign(row, body);
      return json({ data: row });
    }
    return json({ errors: [{ message: "unexpected" }] }, false, 500);
  });

  // The SDK reads of org_audit_log.
  vi.stubGlobal("getTypedDirectus", () => ({
    request: async (desc: any) => {
      sdkReads.push(desc);
      let out = ledger.filter((r) => matches(r, desc.query?.filter));
      if (desc.query?.sort?.[0] === "-occurred_at") {
        out = [...out].sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
      }
      return desc.query?.limit ? out.slice(0, desc.query.limit) : out;
    },
  }));
  vi.stubGlobal("chargeForEmbedding", async (opts: any) => {
    queryCharges.push(opts);
  });
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
});

const loadRetrieve = async () => (await import("#core/server/utils/ledger-retrieve")).retrieveLedgerContext;
const loadIndex = async () => await import("#core/server/utils/ledger-index");

const ask = async (viewer: LedgerViewer, question = "How did the board vote on the pool budget?") =>
  (await loadRetrieve())({ orgId: HOME, question, viewer, userId: ME });

const chunkScanFilter = () => {
  const scan = fetches.find((f) => f.method === "GET" && f.url.includes("/items/ai_ledger_chunks"));
  return JSON.parse(new URL(scan!.url).searchParams.get("filter")!);
};

// ── Retrieval: who sees what ─────────────────────────────────────────────────

describe("retrieveLedgerContext — the visibility boundary", () => {
  beforeEach(() => {
    ledger = [
      entry("e-owners", "owners", "2026-11-20T00:00:00Z", "Pool budget approved"),
      entry("e-board", "board", "2026-11-21T00:00:00Z", "Pool contractor dispute in executive session"),
    ];
    chunks = [chunk("e-owners", "owners", 0.1), chunk("e-board", "board", 0)];
  });

  it("gives a viewer with no tier nothing, without reading anything", async () => {
    const out = await ask(NO_ACCESS);
    expect(out).toEqual({ entries: [], relevant: 0, mode: "none", topScore: 0 });
    expect(fetches).toEqual([]);
    expect(sdkReads).toEqual([]);
    expect(embedCalls).toEqual([]);
  });

  it("gives a blank question nothing", async () => {
    const out = await ask(BOARD, "   ");
    expect(out.mode).toBe("none");
    expect(fetches).toEqual([]);
  });

  it("narrows the vector scan itself, so a board-only chunk is never loaded for an owner", async () => {
    const out = await ask(OWNER);
    expect(chunkScanFilter()).toEqual({ organization: { _eq: HOME }, visibility: { _in: ["owners"] } });
    expect(out.mode).toBe("vector");
    expect(out.entries.map((e) => e.id)).toEqual(["e-owners"]);
    // The board chunk pointed straight at the question; the top score is the owner one's.
    expect(out.topScore).toBeCloseTo(Math.cos(0.1), 6);
  });

  it("gives the board both tiers, newest first", async () => {
    const out = await ask(BOARD);
    expect(chunkScanFilter().visibility).toEqual({ _in: ["owners", "board"] });
    expect(out.entries.map((e) => e.id)).toEqual(["e-board", "e-owners"]);
    expect(out.relevant).toBe(2);
    expect(out.topScore).toBeCloseTo(1, 6);
  });

  it("withholds an entry whose chunk carries the wrong tier, on the authoritative re-read", async () => {
    // The denormalized copy says owners; the ledger row says board.
    chunks = [chunk("e-board", "owners", 0)];
    const out = await ask(OWNER);
    expect(out.entries).toEqual([]);
    const reread = sdkReads.at(-1);
    expect(reread.query.filter).toEqual({
      organization: { _eq: HOME },
      visibility: { _in: ["owners"] },
      id: { _in: ["e-board"] },
    });
  });

  it("never surfaces another community's entry, even through a chunk that names it", async () => {
    ledger.push(entry("e-foreign", "owners", "2026-11-22T00:00:00Z", "Pool budget", OTHER));
    chunks = [chunk("e-foreign", "owners", 0)];
    const out = await ask(BOARD);
    expect(out.entries).toEqual([]);
  });
});

// ── Retrieval: vector path details ───────────────────────────────────────────

describe("retrieveLedgerContext — the vector path", () => {
  beforeEach(() => {
    ledger = [entry("e1", "owners", "2026-11-20T00:00:00Z", "Pool budget approved")];
    chunks = [chunk("e1", "owners", 0)];
  });

  it("embeds the question as a query and meters it against the org", async () => {
    await ask(OWNER, "pool budget?");
    expect(embedCalls).toEqual([{ texts: ["pool budget?"], kind: "query" }]);
    expect(queryCharges).toEqual([{ orgId: HOME, userId: ME, tokens: 12, model: "voyage-3.5-lite" }]);
  });

  it("still answers when metering the query fails", async () => {
    vi.stubGlobal("chargeForEmbedding", async () => {
      throw new Error("wallet down");
    });
    const out = await ask(OWNER);
    expect(out.mode).toBe("vector");
    expect(out.entries.map((e) => e.id)).toEqual(["e1"]);
  });

  it("ignores chunks with no embedding", async () => {
    chunks = [{ ...chunk("e1", "owners", 0), embedding: null }];
    const out = await ask(OWNER);
    // With no usable chunk there's no index: lexical takes over.
    expect(out.mode).toBe("lexical");
    expect(embedCalls).toEqual([]);
  });
});

// ── Retrieval: degrading ─────────────────────────────────────────────────────

describe("retrieveLedgerContext — degrading rather than going dark", () => {
  beforeEach(() => {
    ledger = [
      entry("e-pool", "owners", "2026-11-01T00:00:00Z", "Pool budget approved"),
      entry("e-board", "board", "2026-11-02T00:00:00Z", "Pool budget dispute"),
      entry("e-foreign", "owners", "2026-11-03T00:00:00Z", "Pool budget", OTHER),
    ];
  });

  it("falls back to lexical over the org's visible entries when nothing is indexed", async () => {
    const out = await ask(OWNER, "pool budget");
    expect(out.mode).toBe("lexical");
    expect(out.entries.map((e) => e.id)).toEqual(["e-pool"]);
    expect(out.relevant).toBe(1);
    expect(embedCalls).toEqual([]);
    expect(sdkReads[0].query).toMatchObject({
      filter: { organization: { _eq: HOME }, visibility: { _in: ["owners"] } },
      sort: ["-occurred_at"],
    });
  });

  it("goes lexical without a Voyage key, never touching the chunk table", async () => {
    ragConfigured = false;
    const out = await ask(BOARD, "pool budget");
    expect(out.mode).toBe("lexical");
    expect(out.entries.map((e) => e.id)).toEqual(["e-board", "e-pool"]);
    expect(fetches).toEqual([]);
  });

  it("goes lexical when the chunk scan errors", async () => {
    chunks = [chunk("e-pool", "owners", 0)];
    const realFetch = globalThis.fetch;
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) =>
      url.includes("/items/ai_ledger_chunks") ? json({}, false, 503) : realFetch(url, init)
    );
    const out = await ask(OWNER, "pool budget");
    expect(out.mode).toBe("lexical");
  });

  it("returns nothing rather than throwing when the ledger read fails", async () => {
    ragConfigured = false;
    vi.stubGlobal("getTypedDirectus", () => ({
      request: async () => {
        throw new Error("directus down");
      },
    }));
    await expect(ask(OWNER)).resolves.toEqual({ entries: [], relevant: 0, mode: "none", topScore: 0 });
  });
});

// ── Indexing ─────────────────────────────────────────────────────────────────

describe("indexLedgerEntry", () => {
  const e = (over: Record<string, any> = {}) => ({
    ...entry("e1", "owners", "2026-11-20T00:00:00Z", "Pool budget approved"),
    ...over,
  });

  it("skips without a Voyage key, without touching Directus", async () => {
    ragConfigured = false;
    const { indexLedgerEntry } = await loadIndex();
    expect(await indexLedgerEntry(e())).toBe("skipped");
    expect(fetches).toEqual([]);
  });

  it("skips an entry with no id or no organization", async () => {
    const { indexLedgerEntry } = await loadIndex();
    expect(await indexLedgerEntry(e({ id: "" }))).toBe("skipped");
    expect(await indexLedgerEntry(e({ organization: "" }))).toBe("skipped");
    expect(embedCalls).toEqual([]);
  });

  it("writes a new chunk with the entry's tier, its text and vector, and meters the embedding", async () => {
    const { indexLedgerEntry } = await loadIndex();
    expect(await indexLedgerEntry(e())).toBe("indexed");
    expect(embedCalls).toHaveLength(1);
    expect(embedCalls[0].kind).toBe("document");
    const [row] = chunks;
    expect(row).toMatchObject({
      organization: HOME,
      entry: "e1",
      visibility: "owners",
      event_type: "governance.vote_recorded",
      occurred_at: "2026-11-20T00:00:00Z",
      summary: "Pool budget approved",
      chunk_text: embedCalls[0].texts[0],
      embedding: [1, 0],
      tokens: 12,
    });
    expect(row.content_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(embedCharges).toEqual([[HOME, 12, null]]);
  });

  it("stores an unrecognised tier as board, the narrower one", async () => {
    const { indexLedgerEntry } = await loadIndex();
    await indexLedgerEntry(e({ visibility: "everyone" }));
    await indexLedgerEntry(e({ id: "e2", visibility: null }));
    expect(chunks.map((c) => c.visibility)).toEqual(["board", "board"]);
  });

  it("does nothing for unchanged text, and re-embeds into the same chunk when it changes", async () => {
    const { indexLedgerEntry } = await loadIndex();
    await indexLedgerEntry(e());
    expect(await indexLedgerEntry(e())).toBe("unchanged");
    expect(embedCalls).toHaveLength(1);
    expect(embedCharges).toHaveLength(1);

    expect(await indexLedgerEntry(e({ summary: "Pool budget approved, 4-1" }))).toBe("indexed");
    expect(chunks).toHaveLength(1);
    expect(chunks[0].summary).toBe("Pool budget approved, 4-1");
    expect(fetches.filter((f) => f.method === "PATCH")).toHaveLength(1);
  });

  it("reports failed when the embedder returns no vector, and writes nothing", async () => {
    embedImpl = async () => ({ vectors: [], tokens: 0 });
    const { indexLedgerEntry } = await loadIndex();
    expect(await indexLedgerEntry(e())).toBe("failed");
    expect(chunks).toEqual([]);
  });

  it("throws for the backfill to see", async () => {
    embedImpl = async () => {
      throw new Error("voyage 500");
    };
    const { indexLedgerEntry } = await loadIndex();
    await expect(indexLedgerEntry(e())).rejects.toThrow("voyage 500");
  });
});

describe("indexLedgerEntrySafely — the ledger write path", () => {
  const e = entry("e1", "owners", "2026-11-20T00:00:00Z", "Pool budget approved");

  it("turns any failure into failed instead of throwing", async () => {
    embedImpl = async () => {
      throw new Error("voyage 500");
    };
    const { indexLedgerEntrySafely } = await loadIndex();
    await expect(indexLedgerEntrySafely(e)).resolves.toBe("failed");
  });

  it("stops waiting after its budget", async () => {
    vi.useFakeTimers();
    embedImpl = () => new Promise(() => {}); // Voyage never answers
    const { indexLedgerEntrySafely } = await loadIndex();
    const pending = indexLedgerEntrySafely(e);
    await vi.advanceTimersByTimeAsync(2500);
    await expect(pending).resolves.toBe("failed");
  });

  it("skips without a Voyage key", async () => {
    ragConfigured = false;
    const { indexLedgerEntrySafely } = await loadIndex();
    await expect(indexLedgerEntrySafely(e)).resolves.toBe("skipped");
  });

  it("passes a successful index through", async () => {
    const { indexLedgerEntrySafely } = await loadIndex();
    await expect(indexLedgerEntrySafely(e)).resolves.toBe("indexed");
  });
});
