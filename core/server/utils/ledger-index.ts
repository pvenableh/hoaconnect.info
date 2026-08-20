/**
 * Indexing the Community Ledger for retrieval — the write side of `ai_ledger_chunks`.
 *
 * One row per `org_audit_log` entry, carrying the entry's embedded text and a
 * DENORMALIZED copy of its visibility tier so the vector scan itself can be
 * narrowed in the query rather than after it.
 *
 * ── The rule this file exists to obey ───────────────────────────────────────
 *
 * **Embedding must never block, fail, or delay a ledger write.**
 *
 * `writeAuditEntry` deliberately does not swallow failures — "a transition that
 * silently doesn't get recorded is worse than one that fails loudly" — and it
 * would be a poor trade to let a third-party embedding vendor turn a Voyage
 * outage into a hole in a community's permanent record. So indexing is
 * best-effort in every direction: gated on `isRagConfigured()`, wrapped in its
 * own try/catch, and bounded by a hard timeout.
 *
 * It is **awaited** rather than fired and forgotten, and that is deliberate: on
 * Vercel the function can be frozen the moment the response is sent, so a
 * dangling promise is not a background job, it is a coin flip. Awaiting a
 * bounded, failure-proof call is honest about the cost (a few hundred
 * milliseconds) and reliable. `backfill:ledger-embeddings` closes any gap it
 * still leaves — a missing chunk costs retrieval one entry, not correctness.
 *
 * Server-only, over REST, so it stays decoupled from the generated Directus
 * Schema types (the collection is created out-of-band by
 * `scripts/create-ai-ledger-chunks.ts`), exactly like rag-ingest.
 */

import { createHash } from "node:crypto";
// Relative, not `#core/…`, and no Nitro auto-imports: this module runs inside
// Nitro AND inside `scripts/backfill-ledger-embeddings.ts` under plain tsx,
// where the Nuxt alias and the auto-import graph do not exist.
import { embed, isRagConfigured, VOYAGE_MODEL } from "./voyage";
import { chargeEmbeddingRest } from "./rag-ingest";
import { embeddableLedgerText, type AskableEntry } from "../../shared/ai/ask";
import { normalizeVisibility } from "../../shared/ledger/visibility";

/** How long a ledger write is willing to wait for its own indexing. */
const INDEX_BUDGET_MS = 2500;

const q = (obj: unknown) => encodeURIComponent(JSON.stringify(obj));

async function dxFetch(endpoint: string, options: RequestInit = {}): Promise<any> {
  const url = process.env.DIRECTUS_URL;
  const token = process.env.DIRECTUS_STATIC_TOKEN;
  if (!url || !token) throw new Error("Directus is not configured.");
  const res = await fetch(`${url}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export interface IndexableEntry extends AskableEntry {
  readonly organization: string;
  readonly visibility: unknown;
}

export type IndexResult = "indexed" | "unchanged" | "skipped" | "failed";

/**
 * Index one entry. Idempotent on `content_hash`, so a re-run is cheap and a
 * backfill can be pointed at everything without re-billing Voyage.
 *
 * Throws. Callers on a write path must use `indexLedgerEntrySafely`; the
 * backfill script wants the error.
 */
export async function indexLedgerEntry(entry: IndexableEntry): Promise<IndexResult> {
  if (!isRagConfigured()) return "skipped";
  if (!entry.id || !entry.organization) return "skipped";

  const text = embeddableLedgerText(entry);
  if (!text.trim()) return "skipped";
  const hash = createHash("sha256").update(text).digest("hex");

  const existing = (
    await dxFetch(
      `/items/ai_ledger_chunks?filter=${q({ entry: { _eq: entry.id } })}&fields=id,content_hash&limit=1`
    )
  )?.data?.[0];
  if (existing?.content_hash === hash) return "unchanged";

  const { vectors, tokens } = await embed([text], "document");
  const vector = vectors[0];
  if (!vector) return "failed";

  const row = {
    organization: entry.organization,
    entry: entry.id,
    // Through `normalizeVisibility`, so an unrecognised tier becomes `board`
    // rather than reaching the index as something the reader will not match.
    // The narrower direction is always the safe one.
    visibility: normalizeVisibility(entry.visibility),
    event_type: entry.event_type ?? null,
    occurred_at: entry.occurred_at ?? null,
    summary: entry.summary ?? "",
    chunk_text: text,
    embedding: vector,
    tokens,
    content_hash: hash,
  };

  if (existing?.id) {
    await dxFetch(`/items/ai_ledger_chunks/${existing.id}`, {
      method: "PATCH",
      body: JSON.stringify(row),
    });
  } else {
    await dxFetch(`/items/ai_ledger_chunks`, { method: "POST", body: JSON.stringify(row) });
  }

  // Metered as an `embed` debit against the org wallet, like doc ingestion.
  // Best-effort inside a best-effort path: a metering failure must not make a
  // successful index look like a failed one.
  if (tokens > 0) await chargeEmbeddingRest(entry.organization, tokens, null);

  return "indexed";
}

/**
 * The write-path wrapper: bounded, and incapable of throwing.
 *
 * Every failure mode collapses to a warning and a `"failed"`, because the
 * caller is in the middle of recording something a community may need to prove
 * years later and this is a search index.
 */
export async function indexLedgerEntrySafely(entry: IndexableEntry): Promise<IndexResult> {
  if (!isRagConfigured()) return "skipped";
  try {
    return await Promise.race<IndexResult>([
      indexLedgerEntry(entry),
      new Promise<IndexResult>((resolve) =>
        setTimeout(() => resolve("failed"), INDEX_BUDGET_MS)
      ),
    ]);
  } catch (err: any) {
    console.warn("[ledger-index] indexing failed (the entry itself is safe):", err?.message || err);
    return "failed";
  }
}
