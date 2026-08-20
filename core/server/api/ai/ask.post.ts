/**
 * POST /api/ai/ask — "Ask the HOA".
 *
 * The owner-facing half of Pillar C. An owner asks their community a question
 * and gets an answer built from the community's own records, with citations they
 * can go and check — or gets told, honestly, that the records do not answer it.
 *
 * ── Why this is not a flag on /api/ai/chat ──────────────────────────────────
 *
 * The staff assistant is gated by `requireOrgComposeAccess`: admins, board
 * members, property managers. That is the right gate for something that can
 * propose actions, and it is exactly why owners cannot use it — VISION's honest
 * summary of the gap is one clause, *"owners can't query it"*.
 *
 * Different audience, different gate, different prompt, and read-only forever.
 * Sharing a handler would put one `if` between an owner and the action tools.
 * Here there are no tools at all: read-only is enforced by there being nothing
 * to call, not by a system prompt asking nicely.
 *
 * ── Who sees what ───────────────────────────────────────────────────────────
 *
 * Every hat is resolved here and judged by `#core/shared/ledger/visibility` —
 * the same module `/api/org/ledger` uses. The retriever applies
 * `visibilityFilter(viewer)` to the vector scan AND to the authoritative
 * re-read. An owner asking about dues cannot reach the board-only
 * `payment_recorded` entries, because they are filtered out of the query before
 * anything is scored.
 *
 * ── Cite or refuse ──────────────────────────────────────────────────────────
 *
 * With nothing retrieved from either source, this route does not call the model
 * at all. The community is not charged, and the model is never in a position to
 * answer a CC&R question from its training data — which is where the legal
 * weight is. `decideAnswerability` owns that call.
 */

import { MODEL_TIERS } from "#core/shared/ai/credits";
import {
  ASK_TOP_K,
  buildAskSystemPrompt,
  buildLedgerBlock,
  decideAnswerability,
  ledgerCitation,
} from "#core/shared/ai/ask";
import type { LedgerViewer } from "#core/shared/ledger/visibility";
import { canViewLedger } from "#core/shared/ledger/visibility";
import { descriptorFor } from "#core/shared/ledger/events";
import { readItems } from "@directus/sdk";

/** Long enough for a cited paragraph, short enough that a bad prompt is cheap. */
const MAX_TOKENS = 700;
/** Owners get the good model: a wrong answer about the rules is the expensive outcome. */
const ASK_MODEL = MODEL_TIERS.standard;

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const userId = (session.user as any)?.id ?? null;

  const body = await readBody(event);
  const question = String(body?.question || "").trim();
  if (!question) throw createError({ statusCode: 400, message: "question is required" });
  if (question.length > 500) {
    throw createError({ statusCode: 400, message: "That question is too long — try asking it in a sentence or two." });
  }

  // Slug or id, resolved from the URL the asker is on — the selected org resets
  // to the user's first membership on a hard navigation.
  const orgId = await resolveOrgId({ orgId: body?.orgId, slug: body?.slug });
  if (!orgId) throw createError({ statusCode: 400, message: "orgId or slug is required" });

  // Every hat this person wears in THIS community. Resolved here, judged there.
  const [admin, membership, boardTitle, grants, orgs] = await Promise.all([
    checkAdminAccess(event, orgId),
    checkMembership(event, orgId),
    getBoardPosition(event, orgId),
    getManagerGrants(event, orgId),
    getTypedDirectus().request(
      readItems("hoa_organizations", {
        filter: { id: { _eq: orgId } },
        fields: ["name"] as any,
        limit: 1,
      })
    ) as Promise<any[]>,
  ]);

  const viewer: LedgerViewer = {
    isAdmin: admin.isAdmin === true,
    isMember: membership.isMember === true,
    isBoard: boardTitle !== null,
    isManager: grants !== null,
  };

  // A stranger who guesses a slug gets a closed door, not an empty answer.
  if (!canViewLedger(viewer)) {
    throw createError({
      statusCode: 403,
      statusMessage: "This community's records are for its members.",
    });
  }

  const organizationName = orgs?.[0]?.name ?? "your association";

  // Refuse at zero balance the way chat does — friendly, and readable by the UI.
  const wallet = await getWalletSummary(orgId);
  if (wallet.balanceCredits <= 0) {
    setResponseStatus(event, 402);
    return { error: "insufficient_credits", balanceCredits: 0 };
  }

  // ── Retrieval ────────────────────────────────────────────────────────────
  // Both sources, in parallel. Either may come back empty; neither may throw.
  const [docs, ledger] = await Promise.all([
    isRagConfigured()
      ? retrieveRagContext(orgId, question, userId).catch((err: any) => {
          console.warn("[ask] doc retrieval failed:", err?.message || err);
          return { block: null as string | null, topScore: 0 };
        })
      : Promise.resolve({ block: null as string | null, topScore: 0 }),
    retrieveLedgerContext({ orgId, question, viewer, userId }),
  ]);

  const ledgerBlock = buildLedgerBlock(ledger.entries);

  // `ledger.relevant`, NOT `ledger.entries.length`. The selection deliberately
  // carries the most recent entries whatever they score, so measuring
  // answerability by what it returned would make every community with any
  // history permanently "answerable" — and the promise that an unanswerable
  // question costs nothing would silently stop holding.
  const answerability = decideAnswerability({
    hasDocuments: !!docs.block,
    ledgerCount: ledger.relevant,
  });

  // The citation list the UI links from — structured, so nothing has to regex
  // the model's prose to find out what it leaned on.
  const citations = ledger.entries.map((e) => ({
    kind: "ledger" as const,
    id: e.id,
    label: ledgerCitation(e),
    title: descriptorFor(e.event_type).label,
    occurredAt: e.occurred_at,
  }));

  if (!answerability.answerable) {
    // No model call, no charge. A question the records cannot answer costs the
    // community nothing and gets an honest reply.
    return {
      answer: answerability.refusal,
      grounded: false,
      citations: [],
      credits: 0,
      balanceCredits: wallet.balanceCredits,
      retrieval: {
      ledgerMode: ledger.mode,
      ledgerTop: ledger.topScore,
      ledgerRelevant: ledger.relevant,
      docTop: docs.topScore,
    },
    };
  }

  const llm = getLlmProvider();
  const system = buildAskSystemPrompt({
    organizationName,
    blocks: [docs.block, ledgerBlock].filter(Boolean) as string[],
  });

  // No tools. Read-only is a property of the call, not of the prompt.
  let completion;
  try {
    completion = await llm.completeWithTools({
      model: ASK_MODEL,
      maxTokens: MAX_TOKENS,
      system: [{ text: system }],
      messages: [{ role: "user", content: question }],
      tools: [],
    });
  } catch (err: any) {
    // An upstream failure is not this person's problem to read. The SDK throws
    // with the provider's own message and a stack, and h3 will happily serialize
    // both to a member who asked their HOA a question — including, in the case
    // that surfaced this, the state of the operator's Anthropic billing.
    // Nothing is charged: `chargeForCompletion` is below this line.
    console.error("[ask] model call failed:", err?.message || err);
    throw createError({
      statusCode: 502,
      statusMessage: "The assistant is unavailable right now. Your community's records are unchanged — try again shortly.",
    });
  }

  const charge = await chargeForCompletion({
    orgId,
    userId,
    usage: completion.usage,
    model: ASK_MODEL,
    feature: "ask",
  });

  return {
    answer: completion.text.trim(),
    grounded: true,
    citations,
    credits: charge.credits,
    balanceCredits: charge.balanceCredits,
    retrieval: {
      ledgerMode: ledger.mode,
      ledgerTop: ledger.topScore,
      ledgerRelevant: ledger.relevant,
      docTop: docs.topScore,
      ledgerUsed: ledger.entries.length,
      topK: ASK_TOP_K,
    },
  };
});
