// Doc/bylaw RAG ingestion — turns a governing document into embedded, retrievable
// chunks. Sources are polymorphic: hoa_governance rows (bylaws/rules, already text)
// and hoa_documents rows (uploaded PDFs, text extracted via unpdf). Each ingest
// extracts the source text, chunks it, embeds the chunks with Voyage, replaces the
// source's rows in ai_doc_chunks, and meters the embedding cost into the org wallet.
//
// SELF-CONTAINED on purpose: this module talks to Directus over REST with
// process.env credentials (NOT the Nitro getTypedDirectus auto-import) and reuses
// only the framework-free credit math, so the SAME code runs from the Nitro
// on-write hook AND from the standalone `backfill:embeddings` tsx script.
//
// Everything is gated on isRagConfigured() (no-op without VOYAGE_API_KEY) and
// best-effort: a failure logs and returns, never throwing into the caller (the
// on-write hook is fire-and-forget and must never break a save).

import { createHash } from "node:crypto";
import { extractText, getDocumentProxy } from "unpdf";
import { embed, isRagConfigured, VOYAGE_MODEL } from "./voyage";
import { creditsForEmbedding, marginForAccount, type Wallet } from "../../shared/ai/credits";

export type RagSourceCollection = "hoa_governance" | "hoa_documents";

/** ~800-token chunks with ~100-token overlap, approximated by words (~1.3 tok/word). */
const CHUNK_WORDS = 600;
const CHUNK_OVERLAP_WORDS = 80;
/** Cap chunks per source so a giant PDF can't run away on cost. */
const MAX_CHUNKS = 200;

// ── Directus REST (process.env; works in Nitro and in a tsx script) ─────────────

function directusEnv(): { url: string; token: string } {
  const url = process.env.DIRECTUS_URL || "";
  const token = process.env.DIRECTUS_STATIC_TOKEN || "";
  if (!url || !token) throw new Error("DIRECTUS_URL / DIRECTUS_STATIC_TOKEN are required for RAG ingestion");
  return { url, token };
}

async function dxFetch(path: string, init: RequestInit = {}): Promise<any> {
  const { url, token } = directusEnv();
  const res = await fetch(`${url}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...init.headers },
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Directus ${init.method ?? "GET"} ${path} → HTTP ${res.status} ${detail.slice(0, 300)}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

const q = (obj: unknown) => encodeURIComponent(JSON.stringify(obj));

// ── Text extraction ─────────────────────────────────────────────────────────

/** Strip HTML tags + decode the few entities our rich-text editor emits. */
function stripHtml(html: unknown): string {
  return String(html ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

interface SourceText {
  orgId: string;
  title: string;
  section: string | null;
  /** Empty when unpublished, missing, or unextractable — caller drops the index. */
  text: string;
  published: boolean;
}

/** Read + flatten a governance row (bylaws/rules) into plain text. */
async function extractGovernance(id: string): Promise<SourceText | null> {
  const row = (
    await dxFetch(
      `/items/hoa_governance/${id}?fields=${encodeURIComponent("title,section_number,summary,content,status,organization")}`
    )
  )?.data;
  if (!row) return null;
  const orgId = typeof row.organization === "string" ? row.organization : row.organization?.id;
  if (!orgId) return null;
  const published = row.status === "published";
  const parts = [row.title, row.section_number, row.summary, stripHtml(row.content)].filter(Boolean);
  return {
    orgId,
    title: String(row.title ?? "Untitled rule"),
    section: row.section_number ? String(row.section_number) : null,
    text: published ? parts.join("\n") : "",
    published,
  };
}

/** Read a document row, fetch its file bytes, and extract PDF text via unpdf. */
async function extractDocument(id: string): Promise<SourceText | null> {
  const row = (
    await dxFetch(`/items/hoa_documents/${id}?fields=${encodeURIComponent("title,status,organization,file.id,file.type")}`)
  )?.data;
  if (!row) return null;
  const orgId = typeof row.organization === "string" ? row.organization : row.organization?.id;
  if (!orgId) return null;
  const published = row.status === "published";
  const title = String(row.title ?? "Untitled document");
  const fileId = typeof row.file === "string" ? row.file : row.file?.id;
  const fileType = typeof row.file === "object" ? row.file?.type : null;

  if (!published || !fileId) {
    return { orgId, title, section: null, text: "", published };
  }

  let text = "";
  try {
    // PDFs only — other types (images, docx) aren't extractable here.
    if (!fileType || String(fileType).includes("pdf")) {
      const { url, token } = directusEnv();
      const res = await fetch(`${url}/assets/${fileId}`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const buf = new Uint8Array(await res.arrayBuffer());
        const pdf = await getDocumentProxy(buf);
        const extracted = await extractText(pdf, { mergePages: true });
        text = stripHtml(Array.isArray(extracted.text) ? extracted.text.join("\n") : extracted.text);
      }
    }
  } catch (err: any) {
    console.warn(`[rag] PDF extract failed for document ${id}:`, err?.message || err);
    text = "";
  }
  return { orgId, title, section: null, text, published };
}

async function extractSourceText(collection: RagSourceCollection, id: string): Promise<SourceText | null> {
  return collection === "hoa_governance" ? extractGovernance(id) : extractDocument(id);
}

// ── Chunking ─────────────────────────────────────────────────────────────────

export function chunkText(text: string): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const step = Math.max(1, CHUNK_WORDS - CHUNK_OVERLAP_WORDS);
  const chunks: string[] = [];
  for (let start = 0; start < words.length && chunks.length < MAX_CHUNKS; start += step) {
    chunks.push(words.slice(start, start + CHUNK_WORDS).join(" "));
    if (start + CHUNK_WORDS >= words.length) break;
  }
  return chunks;
}

// ── ai_doc_chunks CRUD (REST) ──────────────────────────────────────────────────

async function existingChunkHash(collection: RagSourceCollection, id: string): Promise<string | null> {
  const filter = { source_collection: { _eq: collection }, source_id: { _eq: id } };
  const rows = (await dxFetch(`/items/ai_doc_chunks?filter=${q(filter)}&fields=content_hash&limit=1`))?.data;
  return rows?.[0]?.content_hash ?? null;
}

/** Delete every chunk for a (source_collection, source_id) pair. */
export async function removeItemChunks(collection: RagSourceCollection, id: string): Promise<void> {
  if (!isRagConfigured()) return;
  try {
    const filter = { source_collection: { _eq: collection }, source_id: { _eq: id } };
    const rows = (await dxFetch(`/items/ai_doc_chunks?filter=${q(filter)}&fields=id&limit=-1`))?.data as { id: string }[];
    const ids = (rows ?? []).map((r) => r.id);
    if (ids.length) {
      await dxFetch(`/items/ai_doc_chunks`, { method: "DELETE", body: JSON.stringify(ids) });
    }
  } catch (err: any) {
    console.warn(`[rag] removeItemChunks failed for ${collection}/${id}:`, err?.message || err);
  }
}

// ── Wallet metering (REST; mirrors ai-wallet.chargeForEmbedding, pure split) ────

async function chargeEmbeddingRest(orgId: string, tokens: number, userId: string | null): Promise<void> {
  try {
    if (tokens <= 0) return;
    const orgRow = (await dxFetch(`/items/hoa_organizations/${orgId}?fields=is_free_account`))?.data;
    const margin = marginForAccount(orgRow?.is_free_account === true);
    const credits = creditsForEmbedding(tokens, VOYAGE_MODEL, { marginMultiplier: margin });
    if (credits <= 0) return;

    // Get-or-create the wallet.
    let wallet = (await dxFetch(`/items/ai_wallets?filter=${q({ organization: { _eq: orgId } })}&sort=date_created&limit=1`))
      ?.data?.[0];
    if (!wallet) {
      wallet = (
        await dxFetch(`/items/ai_wallets`, {
          method: "POST",
          body: JSON.stringify({ organization: orgId, balance_credits: 0, allowance_credits: 0, purchased_credits: 0, included_credits: 0 }),
        })
      )?.data;
    }
    if (!wallet) return;

    const w: Wallet = { allowance: wallet.allowance_credits ?? 0, purchased: wallet.purchased_credits ?? 0 };
    // Allowance-first, clamped so an overrun can't drive a pool negative.
    const fromAllowance = Math.min(Math.max(0, w.allowance), credits);
    const fromPurchased = Math.min(Math.max(0, w.purchased), credits - fromAllowance);
    const newAllowance = w.allowance - fromAllowance;
    const newPurchased = w.purchased - fromPurchased;

    await dxFetch(`/items/ai_wallets/${wallet.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        allowance_credits: newAllowance,
        purchased_credits: newPurchased,
        balance_credits: newAllowance + newPurchased,
      }),
    });
    await dxFetch(`/items/ai_transactions`, {
      method: "POST",
      body: JSON.stringify({
        organization: orgId,
        type: "debit",
        credits,
        feature: "embed",
        model: VOYAGE_MODEL,
        input_tokens: tokens,
        output_tokens: 0,
        cache_read_tokens: 0,
        cache_write_tokens: 0,
        user: userId,
      }),
    });
  } catch (err: any) {
    console.warn(`[rag] embedding charge failed for org ${orgId}:`, err?.message || err);
  }
}

// ── Public: ingest one source ──────────────────────────────────────────────────

export interface IngestResult {
  status: "skipped" | "unchanged" | "removed" | "indexed";
  chunks?: number;
  tokens?: number;
}

/**
 * Ingest a single source row into ai_doc_chunks. Idempotent: an unchanged source
 * (same content_hash) is a no-op; an unpublished/empty/missing source has its
 * chunks removed. Charges the org wallet for the embedding tokens. Never throws.
 */
export async function ingestItem(
  collection: RagSourceCollection,
  id: string,
  opts: { userId?: string | null } = {}
): Promise<IngestResult> {
  if (!isRagConfigured()) return { status: "skipped" };
  try {
    const src = await extractSourceText(collection, id);
    if (!src) return { status: "skipped" };

    // Unpublished / empty / unextractable → drop it from the index.
    if (!src.published || !src.text.trim()) {
      await removeItemChunks(collection, id);
      return { status: "removed" };
    }

    const hash = createHash("sha256").update(src.text).digest("hex");
    if ((await existingChunkHash(collection, id)) === hash) {
      return { status: "unchanged" };
    }

    const chunks = chunkText(src.text);
    if (!chunks.length) {
      await removeItemChunks(collection, id);
      return { status: "removed" };
    }

    const { vectors, tokens } = await embed(chunks, "document");
    if (vectors.length !== chunks.length) {
      console.warn(`[rag] embed returned ${vectors.length} vectors for ${chunks.length} chunks (${collection}/${id})`);
      return { status: "skipped" };
    }

    // Replace the source's chunks atomically-ish: delete then insert.
    await removeItemChunks(collection, id);
    const rows = chunks.map((chunk_text, i) => ({
      organization: src.orgId,
      source_collection: collection,
      source_id: id,
      source_title: src.title,
      section: src.section,
      chunk_index: i,
      chunk_text,
      embedding: vectors[i],
      tokens: 0,
      content_hash: hash,
    }));
    await dxFetch(`/items/ai_doc_chunks`, { method: "POST", body: JSON.stringify(rows) });

    await chargeEmbeddingRest(src.orgId, tokens, opts.userId ?? null);
    return { status: "indexed", chunks: chunks.length, tokens };
  } catch (err: any) {
    console.warn(`[rag] ingestItem failed for ${collection}/${id}:`, err?.message || err);
    return { status: "skipped" };
  }
}
