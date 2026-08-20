/**
 * Community Ledger retrieval — the read side of `ai_ledger_chunks`, and the one
 * place in Phase 6 where the visibility boundary is enforced.
 *
 * ── The boundary ────────────────────────────────────────────────────────────
 *
 * The tiers a viewer may read come from `visibilityFilter(viewer)` — the SAME
 * call `/api/org/ledger` narrows its query with. Not a second filter that means
 * the same thing; the same function. A retrieval filter that can disagree with
 * the reader is how a neighbour's payment history reaches a chatbot's context
 * window, and VISION names that incident as the first risk to the whole product.
 *
 * It is applied TWICE, on purpose:
 *
 *   1. to the vector scan, so a board-only entry's TEXT is never even loaded
 *      into memory for scoring;
 *   2. to the authoritative re-read from `org_audit_log`, so the answer is built
 *      from the ledger rows themselves rather than from a denormalized copy.
 *
 * Two applications of one function is defence in depth. Two functions would be
 * the bug. If the chunk table's denormalized `visibility` were ever wrong, step
 * 2 still withholds the row.
 *
 * ── Degrading rather than going dark ────────────────────────────────────────
 *
 * With no `VOYAGE_API_KEY` (unverified on Vercel) or nothing indexed yet for an
 * org, retrieval falls back to the deterministic lexical scorer in
 * `#core/shared/ai/ask` over the org's recent visible entries. Same selection
 * rule, same citations, worse recall. That is the difference between "Ask the
 * HOA" being slightly weaker and it being broken.
 */

import { readItems } from "@directus/sdk";
import { embed, isRagConfigured, VOYAGE_MODEL, cosineSimilarity } from "./voyage";
import {
  embeddableLedgerText,
  relevantCount,
  scoreLedgerLexical,
  selectLedgerContext,
  type AskableEntry,
  type ScoredEntry,
} from "#core/shared/ai/ask";
import { visibilityFilter } from "#core/shared/ledger/visibility";
import type { LedgerViewer } from "#core/shared/ledger/visibility";

/** Chunks scanned per question. Brute-force cosine in JS, like the doc index. */
const MAX_SCAN = 2000;
/** How many recent entries the lexical fallback considers. */
const FALLBACK_WINDOW = 200;

const ENTRY_FIELDS = [
  "id",
  "event_type",
  "occurred_at",
  "actor_name",
  "visibility",
  "summary",
  "payload",
] as const;

export interface LedgerRetrieval {
  /** The entries to ground on, newest first. Already visibility-narrowed, twice. */
  readonly entries: readonly AskableEntry[];
  /**
   * How many of those cleared the score floor on their own merits — i.e. before
   * the recency floor added the latest few. This, not `entries.length`, is what
   * decides whether the question is answerable at all; see `relevantCount`.
   */
  readonly relevant: number;
  /** "vector" | "lexical" | "none" — reported so a live run can tell which path ran. */
  readonly mode: "vector" | "lexical" | "none";
  readonly topScore: number;
}

const EMPTY: LedgerRetrieval = { entries: [], relevant: 0, mode: "none", topScore: 0 };

/**
 * The entries in `orgId` worth grounding an answer to `question` on, for a
 * viewer who has already had their hats resolved.
 *
 * Never throws: a retrieval failure should cost the answer its ledger citations,
 * not return a 500 to someone who asked their HOA a question.
 */
export async function retrieveLedgerContext(input: {
  readonly orgId: string;
  readonly question: string;
  readonly viewer: LedgerViewer;
  readonly userId: string | null;
}): Promise<LedgerRetrieval> {
  const { orgId, question, viewer, userId } = input;

  // The single source of truth for who sees what. `null` means this person may
  // see no tier at all — they get nothing, and the route has already refused
  // them anyway.
  const tierFilter = visibilityFilter(viewer);
  if (!tierFilter || !orgId || !question.trim()) return EMPTY;

  try {
    const vector = await retrieveByVector(orgId, question, tierFilter, userId);
    if (vector) return vector;
    return await retrieveByLexical(orgId, question, tierFilter);
  } catch (err: any) {
    console.warn("[ledger-retrieve] failed, answering without ledger context:", err?.message || err);
    return EMPTY;
  }
}

/** Cosine over the org's indexed chunks. Returns null when there is no index to use. */
async function retrieveByVector(
  orgId: string,
  question: string,
  tierFilter: Record<string, any>,
  userId: string | null
): Promise<LedgerRetrieval | null> {
  if (!isRagConfigured()) return null;

  const url = process.env.DIRECTUS_URL;
  const token = process.env.DIRECTUS_STATIC_TOKEN;
  if (!url || !token) return null;

  // Narrowed in the QUERY: a board-only chunk is never loaded for scoring.
  const filter = encodeURIComponent(
    JSON.stringify({ organization: { _eq: orgId }, ...tierFilter })
  );
  const fields = encodeURIComponent("entry,occurred_at,embedding");
  const res = await fetch(
    `${url}/items/ai_ledger_chunks?filter=${filter}&fields=${fields}&limit=${MAX_SCAN}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) return null;

  const rows = (((await res.json()) as { data?: any[] })?.data ?? []).filter((r) =>
    Array.isArray(r?.embedding)
  );
  // Nothing indexed for this community yet — the backfill has not run, or every
  // entry predates the indexer. Fall through to lexical rather than answering
  // with no ledger at all.
  if (!rows.length) return null;

  const { vectors, tokens } = await embed([question], "query");
  if (tokens > 0) {
    try {
      await chargeForEmbedding({ orgId, userId, tokens, model: VOYAGE_MODEL });
    } catch (err: any) {
      console.warn("[ledger-retrieve] query-embed charge failed:", err?.message || err);
    }
  }
  const qv = vectors[0];
  if (!qv) return null;

  const scored = rows
    .map((r) => ({ entryId: String(r.entry), score: cosineSimilarity(qv, r.embedding as number[]) }))
    .sort((a, b) => b.score - a.score);
  const topScore = scored[0]?.score ?? 0;

  // The authoritative rows, re-narrowed by the same filter — see the header.
  const entries = await readEntriesById(
    orgId,
    tierFilter,
    scored.slice(0, MAX_SCAN).map((s) => s.entryId)
  );
  if (!entries.length) return { entries: [], relevant: 0, mode: "vector", topScore };

  const byId = new Map(scored.map((s) => [s.entryId, s.score]));
  const candidates: ScoredEntry[] = entries.map((entry) => ({
    entry,
    score: byId.get(entry.id) ?? 0,
  }));

  return {
    entries: selectLedgerContext(candidates),
    relevant: relevantCount(candidates),
    mode: "vector",
    topScore,
  };
}

/** The deterministic fallback: lexical coverage over the org's recent visible entries. */
async function retrieveByLexical(
  orgId: string,
  question: string,
  tierFilter: Record<string, any>
): Promise<LedgerRetrieval> {
  const rows = (await getTypedDirectus().request(
    readItems("org_audit_log", {
      filter: { organization: { _eq: orgId }, ...tierFilter },
      sort: ["-occurred_at"],
      fields: ENTRY_FIELDS as unknown as string[],
      limit: FALLBACK_WINDOW,
    } as any)
  )) as any[];

  const candidates: ScoredEntry[] = (rows ?? []).map((entry) => ({
    entry: entry as AskableEntry,
    score: scoreLedgerLexical(embeddableLedgerText(entry as AskableEntry), question),
  }));
  const topScore = candidates.reduce((m, c) => Math.max(m, c.score), 0);

  return {
    entries: selectLedgerContext(candidates),
    relevant: relevantCount(candidates),
    mode: "lexical",
    topScore,
  };
}

/** Authoritative entries by id, re-narrowed by the viewer's tiers. */
async function readEntriesById(
  orgId: string,
  tierFilter: Record<string, any>,
  ids: readonly string[]
): Promise<AskableEntry[]> {
  const wanted = [...new Set(ids.filter(Boolean))];
  if (!wanted.length) return [];
  const rows = (await getTypedDirectus().request(
    readItems("org_audit_log", {
      filter: { organization: { _eq: orgId }, ...tierFilter, id: { _in: wanted } },
      fields: ENTRY_FIELDS as unknown as string[],
      limit: wanted.length,
    } as any)
  )) as any[];
  return (rows ?? []) as AskableEntry[];
}
