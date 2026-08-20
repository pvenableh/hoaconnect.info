/**
 * "Ask the HOA" — the decidable half, with no I/O in it.
 *
 * Pillar C's promise is that an owner can ask their community a question and
 * get an answer **cited from the community's own records**. VISION's own
 * AI-liability line sets the terms: *mandatory citations, read-only owner AI at
 * launch* — a wrong CC&R answer has legal weight, and a confident uncited one is
 * a rumour with a product's name on it.
 *
 * So this module owns three decisions, and the route owns none of them:
 *
 *   1. **What text represents a ledger entry** (`embeddableLedgerText`). Used by
 *      the indexer AND by the fallback scorer, so what gets embedded and what
 *      gets matched cannot drift apart — a class of bug that is invisible until
 *      retrieval quietly stops working.
 *   2. **Which candidates are worth prompt** (`selectLedgerContext`). Takes
 *      SCORES, not a scorer, so vector retrieval and the lexical fallback
 *      converge on one selection rule instead of two that disagree.
 *   3. **Whether to answer at all** (`decideAnswerability`). With nothing
 *      retrieved, the route must not call the model. A question the records
 *      cannot answer costs the community nothing and gets an honest "I don't
 *      have that", not a plausible paragraph about HOAs in general.
 *
 * ── What this module deliberately does NOT do ───────────────────────────────
 *
 * **It never decides who may see an entry.** That is
 * `core/shared/ledger/visibility.ts`, and the entries reaching `selectLedgerContext`
 * must ALREADY be narrowed by it — narrowed in the query, the way the ledger
 * reader does it, not filtered afterwards. A second visibility rule living here
 * is exactly the "filter that can disagree with the reader" this phase exists to
 * avoid: the delinquency-shaming incident VISION names as the first risk to the
 * whole product, arriving through the one door nobody is watching.
 *
 * If you are about to add a `visibility` check to this file, the bug is
 * upstream.
 *
 * Pure: no Directus, no H3, no network, no clock (callers pass `now`).
 */

import { descriptorFor } from "../ledger/events";

/* ─────────────────────────────────────────────────────────────────────────────
 * What an entry looks like to retrieval
 * ────────────────────────────────────────────────────────────────────────── */

/** The subset of a stored ledger row retrieval needs. Structural, so a route can pass rows straight through. */
export interface AskableEntry {
  readonly id: string;
  readonly event_type: string;
  readonly occurred_at: string;
  readonly summary: string;
  readonly actor_name?: string | null;
  readonly payload?: Record<string, unknown> | null;
}

/** Payload values worth matching on, flattened one level and stringified. */
function payloadTerms(payload: Record<string, unknown> | null | undefined): string[] {
  if (!payload || typeof payload !== "object") return [];
  const out: string[] = [];
  const push = (v: unknown) => {
    if (v === null || v === undefined) return;
    if (typeof v === "string") {
      if (v.trim()) out.push(v.trim());
    } else if (typeof v === "number" || typeof v === "boolean") {
      out.push(String(v));
    } else if (Array.isArray(v)) {
      for (const item of v.slice(0, 20)) push(item);
    } else if (typeof v === "object") {
      for (const item of Object.values(v as Record<string, unknown>).slice(0, 20)) push(item);
    }
  };
  for (const v of Object.values(payload)) push(v);
  return out;
}

/**
 * The one text an entry is represented by, for embedding and for matching.
 *
 * The `summary` alone is not enough. "Dana Reyes gained Community feedback."
 * never contains the word "manager" or "permission", and *"what can our
 * management company do?"* is precisely the question an owner asks about it —
 * so the event's catalogue label ("Manager permissions changed") is part of the
 * representation. The payload carries the specifics a question names: a vendor,
 * an amount, a document title, the option that won a vote.
 *
 * Truncated, because an embedding request is billed by the token and a payload
 * with a hundred grant keys in it is not more retrievable than the first part
 * of it.
 */
export function embeddableLedgerText(entry: AskableEntry, maxChars = 1200): string {
  const label = descriptorFor(entry.event_type).label;
  const parts = [
    label,
    entry.summary?.trim() || "",
    entry.actor_name?.trim() || "",
    ...payloadTerms(entry.payload),
  ].filter(Boolean);

  // De-duplicated in order: `organization_name` repeats on every payload, and a
  // term that appears four times should not outweigh the summary.
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const p of parts) {
    const key = p.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(p);
  }
  return unique.join(" · ").slice(0, maxChars);
}

/* ─────────────────────────────────────────────────────────────────────────────
 * The lexical fallback
 * ────────────────────────────────────────────────────────────────────────── */

const STOPWORDS = new Set([
  "a", "an", "and", "any", "are", "as", "at", "be", "been", "but", "by", "can",
  "did", "do", "does", "for", "from", "had", "has", "have", "how", "i", "in",
  "is", "it", "its", "me", "my", "of", "on", "or", "our", "she", "he", "they",
  "the", "their", "there", "this", "to", "was", "we", "were", "what", "when",
  "where", "which", "who", "whom", "why", "will", "with", "you", "your",
]);

/** Words worth matching on: lowercased, de-punctuated, stopwords and 1-char noise dropped. */
export function askTerms(text: string): string[] {
  return String(text ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w));
}

/**
 * A 0–1 relevance score for one entry's text against a question.
 *
 * The fallback path, for when Voyage is unconfigured (the Vercel key is
 * unverified) or an org has nothing indexed yet. It is the reason this feature
 * degrades instead of going dark, so it is a real code path and not a stub.
 *
 * Coverage of the QUESTION's terms, not of the entry's: a long entry should not
 * be penalised for containing words the question didn't ask about, and a
 * question whose every word appears should score 1 whether the entry is one
 * sentence or ten. Prefix matching earns partial credit so "payments" finds
 * "payment" without a stemmer.
 */
export function scoreLedgerLexical(text: string, question: string): number {
  const q = askTerms(question);
  if (!q.length) return 0;
  const hay = askTerms(text);
  if (!hay.length) return 0;
  const hayset = new Set(hay);

  let hits = 0;
  for (const term of new Set(q)) {
    if (hayset.has(term)) {
      hits += 1;
      continue;
    }
    // Partial credit for a shared prefix of 4+ characters ("manager"/"managers",
    // "payment"/"payments", "vote"/"voted"). Cheap, and enough at HOA scale.
    if (term.length >= 4 && hay.some((h) => h.startsWith(term.slice(0, 4)))) hits += 0.5;
  }
  return Math.min(1, hits / new Set(q).size);
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Selection
 * ────────────────────────────────────────────────────────────────────────── */

export interface ScoredEntry {
  readonly entry: AskableEntry;
  /** 0–1. Cosine from the vector path, lexical coverage from the fallback. */
  readonly score: number;
}

export interface SelectOptions {
  /** Most entries to put in the prompt. */
  readonly topK?: number;
  /** Below this, a match is noise. */
  readonly minScore?: number;
  /**
   * How many of the most RECENT entries to keep regardless of score.
   *
   * "When did the board change managers?" and "what's happened lately?" are the
   * two questions owners actually ask, and both are answered by recency rather
   * than by similarity. A semantically mediocre match on last month's
   * transition beats a refusal.
   */
  readonly recencyFloor?: number;
}

export const ASK_TOP_K = 8;
export const ASK_MIN_SCORE = 0.38;
export const ASK_RECENCY_FLOOR = 3;

/**
 * How many candidates are relevant on their own merits.
 *
 * **Not the same as `selectLedgerContext(...).length`, and the difference is the
 * whole of "cite or refuse".** The recency floor puts the last few entries in
 * the prompt whatever they score, which is right — "what's happened lately?"
 * should work. But if answerability were measured by what the selection
 * returned, every community with any history would always be "answerable", the
 * route would always call the model, and the promise that a question the records
 * cannot answer costs nothing would quietly stop being true.
 *
 * So relevance is counted BEFORE the recency floor is applied. Recent entries
 * still travel as context; they just do not, by themselves, make a question
 * answerable.
 */
export function relevantCount(
  candidates: readonly ScoredEntry[],
  minScore: number = ASK_MIN_SCORE
): number {
  return candidates.filter((c) => c.score >= minScore).length;
}

/**
 * The entries worth spending prompt on, newest first.
 *
 * Input must ALREADY be narrowed to what this viewer may see — see the header.
 * Scores come from whichever retriever ran; this function is the single place
 * that turns scores into a selection, so the vector path and the lexical path
 * cannot disagree about what "relevant enough" means.
 */
export function selectLedgerContext(
  candidates: readonly ScoredEntry[],
  opts: SelectOptions = {}
): readonly AskableEntry[] {
  const topK = opts.topK ?? ASK_TOP_K;
  const minScore = opts.minScore ?? ASK_MIN_SCORE;
  const recencyFloor = opts.recencyFloor ?? ASK_RECENCY_FLOOR;
  if (topK <= 0 || !candidates.length) return [];

  const byRecency = [...candidates].sort(
    (a, b) => Date.parse(b.entry.occurred_at || "") - Date.parse(a.entry.occurred_at || "")
  );

  const keep = new Map<string, AskableEntry>();
  for (const c of byRecency.slice(0, Math.max(0, recencyFloor))) keep.set(c.entry.id, c.entry);

  const byScore = [...candidates].sort((a, b) => b.score - a.score);
  for (const c of byScore) {
    if (keep.size >= topK) break;
    if (c.score < minScore) break;
    keep.set(c.entry.id, c.entry);
  }

  // Newest first: the feed's own order, and the order a reader expects a
  // community's history in.
  return [...keep.values()]
    .sort((a, b) => Date.parse(b.occurred_at || "") - Date.parse(a.occurred_at || ""))
    .slice(0, topK);
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Citations and the grounding block
 * ────────────────────────────────────────────────────────────────────────── */

/** "19 Aug 2026" — short, unambiguous, and not locale-dependent on the server. */
export function askDate(iso: string | null | undefined): string {
  const ms = Date.parse(String(iso ?? ""));
  if (!Number.isFinite(ms)) return "undated";
  const d = new Date(ms);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/**
 * How a ledger entry is cited: `Ledger · 19 Aug 2026 · #dd0e35fe`.
 *
 * A date a human can scan and an id prefix that resolves to a real row on
 * `/{slug}/ledger`. The id is what makes the citation checkable rather than
 * decorative — an owner who does not believe the answer can go and read the row.
 */
export function ledgerCitation(entry: AskableEntry): string {
  return `Ledger · ${askDate(entry.occurred_at)} · #${String(entry.id ?? "").slice(0, 8)}`;
}

/**
 * The ledger half of the grounding, shaped like the document half.
 *
 * `retrieveRagContext` already returns a numbered, cited passage block for
 * governing documents; this deliberately mirrors it so the model sees one cited
 * context in two sections rather than two grafted formats. Returns null when
 * there is nothing — the caller must not send an empty heading.
 */
export function buildLedgerBlock(entries: readonly AskableEntry[]): string | null {
  if (!entries.length) return null;
  const lines = entries.map((e) => {
    const label = descriptorFor(e.event_type).label;
    const payload = JSON.stringify(e.payload ?? {});
    return [
      `[${ledgerCitation(e)}] ${label}`,
      e.summary?.trim() || "",
      payload && payload !== "{}" ? `Details: ${payload.slice(0, 800)}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  });
  return [
    "Entries from this association's Community Ledger — its permanent record of",
    "what happened to it. These are the ONLY ledger entries you may refer to, and",
    "they are already filtered to what this person is entitled to see. CITE the",
    "entry inline exactly as [Ledger · date · #id].",
    "",
    ...lines,
  ].join("\n");
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Cite or refuse
 * ────────────────────────────────────────────────────────────────────────── */

export interface Answerability {
  /** May the route call the model at all? */
  readonly answerable: boolean;
  /** The verbatim reply when it may not. Never null when `answerable` is false. */
  readonly refusal: string | null;
}

export const ASK_REFUSAL =
  "I couldn't find anything in this community's documents or its ledger that answers that. " +
  "I only answer from your association's own records, so I'd rather say nothing than guess. " +
  "Your board or property manager can help with anything that isn't written down yet.";

/**
 * Whether there is anything to answer FROM.
 *
 * With no document passages over threshold and no ledger entries selected, the
 * route returns `refusal` without calling the model. Three things follow from
 * that, all of them intended: the community is not charged for a question its
 * records cannot answer; the model is never in a position to fill a vacuum with
 * general knowledge about HOAs; and the honest failure mode of this feature is
 * silence rather than confident invention.
 */
export function decideAnswerability(input: {
  readonly hasDocuments: boolean;
  readonly ledgerCount: number;
}): Answerability {
  if (input.hasDocuments || input.ledgerCount > 0) {
    return { answerable: true, refusal: null };
  }
  return { answerable: false, refusal: ASK_REFUSAL };
}

/**
 * The system prompt for an owner-facing answer.
 *
 * Read-only is enforced by the route passing no tools, not by this text — but
 * the instruction to refuse rather than reach outside the provided context is
 * the only defence against the model answering a bylaw question from its
 * training data, which is where the legal weight is.
 */
export function buildAskSystemPrompt(input: {
  readonly organizationName: string;
  readonly blocks: readonly string[];
}): string {
  return [
    `You are answering a question for a member of ${input.organizationName}, a homeowners association.`,
    "",
    "Rules, in order of importance:",
    "1. Answer ONLY from the context below. If it does not contain the answer, say so plainly and suggest asking the board or property manager. Never fill a gap from general knowledge about how HOAs usually work — this association's rules are its own.",
    "2. Cite every factual claim inline, using the citation shown with each source.",
    "3. You are read-only. You cannot change anything, send anything, or promise that anyone will. Do not offer to.",
    "4. Be brief and concrete. Two or three sentences is usually the right length.",
    "5. Quote a governing document's wording when the exact words matter, and say which document it is.",
    "",
    ...input.blocks,
  ].join("\n");
}
