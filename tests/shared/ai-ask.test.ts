/**
 * "Ask the HOA" — the decidable half.
 *
 * Two of these describe blocks are load-bearing for the product, not just for
 * the code:
 *
 * - **"never decides visibility"** pins the boundary. This module takes entries
 *   that a caller already narrowed with `visibleTiersFor`. If someone ever
 *   "helpfully" adds a tier check here, there are two visibility rules that can
 *   disagree, and the one that loses is the one guarding a neighbour's payment
 *   history.
 * - **"cite or refuse"** pins the promise. An answer with no citation is a
 *   rumour, and a rumour about what the CC&Rs permit has legal weight. The
 *   refusal has to be the default when retrieval comes back empty, not a
 *   fallback someone can decide to skip.
 */

import { describe, it, expect } from "vitest";
import {
  ASK_MIN_SCORE,
  ASK_REFUSAL,
  askDate,
  askTerms,
  buildAskSystemPrompt,
  buildLedgerBlock,
  decideAnswerability,
  embeddableLedgerText,
  ledgerCitation,
  relevantCount,
  scoreLedgerLexical,
  selectLedgerContext,
  type AskableEntry,
} from "#core/shared/ai/ask";

const transition: AskableEntry = {
  id: "aaaaaaaa-1111-4000-8000-000000000001",
  event_type: "management_transition",
  occurred_at: "2026-08-19T12:00:00.000Z",
  summary: "Transition Test HOA moved management from Cedarline Property Group to self-managed.",
  actor_name: "Nina Alvarez",
  payload: { organization_name: "Transition Test HOA", from_manager: "Cedarline Property Group" },
};

const grants: AskableEntry = {
  id: "bbbbbbbb-2222-4000-8000-000000000002",
  event_type: "manager_grants_changed",
  occurred_at: "2026-08-20T19:38:42.837Z",
  summary: "Dana Reyes gained Community feedback.",
  actor_name: "demo@hoaconnect.info",
  payload: { added: ["Community feedback"], organization_name: "Transition Test HOA" },
};

const expense: AskableEntry = {
  id: "cccccccc-3333-4000-8000-000000000003",
  event_type: "expense_recorded",
  occurred_at: "2026-08-18T09:00:00.000Z",
  summary: "$2,400.75 paid to Bright Path Landscaping for spring grounds work.",
  actor_name: "Nina Alvarez",
  payload: { vendor: "Bright Path Landscaping", amount: 2400.75, category: "Landscaping" },
};

const older: AskableEntry = {
  id: "dddddddd-4444-4000-8000-000000000004",
  event_type: "document_published",
  occurred_at: "2026-01-04T09:00:00.000Z",
  summary: "“Amended Rules and Regulations 2026” was published to the library.",
  actor_name: "Nina Alvarez",
  payload: { title: "Amended Rules and Regulations 2026", category: "Rules" },
};

describe("what an entry is represented by", () => {
  it("includes the catalogue label, so a question can find an entry whose summary never says the word", () => {
    // The real case: "Dana Reyes gained Community feedback." contains neither
    // "manager" nor "permission", and "what can our management company do?" is
    // exactly the question an owner asks about it.
    const text = embeddableLedgerText(grants);
    expect(text).toContain("Manager permissions changed");
    expect(text).toContain("Dana Reyes gained Community feedback.");
    expect(scoreLedgerLexical(text, "what permissions does our manager have?")).toBeGreaterThan(
      ASK_MIN_SCORE
    );
  });

  it("pulls the specifics a question names out of the payload", () => {
    const text = embeddableLedgerText(expense);
    expect(text).toContain("Bright Path Landscaping");
    expect(text).toContain("2400.75");
  });

  it("does not repeat a term that appears in several payload keys", () => {
    // `organization_name` is on every payload; four copies of the community's
    // own name should not outweigh the summary.
    const text = embeddableLedgerText(grants);
    const occurrences = text.split("Transition Test HOA").length - 1;
    expect(occurrences).toBe(1);
  });

  it("stays inside its character budget — an embedding is billed by the token", () => {
    const fat: AskableEntry = {
      ...expense,
      payload: Object.fromEntries(
        Array.from({ length: 200 }, (_, i) => [`k${i}`, `value number ${i} with some words`])
      ),
    };
    expect(embeddableLedgerText(fat).length).toBeLessThanOrEqual(1200);
  });
});

describe("the lexical fallback", () => {
  // Not a stub. It is the path that runs when VOYAGE_API_KEY is absent, which is
  // an unverified condition on Vercel — so it is the difference between the
  // feature degrading and the feature going dark.
  it("scores coverage of the QUESTION's terms, not of the entry's", () => {
    const short = scoreLedgerLexical("landscaping", "landscaping");
    const long = scoreLedgerLexical(
      "landscaping and a great many other unrelated words about the building",
      "landscaping"
    );
    expect(short).toBe(1);
    expect(long).toBe(1);
  });

  it("gives partial credit across a shared prefix, so 'payments' finds 'payment'", () => {
    expect(scoreLedgerLexical("A payment was recorded", "payments")).toBeGreaterThan(0);
  });

  it("drops stopwords, so a question made only of them matches nothing", () => {
    expect(askTerms("what is the")).toEqual([]);
    expect(scoreLedgerLexical(embeddableLedgerText(expense), "what is the")).toBe(0);
  });

  it("ranks the right entry first among real fixture entries", () => {
    const q = "what did we spend on landscaping?";
    const ranked = [transition, grants, expense, older]
      .map((e) => ({ e, s: scoreLedgerLexical(embeddableLedgerText(e), q) }))
      .sort((a, b) => b.s - a.s);
    expect(ranked[0]!.e.id).toBe(expense.id);
  });
});

describe("selection", () => {
  const scored = (entries: AskableEntry[], scores: number[]) =>
    entries.map((entry, i) => ({ entry, score: scores[i] ?? 0 }));

  it("keeps the most recent entries regardless of score", () => {
    // "When did the board change managers?" is answered by recency, not by
    // similarity — a mediocre match on last month's transition beats a refusal.
    const picked = selectLedgerContext(scored([grants, transition, expense, older], [0, 0, 0, 0]), {
      recencyFloor: 2,
      topK: 8,
    });
    expect(picked.map((p) => p.id)).toEqual([grants.id, transition.id]);
  });

  it("adds strong matches above the floor and drops weak ones", () => {
    const picked = selectLedgerContext(
      scored([grants, transition, expense, older], [0.1, 0.1, 0.9, 0.05]),
      { recencyFloor: 0, topK: 8 }
    );
    expect(picked.map((p) => p.id)).toEqual([expense.id]);
  });

  it("returns newest first — the feed's own order", () => {
    const picked = selectLedgerContext(
      scored([older, expense, transition, grants], [0.9, 0.9, 0.9, 0.9]),
      { recencyFloor: 0, topK: 8 }
    );
    expect(picked.map((p) => p.id)).toEqual([grants.id, transition.id, expense.id, older.id]);
  });

  it("never returns the same entry twice when it is both recent and a strong match", () => {
    const picked = selectLedgerContext(scored([grants, transition], [0.99, 0.99]), {
      recencyFloor: 2,
      topK: 8,
    });
    expect(picked).toHaveLength(2);
  });

  it("honours topK even when the recency floor is larger", () => {
    const picked = selectLedgerContext(scored([grants, transition, expense, older], [1, 1, 1, 1]), {
      recencyFloor: 4,
      topK: 2,
    });
    expect(picked).toHaveLength(2);
  });

  it("returns nothing for no candidates, and nothing for topK 0", () => {
    expect(selectLedgerContext([])).toEqual([]);
    expect(selectLedgerContext(scored([grants], [1]), { topK: 0 })).toEqual([]);
  });
});

describe("never decides visibility", () => {
  // The boundary this module exists inside. Entries arrive already narrowed by
  // `visibleTiersFor`; a second rule here is a rule that can disagree with the
  // reader, and the ledger's whole promise is that the answer to "may this
  // person see this?" is computed exactly once.
  it("selects whatever it is given, including a board-only row", () => {
    const boardOnly: AskableEntry = {
      id: "eeeeeeee-5555-4000-8000-000000000005",
      event_type: "payment_recorded",
      occurred_at: "2026-08-20T10:00:00.000Z",
      summary: "$450.25 payment recorded for unit 3B.",
      payload: { amount: 450.25 },
    };
    const picked = selectLedgerContext([{ entry: boardOnly, score: 1 }], { recencyFloor: 0 });
    expect(picked.map((p) => p.id)).toEqual([boardOnly.id]);
  });

  it("treats a `visibility` field on an entry as data it does not read", () => {
    // If selection ever starts consulting the column, these two stop agreeing —
    // and the moment they stop agreeing there are two visibility rules in the
    // codebase. Read the header before making this pass.
    const opts = { recencyFloor: 0, topK: 8 };
    const base = { ...expense, id: "ffffffff-6666-4000-8000-000000000006" };
    const asOwners = selectLedgerContext([{ entry: { ...base, visibility: "owners" } as any, score: 1 }], opts);
    const asBoard = selectLedgerContext([{ entry: { ...base, visibility: "board" } as any, score: 1 }], opts);
    expect(asOwners.map((e) => e.id)).toEqual(asBoard.map((e) => e.id));
    expect(asBoard).toHaveLength(1);
  });
});

describe("citations", () => {
  it("cites a date a human can scan and an id that resolves to a real row", () => {
    expect(ledgerCitation(grants)).toBe("Ledger · 20 Aug 2026 · #bbbbbbbb");
  });

  it("does not invent a date it does not have", () => {
    expect(askDate(null)).toBe("undated");
    expect(askDate("not a date")).toBe("undated");
  });

  it("builds a block that tells the model the context is already filtered", () => {
    const block = buildLedgerBlock([grants, expense])!;
    expect(block).toContain("already filtered to what this person is entitled to see");
    expect(block).toContain("[Ledger · 20 Aug 2026 · #bbbbbbbb]");
    expect(block).toContain("Bright Path Landscaping");
  });

  it("returns null rather than an empty heading", () => {
    expect(buildLedgerBlock([])).toBeNull();
  });
});

describe("cite or refuse", () => {
  it("answers when either source produced something", () => {
    expect(decideAnswerability({ hasDocuments: true, ledgerCount: 0 }).answerable).toBe(true);
    expect(decideAnswerability({ hasDocuments: false, ledgerCount: 1 }).answerable).toBe(true);
  });

  it("refuses — and carries the words — when neither did", () => {
    // The route must be able to reply without calling the model, so the refusal
    // text lives here rather than in a prompt.
    const d = decideAnswerability({ hasDocuments: false, ledgerCount: 0 });
    expect(d.answerable).toBe(false);
    expect(d.refusal).toBe(ASK_REFUSAL);
  });

  it("says it would rather say nothing than guess", () => {
    expect(ASK_REFUSAL).toMatch(/rather say nothing than guess/);
  });
});

describe("the system prompt", () => {
  it("forbids answering from general knowledge about HOAs", () => {
    const p = buildAskSystemPrompt({ organizationName: "Transition Test HOA", blocks: ["CTX"] });
    expect(p).toMatch(/Never fill a gap from general knowledge/);
    expect(p).toMatch(/this association's rules are its own/);
  });

  it("tells the model it is read-only and must not offer to act", () => {
    const p = buildAskSystemPrompt({ organizationName: "X", blocks: [] });
    expect(p).toMatch(/You are read-only/);
    expect(p).toMatch(/Do not offer to/);
  });

  it("carries the grounding blocks through verbatim", () => {
    const p = buildAskSystemPrompt({ organizationName: "X", blocks: ["BLOCK-A", "BLOCK-B"] });
    expect(p).toContain("BLOCK-A");
    expect(p).toContain("BLOCK-B");
  });
});


describe("relevance is counted before the recency floor", () => {
  // The seam that keeps "cite or refuse" honest. `selectLedgerContext` puts the
  // last few entries in the prompt whatever they score — right for "what's
  // happened lately?" — but if answerability were measured by what it returned,
  // every community with any history would be permanently answerable and an
  // unanswerable question would stop being free.
  const scored = (scores: number[]) =>
    [grants, transition, expense, older].map((entry, i) => ({ entry, score: scores[i] ?? 0 }));

  it("counts nothing relevant when every candidate is below the floor", () => {
    expect(relevantCount(scored([0.1, 0.05, 0.2, 0]))).toBe(0);
  });

  it("still hands those entries to the prompt via the recency floor", () => {
    // Both are true at once, and that is the point: context travels, the
    // question is still unanswerable.
    const candidates = scored([0.1, 0.05, 0.2, 0]);
    expect(selectLedgerContext(candidates, { recencyFloor: 3 })).toHaveLength(3);
    expect(relevantCount(candidates)).toBe(0);
    expect(
      decideAnswerability({ hasDocuments: false, ledgerCount: relevantCount(candidates) }).answerable
    ).toBe(false);
  });

  it("counts a genuine match and makes the question answerable", () => {
    const candidates = scored([0.1, 0.05, 0.91, 0]);
    expect(relevantCount(candidates)).toBe(1);
    expect(
      decideAnswerability({ hasDocuments: false, ledgerCount: relevantCount(candidates) }).answerable
    ).toBe(true);
  });

  it("uses the same default floor the selection does", () => {
    expect(relevantCount([{ entry: expense, score: ASK_MIN_SCORE }])).toBe(1);
    expect(relevantCount([{ entry: expense, score: ASK_MIN_SCORE - 0.001 }])).toBe(0);
  });
});
