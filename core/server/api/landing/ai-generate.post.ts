// POST /api/landing/ai-generate — the landing builder's AI wizard. A short brief
// about the community in → a structured, ordered landing out: hero copy, an About
// narrative, editorial content sections, an FAQ, and a Location blurb, all mapped
// to the real LandingConfig block shapes the builder canvas understands.
//
// Grounded in the org's REAL data (the same brand/location/amenities/board sources
// the public landing renders, via getBrandContext) so it writes true copy about
// THIS building rather than inventing facts. Auth-gated, org-scoped, and metered
// like every other AI route (mirrors /api/email/ai-generate).

import { readItems } from "@directus/sdk";
import { MODEL_TIERS } from "#core/shared/ai/credits";
import { getLlmProvider } from "#core/server/utils/llm/provider";
import {
  sanitizeAiLandingResult,
  AI_LANDING_JSON_SHAPE,
  type AiLandingResult,
} from "#core/shared/landing/ai";

/** Pull the first {...} JSON object out of a model reply (tolerates prose/fences). */
function extractJson(text: string): any | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const userId = (session.user as any)?.id ?? null;

  const body = await readBody(event);
  const orgId = String(body?.orgId || "").trim();
  const brief = String(body?.brief || "").trim();
  if (!orgId) throw createError({ statusCode: 400, message: "orgId is required" });
  if (!brief) throw createError({ statusCode: 400, message: "brief is required" });

  await requireOrgComposeAccess(event, orgId);

  const summary = await getWalletSummary(orgId);
  if (summary.balanceCredits <= 0) {
    setResponseStatus(event, 402);
    return { error: "insufficient_credits", balanceCredits: 0 };
  }

  const llm = getLlmProvider();
  const directus = getTypedDirectus();

  // Org profile + the same brand/location/amenities/board grounding the landing
  // itself renders. Best-effort — a failure just yields thinner grounding.
  let orgName = "the community";
  let orgType = "";
  let where = "";
  try {
    const rows = (await directus.request(
      readItems("hoa_organizations", {
        filter: { id: { _eq: orgId } },
        fields: ["name", "type", "city", "state"],
        limit: 1,
      })
    )) as any[];
    const o = rows?.[0];
    if (o) {
      orgName = o.name || orgName;
      orgType = o.type || "";
      where = [o.city, o.state].filter(Boolean).join(", ");
    }
  } catch {
    /* non-fatal */
  }

  let grounding = "";
  try {
    grounding = (await getBrandContext(orgId)) || "";
  } catch {
    grounding = "";
  }

  const system = [
    `You design the public landing page for ${orgName}${where ? ` in ${where}` : ""}, a ${orgType || "community"} association.`,
    "You return a complete, ordered landing page as STRICT JSON — no prose, no markdown, no code fences.",
    "",
    "GROUND EVERYTHING IN THE FACTS BELOW. Never invent amenities, board members, walk scores, distances,",
    "or claims that aren't given or clearly implied by the brief. When a fact is unknown, omit it rather than guess.",
    "",
    grounding ? `Known facts about this community:\n${grounding}` : "No stored facts are available — rely only on the brief, and keep claims general.",
    "",
    "Compose the page:",
    "- hero: a short title (the community name or a tagline) and a one-line subtitle.",
    "- about: a warm 2–4 sentence narrative introducing the community.",
    "- sections: 4–7 ordered sections. Lead with a `content` intro section, then use `content` sections for",
    "  editorial themes (design, lifestyle, security, investment). Include a built-in `amenities`, `location`,",
    "  `board`, `faq`, and/or `contact` section ONLY when the facts support it (they pull real data — you just position them).",
    "- For `content` sections: pick a `layout`, write eyebrow/title/body, and add `features` (icon-able points) or",
    "  `stats` where it helps. Use lucide icon names like \"lucide:waves\".",
    "- faq: 3–6 genuinely useful question/answer pairs for a prospective resident.",
    "- location: fill scores/highlights ONLY from the known facts; otherwise omit it.",
    "",
    "Write warm, confident, concrete copy — the voice of a boutique residential community, never salesy filler.",
    "",
    `JSON shape: ${AI_LANDING_JSON_SHAPE}`,
  ].join("\n");

  const model = MODEL_TIERS.standard;
  let completion;
  try {
    completion = await llm.completeWithTools({
      model,
      maxTokens: 4000,
      system: [{ text: system }],
      messages: [{ role: "user", content: `Brief:\n${brief}\n\nReturn the JSON now.` }],
    });
  } catch (err: any) {
    console.error("AI landing-generate failed:", err?.message || err);
    throw createError({ statusCode: 502, message: "AI generation failed" });
  }

  // Meter the real usage against the wallet.
  const charge = await chargeForCompletion({
    orgId,
    userId,
    usage: completion.usage,
    model,
    feature: "draft",
  });

  const parsed = extractJson(completion.text);
  const result: AiLandingResult = sanitizeAiLandingResult(parsed);
  if (!result.sections.length) {
    throw createError({ statusCode: 502, message: "AI returned an unreadable response — try again." });
  }

  return {
    result,
    credits: charge.credits,
    balanceCredits: charge.balanceCredits,
  };
});
