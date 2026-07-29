// POST /api/email/ai-generate — the block-builder's AI wizard. A campaign brief
// in → a structured email out: subject, preview text, and an ordered list of
// sections mapped to REAL library blocks with filled-in variables. The client
// drops the sections onto the canvas. Auth-gated, org-scoped, and metered like
// the other AI routes. (Phase 6 — docs/plan-earnest-parity-upgrade.md.)

import { readItems } from "@directus/sdk";
import { MODEL_TIERS } from "#core/shared/ai/credits";
import { getLlmProvider } from "#core/server/utils/llm/provider";
import { parseVariablesSchema, type AiGeneratedEmail } from "#core/shared/email/blocks";
import type { HoaNewsletterBlock } from "#core/types/directus";

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

  // Load the org's block library so the model can only choose real blocks.
  const blocks = (await directus.request(
    readItems("hoa_newsletter_blocks", {
      filter: { _or: [{ is_system: { _eq: true } }, { organization: { _eq: orgId } }] },
      fields: ["name", "category", "description", "variables_schema", "mjml_source"],
      sort: ["category", "sort", "name"],
      limit: 200,
    })
  )) as HoaNewsletterBlock[];

  if (!blocks.length) {
    throw createError({ statusCode: 400, message: "No email blocks are available to build from." });
  }

  // A catalog string annotating each block's variables with their type, so the
  // model fills colors/urls/images correctly.
  const catalog = blocks
    .map((b) => {
      const schema = parseVariablesSchema(b.variables_schema, b.mjml_source);
      const vars = schema.map((s) => `${s.key} [${s.type.toUpperCase()}]`).join(", ") || "(none)";
      return `- ${b.name} · category "${b.category}"${b.description ? ` — ${b.description}` : ""}\n  variables: ${vars}`;
    })
    .join("\n");

  let orgName: string | null = null;
  try {
    const rows = (await directus.request(
      readItems("hoa_organizations", { filter: { id: { _eq: orgId } }, fields: ["name"], limit: 1 })
    )) as { name?: string }[];
    orgName = rows?.[0]?.name ?? null;
  } catch {
    /* non-fatal */
  }

  const system = [
    `You design HTML email campaigns for ${orgName || "a community association"} by choosing from a fixed library of email blocks.`,
    "",
    "You will receive a brief. Return a complete, well-structured newsletter as STRICT JSON — no prose, no markdown, no code fences.",
    "",
    "Available blocks (choose only from these):",
    catalog,
    "",
    "Rules:",
    "- Return 3–7 sections. Prefer opening with a hero and closing with a footer or CTA.",
    "- Each section must use a real block: set blockName to a block's exact name and blockCategory to its category.",
    "- Fill `variables` using that block's variable keys. For [COLOR] use a valid hex (#rrggbb); [URL] use a real or placeholder https URL; [IMAGE] leave \"\" unless a URL is given; [BOOLEAN] use \"true\"/\"false\".",
    "- Write warm, clear, professional copy appropriate for residents of a homeowners/community association.",
    "",
    'JSON shape: {"subject": string, "previewText": string, "sections": [{"blockCategory": string, "blockName": string, "variables": {"<key>": "<value>"}}]}',
  ].join("\n");

  const model = MODEL_TIERS.standard;
  let completion;
  try {
    completion = await llm.completeWithTools({
      model,
      maxTokens: 3000,
      system: [{ text: system }],
      messages: [{ role: "user", content: `Brief:\n${brief}\n\nReturn the JSON now.` }],
    });
  } catch (err: any) {
    console.error("AI email-generate failed:", err?.message || err);
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

  const parsed = extractJson(completion.text) as AiGeneratedEmail | null;
  if (!parsed || !Array.isArray(parsed.sections)) {
    throw createError({ statusCode: 502, message: "AI returned an unreadable response — try again." });
  }

  // Keep only sections that resolve to a real block (by name, then category).
  const byName = new Map(blocks.map((b) => [String(b.name).toLowerCase(), b]));
  const byCategory = new Map<string, HoaNewsletterBlock>();
  for (const b of blocks) if (b.category && !byCategory.has(b.category)) byCategory.set(b.category, b);

  const sections = parsed.sections
    .map((s) => {
      const match =
        (s.blockName && byName.get(String(s.blockName).toLowerCase())) ||
        (s.blockCategory && byCategory.get(String(s.blockCategory))) ||
        null;
      if (!match) return null;
      return {
        blockName: match.name,
        blockCategory: match.category,
        variables: s.variables && typeof s.variables === "object" ? s.variables : {},
      };
    })
    .filter(Boolean);

  return {
    subject: String(parsed.subject || "").slice(0, 200),
    previewText: String(parsed.previewText || "").slice(0, 200),
    sections,
    credits: charge.credits,
    balanceCredits: charge.balanceCredits,
  };
});
