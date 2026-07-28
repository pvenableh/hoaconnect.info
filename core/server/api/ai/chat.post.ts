// POST /api/ai/chat — stream a contextual AI-assistant turn. Auth-gated,
// org-scoped, and metered: real token usage is debited from the org wallet on
// completion, and the call is refused up front when the wallet is empty.
// Conversations + turns persist to ai_conversations / ai_messages so the panel
// can resume. Read-only at launch — the assistant answers and drafts; it never
// takes actions. Streams Server-Sent Events:
//   { type: "meta", conversationId }   — sent first so the client can resume
//   { type: "delta", text }            — incremental model output
//   { type: "done", credits, balanceCredits }
//   { type: "error", message }

import { createItem, readItem, readItems, updateItem } from "@directus/sdk";
import { MODEL_TIERS, type ModelTier } from "#core/shared/ai/credits";
import { getLlmProvider } from "#core/server/utils/llm/provider";
import type { SystemBlock } from "#core/server/utils/llm/types";

/** Newest-to-oldest history we replay to the model (keeps the prompt bounded). */
const HISTORY_LIMIT = 30;

/** A human label for the system prompt, derived from the caller's actor hats. */
function actorLabelFor(actors: string[]): string {
  if (actors.includes("admin")) return "an administrator";
  if (actors.some((a) => a.startsWith("board"))) return "a board member";
  if (actors.includes("property_manager")) return "a property manager";
  return "a staff member";
}

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const userId = (session.user as any)?.id ?? null;

  const body = await readBody(event);
  const orgId = String(body?.orgId || "").trim();
  const message = String(body?.message || "").trim();
  const conversationIdIn = body?.conversationId ? String(body.conversationId) : null;
  const context = body?.context && typeof body.context === "object" ? body.context : null;
  if (!orgId) throw createError({ statusCode: 400, message: "orgId is required" });
  if (!message) throw createError({ statusCode: 400, message: "message is required" });

  // Awareness gate: sources the user switched OFF in the "what the AI can see"
  // chip. Empty (the default) grounds normally; a listed key is never fetched or
  // sent. Keys: "organization" | "documents" | "entity".
  const excludedContext: string[] = Array.isArray(body?.excludedContext)
    ? body.excludedContext.map((k: unknown) => String(k))
    : [];
  const allow = (k: string) => !excludedContext.includes(k);

  // Authorization — must be a comms-capable actor (admin / board / PM) in this org.
  const actors = await requireOrgComposeAccess(event, orgId);

  // Refuse at zero balance (friendly, not a hard error the UI can't read).
  const summary = await getWalletSummary(orgId);
  if (summary.balanceCredits <= 0) {
    setResponseStatus(event, 402);
    return { error: "insufficient_credits", balanceCredits: 0 };
  }

  // AI must be configured before we open a stream (getLlmProvider throws 503
  // when the key is missing — same gate as the old getAnthropic() call).
  const llm = getLlmProvider();

  // Adaptive model: default fast (Haiku). A client tier override always wins;
  // otherwise we escalate to standard (Sonnet) when the turn is "heavy" — either
  // the client asked, or doc/bylaw RAG (below) surfaced relevant governing-doc
  // passages worth the deeper reasoning.
  const requestedTier = ["fast", "standard", "max"].includes(body?.tier) ? (body.tier as ModelTier) : null;
  let heavy = body?.heavy === true;

  // Doc/bylaw RAG: embed the question, score it against the org's indexed chunks,
  // and keep the matched passages to inject below (escalating to Sonnet). No-op
  // unless VOYAGE_API_KEY is set; a retrieval failure degrades to a plain answer.
  let ragBlock: string | null = null;
  if (isRagConfigured() && allow("documents")) {
    try {
      const rag = await retrieveRagContext(orgId, message, userId);
      ragBlock = rag.block;
      if (ragBlock) heavy = true;
    } catch (err: any) {
      console.warn("RAG retrieval failed (continuing without):", err?.message || err);
    }
  }

  const tier: ModelTier = requestedTier ?? (heavy ? "standard" : "fast");
  const model = MODEL_TIERS[tier] ?? MODEL_TIERS.fast;
  const isFast = model === MODEL_TIERS.fast;

  const directus = getTypedDirectus();

  // Resolve org name for the system prompt (best-effort).
  let orgName: string | null = null;
  try {
    const org = (await directus.request(
      readItem("hoa_organizations", orgId, { fields: ["name"] })
    )) as { name?: string };
    orgName = org?.name ?? null;
  } catch {
    /* non-fatal */
  }

  // Resolve / create the conversation (org-scoped). An unknown or foreign id is
  // treated as a fresh conversation rather than leaking across tenants.
  let conversationId: string | null = null;
  if (conversationIdIn) {
    try {
      const rows = (await directus.request(
        readItems("ai_conversations", {
          filter: { id: { _eq: conversationIdIn }, organization: { _eq: orgId } },
          fields: ["id"],
          limit: 1,
        })
      )) as { id: string }[];
      if (rows?.[0]) conversationId = rows[0].id;
    } catch {
      /* fall through to create */
    }
  }
  if (!conversationId) {
    const title = message.length > 60 ? `${message.slice(0, 60)}…` : message;
    // Scope the new thread to what the user was looking at, so it can later be
    // resumed per-entity (a member/vendor/project/ticket's own thread) or
    // per-route. Entity-anchored when an entityId is present, else route/scope.
    const convoContext = context
      ? {
          entityType: context.entityType || undefined,
          entityId: context.entityId ? String(context.entityId) : undefined,
          label: context.label || undefined,
          route: context.route || undefined,
          scope: context.scope || undefined,
        }
      : null;
    const created = (await directus.request(
      createItem("ai_conversations", {
        organization: orgId,
        user: userId,
        title,
        model,
        context: convoContext,
      } as any)
    )) as { id: string };
    conversationId = created.id;
  }

  // Prior turns (oldest→newest) for replay.
  let history: { role: "user" | "assistant"; content: string }[] = [];
  try {
    const rows = (await directus.request(
      readItems("ai_messages", {
        filter: { conversation: { _eq: conversationId } },
        fields: ["role", "content"],
        sort: ["-date_created"],
        limit: HISTORY_LIMIT,
      })
    )) as { role: "user" | "assistant"; content?: string | null }[];
    history = rows
      .reverse()
      .filter((r) => r.content)
      .map((r) => ({ role: r.role, content: String(r.content) }));
  } catch {
    /* new/empty conversation */
  }

  // Compose the user turn, appending a compact page-context hint when present.
  // The entity-specific hint is dropped when the user excluded "entity"; a plain
  // route orientation (no entity) is always harmless to keep.
  let userText = message;
  const keepHint = allow("entity") || !context?.entityType;
  if (context && keepHint && (context.label || context.route || context.summary)) {
    const where = context.label || context.route;
    const ent = context.entityType ? ` (${context.entityType}${context.entityId ? ` ${context.entityId}` : ""})` : "";
    const sum = context.summary ? ` — ${String(context.summary).slice(0, 240)}` : "";
    userText += `\n\n[The user is currently viewing: ${where}${ent}${sum}]`;
  }

  // System = stable chat prompt + cacheable org-context block (breakpoint on the
  // last block caches both across the conversation's turns; 5-min TTL). The org
  // block is skipped when the user toggled "organization" off.
  const systemInput: SystemBlock[] = [
    { text: chatSystemPrompt({ orgName, actorLabel: actorLabelFor(actors) }) },
  ];
  if (allow("organization")) {
    const orgContext = await getOrgContextCached(orgId);
    systemInput.push({ text: orgContext, cache: true });
  }
  // Trailing, query-specific RAG passages — placed AFTER the cached prefix so the
  // org-context cache breakpoint still applies; this block itself is not cached.
  if (ragBlock) systemInput.push({ text: ragBlock });

  // Entity focus dossier — when the user is looking at a specific record (member,
  // vendor, project, ticket/violation, meeting, channel), inject a compact
  // dossier so the assistant answers about THIS thing. Org-scoped inside the
  // builder; trailing + uncached (it changes per entity). Best-effort. Skipped
  // when the user toggled "entity" off.
  if (context?.entityType && context?.entityId && allow("entity")) {
    try {
      const dossier = await getEntityContext({
        orgId,
        entityType: String(context.entityType),
        entityId: String(context.entityId),
      });
      if (dossier) systemInput.push({ text: dossier });
    } catch {
      /* dossier unavailable — continue without it */
    }
  }

  const messages = [...history, { role: "user" as const, content: userText }];

  // Persist the user turn up front so it survives a mid-stream failure.
  await directus.request(
    createItem("ai_messages", {
      organization: orgId,
      conversation: conversationId,
      role: "user",
      content: message,
    } as any)
  );

  const sse = createEventStream(event);
  await sse.push(JSON.stringify({ type: "meta", conversationId }));

  // Stream in the background; return the SSE response immediately.
  (async () => {
    let full = "";
    try {
      // Haiku (fast) rejects effort + adaptive thinking; pass them only on the
      // heavier tiers and the provider adds them to the request.
      const stream = llm.stream({
        model,
        maxTokens: 1500,
        system: systemInput,
        messages,
        thinking: !isFast,
        effort: isFast ? undefined : "medium",
      });

      for await (const ev of stream) {
        if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") {
          full += ev.delta.text;
          await sse.push(JSON.stringify({ type: "delta", text: ev.delta.text }));
        }
      }

      const final = await stream.finalMessage();

      // Persist the assistant turn with metered token channels.
      await directus.request(
        createItem("ai_messages", {
          organization: orgId,
          conversation: conversationId,
          role: "assistant",
          content: full,
          model,
          input_tokens: final.usage.input_tokens ?? 0,
          output_tokens: final.usage.output_tokens ?? 0,
          cache_read_tokens: (final.usage as any).cache_read_input_tokens ?? 0,
          cache_write_tokens: (final.usage as any).cache_creation_input_tokens ?? 0,
        } as any)
      );
      await directus.request(
        updateItem("ai_conversations", conversationId!, { model } as any)
      );

      const charge = await chargeForCompletion({
        orgId,
        userId,
        usage: final.usage,
        model,
        feature: "chat",
      });
      await sse.push(
        JSON.stringify({ type: "done", credits: charge.credits, balanceCredits: charge.balanceCredits })
      );
    } catch (err: any) {
      console.error("AI chat failed:", err?.message || err);
      await sse.push(JSON.stringify({ type: "error", message: err?.message || "Chat failed" }));
    } finally {
      await sse.close();
    }
  })();

  return sse.send();
});
