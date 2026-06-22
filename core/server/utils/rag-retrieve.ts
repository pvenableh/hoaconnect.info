// Doc/bylaw RAG retrieval — the read side of the index built by rag-ingest.ts.
// Embeds the user's question, scores it against the org's ai_doc_chunks with
// brute-force cosine (fine at HOA scale; pgvector is the deferred upgrade), and
// returns a citations block to inject into the chat system prompt when a strong
// match exists. The query embedding is metered into the org wallet as an `embed`
// debit (negligible — one short query).
//
// Server-only (called from the Nitro chat route). Reads ai_doc_chunks over REST
// so it stays decoupled from the generated Directus Schema types (the collection
// is created out-of-band by create-ai-rag-collections.ts).

import { embed, cosineSimilarity, VOYAGE_MODEL } from "./voyage";

/** How many top passages to inject, and the cosine floor below which we inject none. */
const TOP_K = 8;
const RAG_MIN_SCORE = 0.45;
/** Upper bound on chunks scanned per query (brute-force cosine in JS). */
const MAX_SCAN = 1000;

interface ChunkRow {
  source_title?: string | null;
  section?: string | null;
  chunk_text?: string | null;
  embedding?: number[] | null;
}

export interface RagRetrieval {
  /** The citations block to append to the system prompt, or null when no strong match. */
  block: string | null;
  /** The best cosine score seen (for logging / threshold tuning). */
  topScore: number;
}

/**
 * Retrieve the top governing-document passages for `query` in `orgId`. Always
 * embeds + charges the query (the cost is incurred regardless of match); returns
 * a non-null `block` only when the best match clears RAG_MIN_SCORE.
 */
export async function retrieveRagContext(
  orgId: string,
  query: string,
  userId: string | null
): Promise<RagRetrieval> {
  const url = process.env.DIRECTUS_URL;
  const token = process.env.DIRECTUS_STATIC_TOKEN;
  if (!url || !token) return { block: null, topScore: 0 };

  // Embed the question, then meter it (best-effort — never block the answer).
  const { vectors, tokens } = await embed([query], "query");
  if (tokens > 0) {
    try {
      await chargeForEmbedding({ orgId, userId, tokens, model: VOYAGE_MODEL });
    } catch (err: any) {
      console.warn("[rag] query-embed charge failed:", err?.message || err);
    }
  }
  const qv = vectors[0];
  if (!qv) return { block: null, topScore: 0 };

  // Pull the org's chunks and score them in-process.
  const filter = encodeURIComponent(JSON.stringify({ organization: { _eq: orgId } }));
  const fields = encodeURIComponent("source_title,section,chunk_text,embedding");
  const res = await fetch(`${url}/items/ai_doc_chunks?filter=${filter}&fields=${fields}&limit=${MAX_SCAN}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return { block: null, topScore: 0 };
  const rows = (((await res.json()) as { data?: ChunkRow[] })?.data ?? []).filter((r) => Array.isArray(r.embedding));
  if (!rows.length) return { block: null, topScore: 0 };

  const scored = rows
    .map((r) => ({ r, score: cosineSimilarity(qv, r.embedding as number[]) }))
    .sort((a, b) => b.score - a.score);
  const topScore = scored[0]?.score ?? 0;
  const top = scored.slice(0, TOP_K).filter((s) => s.score >= RAG_MIN_SCORE);
  if (!top.length) return { block: null, topScore };

  const passages = top.map((s, i) => {
    const title = s.r.source_title || "Document";
    const cite = s.r.section ? `${title} §${s.r.section}` : title;
    return `[${i + 1}] ${cite}\n${String(s.r.chunk_text ?? "").trim()}`;
  });
  const block = [
    "Relevant passages from this association's governing documents. Use them to",
    "answer the user's question, and CITE the source inline as [Title §section].",
    "If the answer isn't in these passages, say so rather than inventing it.",
    "",
    ...passages,
  ].join("\n");
  return { block, topScore };
}
