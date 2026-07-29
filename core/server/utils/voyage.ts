// Voyage AI embedding client — the embedder behind doc/bylaw RAG. Server-only;
// the key never reaches the client. Voyage is a SEPARATE vendor from Anthropic
// (its own key + billing — embeddings do NOT consume Anthropic tokens), but its
// cost meters into the same per-org AI wallet as an `embed` feature.
//
// Every RAG surface (ingestion hook, retrieval, backfill) is gated on
// isRagConfigured(): with no VOYAGE_API_KEY the whole feature is dark and the
// existing chat is unaffected. Mirrors the shape of anthropic.ts.

/**
 * Resolve the Voyage key from runtimeConfig (preferred) or the raw env. The
 * runtimeConfig read is guarded so this util also works from a standalone tsx
 * script (the backfill), where the Nitro `useRuntimeConfig` auto-import is absent.
 */
export function getVoyageKey(): string | null {
  let fromConfig = "";
  try {
    fromConfig = (useRuntimeConfig().voyageApiKey as string) || "";
  } catch {
    /* not in a Nitro context (e.g. a backfill script) — fall back to env */
  }
  return fromConfig || process.env.VOYAGE_API_KEY || null;
}

/** Is RAG configured? Mirrors isAiConfigured(); the gate for every RAG surface. */
export function isRagConfigured(): boolean {
  return !!getVoyageKey();
}

/**
 * The embedding model. voyage-3.5-lite: cheap ($0.02 / 1M tokens), strong
 * retrieval at HOA scale. Keep in sync with VOYAGE_PRICING in shared/ai/credits.ts.
 */
export const VOYAGE_MODEL = "voyage-3.5-lite";

const VOYAGE_ENDPOINT = "https://api.voyageai.com/v1/embeddings";

export interface EmbedResult {
  /** One unit-normalized vector per input text (so cosine == dot product). */
  vectors: number[][];
  /** Total tokens billed by Voyage across the batch (for wallet metering). */
  tokens: number;
}

/**
 * Embed a batch of texts. `inputType` enables Voyage's asymmetric retrieval:
 * "document" when indexing chunks, "query" when embedding a user question.
 * Throws on a missing key or a non-2xx response — callers gate on
 * isRagConfigured() first and (for ingestion) swallow failures best-effort.
 */
export async function embed(
  texts: string[],
  inputType: "document" | "query"
): Promise<EmbedResult> {
  const apiKey = getVoyageKey();
  if (!apiKey) {
    // Plain Error (not h3's createError) so this works from a tsx script too;
    // callers gate on isRagConfigured() first, so this is a defensive guard.
    throw new Error("RAG is not configured (missing VOYAGE_API_KEY).");
  }
  if (!texts.length) return { vectors: [], tokens: 0 };

  // Hard timeout — without this a slow/unreachable Voyage endpoint hangs the whole
  // chat turn (retrieval is awaited before the model call). Aborts to a throw the
  // caller swallows, degrading to a plain (non-RAG) answer.
  const res = await fetch(VOYAGE_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ input: texts, model: VOYAGE_MODEL, input_type: inputType }),
    signal: AbortSignal.timeout(6000),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Voyage embed failed: HTTP ${res.status} ${detail.slice(0, 300)}`);
  }

  const json = (await res.json()) as {
    data?: { embedding: number[] }[];
    usage?: { total_tokens?: number };
  };
  const vectors = (json.data ?? []).map((d) => d.embedding);
  const tokens = json.usage?.total_tokens ?? 0;
  return { vectors, tokens };
}

/** Cosine similarity. Voyage vectors are unit-normalized, but we normalize the
 *  denominator defensively so a non-normalized input can't skew the score. */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || !a.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
