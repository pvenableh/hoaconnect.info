// POST /api/ai/draft — stream a "Draft with AI" composition for the
// Communications composer. Auth-gated, org-scoped, and metered: real token
// usage is debited from the org wallet on completion, and the call is refused
// up front when the wallet is empty. Streams Server-Sent Events:
//   { type: "delta", text }            — incremental model output
//   { type: "done", credits, balanceCredits }
//   { type: "error", message }
//
// The model returns `Subject: ...` on the first line then an HTML body; the
// client splits the subject out and streams the rest into the editor.

import { readItems } from "@directus/sdk";
import { MODEL_TIERS, type ModelTier } from "#core/shared/ai/credits";
import { getLlmProvider } from "#core/server/utils/llm/provider";

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const userId = (session.user as any)?.id ?? null;

  const body = await readBody(event);
  const orgId = String(body?.orgId || "").trim();
  const instruction = String(body?.instruction || "").trim();
  if (!orgId) throw createError({ statusCode: 400, message: "orgId is required" });
  if (!instruction) throw createError({ statusCode: 400, message: "instruction is required" });

  // Authorization — must be a comms-capable actor in this org.
  await requireOrgComposeAccess(event, orgId);

  // Refuse at zero balance (friendly, not a hard error the UI can't read).
  const summary = await getWalletSummary(orgId);
  if (summary.balanceCredits <= 0) {
    setResponseStatus(event, 402);
    return { error: "insufficient_credits", balanceCredits: 0 };
  }

  // AI must be configured before we open a stream (getLlmProvider throws 503
  // when the key is missing — same gate as the old getAnthropic() call).
  const llm = getLlmProvider();

  const tier = (["fast", "standard"].includes(body?.tier) ? body.tier : "fast") as ModelTier;
  const model = MODEL_TIERS[tier] ?? MODEL_TIERS.fast;

  // Resolve org name for the system prompt (best-effort).
  let orgName: string | null = null;
  try {
    const rows = (await getTypedDirectus().request(
      readItems("hoa_organizations", { filter: { id: { _eq: orgId } }, fields: ["name"], limit: 1 })
    )) as { name?: string }[];
    orgName = rows?.[0]?.name ?? null;
  } catch {
    /* non-fatal */
  }

  const systemText = draftSystemPrompt(orgName);
  const userText = draftUserPrompt({
    instruction,
    existingSubject: body?.subject ? String(body.subject) : null,
    existingBody: body?.content ? String(body.content) : null,
  });

  const sse = createEventStream(event);

  // Stream in the background; return the SSE response immediately.
  (async () => {
    try {
      const stream = llm.stream({
        model,
        maxTokens: 1500,
        system: [{ text: systemText, cache: true }],
        messages: [{ role: "user", content: userText }],
      });

      for await (const ev of stream) {
        if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") {
          await sse.push(JSON.stringify({ type: "delta", text: ev.delta.text }));
        }
      }

      const final = await stream.finalMessage();
      const charge = await chargeForCompletion({
        orgId,
        userId,
        usage: final.usage,
        model,
        feature: body?.subject || body?.content ? "rewrite" : "draft",
      });
      await sse.push(
        JSON.stringify({ type: "done", credits: charge.credits, balanceCredits: charge.balanceCredits })
      );
    } catch (err: any) {
      console.error("AI draft failed:", err?.message || err);
      await sse.push(JSON.stringify({ type: "error", message: err?.message || "Draft failed" }));
    } finally {
      await sse.close();
    }
  })();

  return sse.send();
});
