# Phase 6 — Owner-facing AI: "Ask the HOA"

*Written 2026-08-20, before any code. VISION Pillar C, phase-table row 6, whose
only dependency was Phase 5.*

## The one thing this ships

**An owner can ask their community a question and get an answer that cites the
community's own records — or no answer at all.**

Not the whole of Pillar C. Row 6 lists four things ("Ask the HOA", structured
grounding, AI-on-ledger, State of the Community brief); AI-on-ledger already
shipped in Phase 5 (`ai_action_executed` / `ai_action_undone`), and the other two
are deliberately deferred to a second pass. One surface, read-only, cited,
verified — then widen.

## Why this is the right first slice

Pillar C's honest gap is one sentence in VISION: *"owners can't query it."* The
staff assistant is live and good, and `requireOrgComposeAccess` locks it to
admins, board members and property managers — the three parties who already have
the most access to the community's records. The people the whole product is
pitched to cannot ask it anything.

Everything needed to fix that already exists and is tested. This phase is mostly
wiring, and the one genuinely new decision is the retrieval boundary.

## The load-bearing rule: retrieval narrows through the SAME policy module

`core/shared/ledger/visibility.ts` already answers "may this person see this
row?", and `/api/org/ledger` narrows its query with `visibilityFilter(viewer)`
rather than post-filtering — because post-filtering makes counts and offsets lie.

The AI retrieval must go through that same function, not a second filter beside
it. A retrieval filter that can disagree with the reader is the delinquency-
shaming incident VISION names as the first risk to the brand, arriving through
the one door nobody is watching: an owner asks "has anyone been behind on dues?",
the model gets a board-only `payment_recorded` row in its context, and it answers
helpfully.

Concretely: an owner asking *"when did the board change managers?"* must get
August's `management_transition`, and must not get the board-only
`payment_recorded` row — and the reason must be that both questions were answered
by `visibleTiersFor`, once.

## Shape

**`POST /api/ai/ask`** — new route, deliberately not a flag on `chat.post.ts`.
Different audience, different gate, different prompt, and read-only forever;
sharing a handler would mean one `if` stands between an owner and the action
tools.

| | |
|---|---|
| Gate | an active seat in this community (`checkMembership`), plus whatever else `visibleTiersFor` grants. No compose access, no board office. |
| Grounding — documents | existing `retrieveRagContext()` (Voyage → `ai_doc_chunks`, 22 chunks live on prod). Unchanged, already cites `[Title §section]`. |
| Grounding — ledger | new: the viewer's visible entries, embedded into `ai_ledger_chunks` and retrieved by cosine, cited by id and date. Lexical fallback when Voyage is unconfigured. |
| Model | one non-streaming `completeWithTools` call with **no tools**. Read-only is enforced by there being nothing to call. |
| Metering | `chargeForCompletion({ feature: "ask" })` — `"ask"` is already in the `AiFeature` union. 402 at zero balance, same as chat. |
| State | stateless single-shot. No `ai_conversations` rows; those belong to the staff assistant. Follow-ups ride on the client passing the prior turn back. |

### The pure module — `core/shared/ai/ask.ts`

Everything decidable without I/O, unit-tested like `ledger/visibility.ts` and
`polls/access.ts`:

1. **`embeddableLedgerText(entry)`** — the one text an entry is *represented*
   by: its `summary`, the event's catalogue label, and flat payload values.
   Shared by the indexer and the fallback scorer so what gets embedded and what
   gets matched can never drift apart.
2. **`selectLedgerContext(candidates, opts)`** — top-k, score floor, and a
   recency floor over *already-narrowed, already-scored* candidates. Takes
   scores, not a scorer, so vector and lexical retrieval converge on one
   selection rule. The recency floor is there because "when did X happen" is the
   question owners actually ask, and a semantically mediocre match on the most
   recent transition still beats silence.
3. **`scoreLedgerLexical(text, question)`** — the fallback ranking, used when
   Voyage is unconfigured or an org has no chunks indexed yet. Deterministic and
   inspectable; it is also what makes the feature degrade rather than go dark if
   `VOYAGE_API_KEY` turns out to be missing from Vercel.
4. **`buildGroundingBlock(...)`** — the ledger half of the system prompt, in the
   same shape `retrieveRagContext` already returns for documents, so the two
   sources read as one cited context rather than two grafted formats.
5. **`decideAnswerability(...)`** — **cite or refuse.** With no document passages
   over threshold and no ledger entries over threshold, the route does not call
   the model at all; it returns "I don't have anything in this community's
   records that answers that" and suggests who to ask. An answer that cites
   nothing is a rumour, and a plausible-sounding one about CC&R rules has legal
   weight (VISION's own AI-liability line: *mandatory citations, read-only owner
   AI at launch*). This also means a question the records can't answer costs
   nothing.

`selectLedgerContext` takes entries, never a Directus client — so the only way a
board-only row reaches it is if the route already decided the viewer may see it.

### Citations

Documents keep `[Title §section]`. Ledger entries cite as
`[Ledger · 19 Aug 2026 · #dd0e35fe]` — a date a human can scan and an id prefix
that resolves to a row on `/{slug}/ledger`. The route returns the citation list
as structured data alongside the prose, so the UI links them rather than
regexing the model's output.

### Surface

An ask box on the owner-facing `/{slug}/ledger` page — where an owner already is
when they have a question about the record. One component. A dedicated page and
the nav entry can come after the answer quality is real.

## Explicitly not in v1

- **No tools / no actions.** The `ai-actions.ts` tool loop is for HITL *actions*;
  a read-only Q&A gains a round trip and a failure mode from it and nothing else.
  Structured grounding (VISION build item 3 — "what did we spend on
  landscaping?") is where tool calls earn their place, over
  `core/shared/reporting/ledger.ts` outputs. Second pass.
- **No streaming.** One answer, one charge, one citation list.
- **No State of the Community brief.** It is a scheduled digest over the same
  retrieval; it should be built on top of a retrieval that has been proven right.
- **No change to `ai_doc_chunks`.** Ledger vectors get their own collection
  rather than a `source_type` discriminator on the document index: every ledger
  row carries a `visibility`, documents do not, and a mixed index is one
  forgotten filter away from a doc-only query returning a board-only row.

## How it gets verified before it widens

On the `/transition-test` fixture, which now holds twelve ledger entries
including exactly one board-only row (`payment_recorded`, $450.25) — put there in
Phase 5 precisely so a filter has something to fail to drop:

1. *"When did the board change managers?"* → cites August's
   `management_transition`.
2. *"What did the community spend money on?"* → cites the $2,400.75
   `expense_recorded` (owner-visible).
3. *"Has anyone paid their dues recently?"* asked by an **owner** → cites no
   ledger entry; the `payment_recorded` row is not in the model's context at all.
4. A question the records cannot answer → refuses, cites nothing, charges nothing.

(3) is the acceptance test, and it gets **clicked, not merely unit-tested**. The
fixture had no member-seat login — the transition left nobody with one, and the
demo user's seat was reactivated as an *Agency Admin* — so this phase adds one:
a single Directus user with an active `hoa_members` seat on `transition-test`, no
board office and no admin role. Peter approved that prod row on 2026-08-20. It is
recorded in `go-live-checklist.md` §3d alongside the rest of the fixture, with how
to remove it.

## Order of work

1. `core/shared/ai/ask.ts` + tests. Pure, no route yet.
2. `ai_ledger_chunks` — creation script, the fire-and-forget indexer hung off
   `writeAuditEntry`, and a backfill for the rows that already exist.
3. `POST /api/ai/ask` — membership gate, `visibilityFilter` narrowing, both
   retrievers, cite-or-refuse, metering.
4. The ask box on `/{slug}/ledger`.
5. A member seat on the fixture, then live read-back of all four cases above.

### The indexing rule that must not be broken

**Embedding never blocks or fails a ledger write.** `writeAuditEntry`
deliberately does not swallow failures — a transition that silently isn't
recorded is worse than one that fails loudly — and a third-party embedding
vendor must not be able to turn a Voyage outage into a hole in a community's
permanent record. Indexing is fire-and-forget with its own try/catch, and the
backfill script is what closes any gap it leaves.

The denormalized `visibility` on each chunk is safe for the one reason that
matters: `org_audit_log` is append-only, so a row's visibility is fixed at write
time and the copy cannot drift from the source. Retrieval narrows on it **in the
Directus query**, not after — the same rule `/api/org/ledger` follows.

Gate every step on `pnpm typecheck && pnpm test` from the repo root.

## Operator dependency

`VOYAGE_API_KEY` is in local `.env` and the 22 chunks are live on prod, so the
document half works in dev. **Unverified whether the Vercel environment has the
key** — if it does not, a deployed "Ask the HOA" silently loses its document
citations and answers from the ledger alone. Confirm before this ships to prod;
it is one environment variable, not code.
