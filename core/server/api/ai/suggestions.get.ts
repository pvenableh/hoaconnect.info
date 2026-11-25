// GET /api/ai/suggestions?orgId=… — starter prompts for the assistant's empty
// state, GROUNDED in the org's real content. The chips double as the capability
// hint: leading with an actually-indexed document teaches "this assistant can
// read our documents" far better than a static list (which previously suggested
// a pet policy that may not exist). Auth-gated to the same staff actors as chat.

import { readItems } from "@directus/sdk";
import { groundedChips, suggestionSpecs, type SuggestionKey } from "#core/server/utils/ai-suggestion-reads";

export default defineEventHandler(async (event) => {
  await requireUserSession(event);
  const q = getQuery(event);
  const orgId = String(q.orgId || "").trim();
  const entityType = String(q.entityType || "").trim();
  if (!orgId) throw createError({ statusCode: 400, message: "orgId is required" });

  // The grounding reads and the caller's standing as ONE request
  // (ai-suggestion-reads.ts); the gate then answers from the cached standing
  // and refuses before any of these rows is used. A failed batch reads one by
  // one below, each read non-fatal, as before.
  const specs = suggestionSpecs(orgId, isRagConfigured());
  const batched = (await batchWithAccessSnapshot(event, orgId, specs as Record<SuggestionKey, any>).catch(() => null)) as Record<
    SuggestionKey,
    any[]
  > | null;
  await requireOrgComposeAccess(event, orgId);

  // When a specific record is focused, lead with prompts about it — they land on
  // the injected dossier and teach "the assistant knows this record."
  const ENTITY_PROMPTS: Record<string, string[]> = {
    member: ["Summarize this member's account", "Any open requests for this member?"],
    vendor: ["What projects has this vendor worked on?", "Draft an email to this vendor"],
    project: ["What's the status of this project?", "What tasks are still open here?"],
    request: ["Summarize this request", "Draft a response to the resident"],
    violation: ["Summarize this violation", "Draft a courtesy notice to the resident"],
    ticket: ["Summarize this ticket", "What's the next step here?"],
    meeting: ["Summarize this meeting's agenda", "Draft a minutes summary"],
    channel: ["Summarize the recent discussion here", "What's unresolved in this channel?"],
  };
  const entityChips = entityType ? ENTITY_PROMPTS[entityType] || [] : [];

  // 1) An actually-indexed document — the chip that teaches doc-awareness.
  // 2) A real governing rule, if any are published.
  // 3) The latest announcement, if any have been sent.
  const grounded = groundedChips(
    batched
      ? { chunks: batched.sg_chunks, rules: batched.sg_rules, emails: batched.sg_emails }
      : await readOneByOne(specs)
  );

  // Always-useful fallbacks fill any remaining slots (never duplicate a grounded one).
  const fallbacks = [
    "When is the next board meeting?",
    "Draft a notice about upcoming maintenance",
    "What's the latest announcement?",
  ];
  const suggestions = [...entityChips, ...grounded];
  for (const f of fallbacks) {
    if (suggestions.length >= 4) break;
    if (!suggestions.includes(f)) suggestions.push(f);
  }

  return { suggestions: suggestions.slice(0, 4) };
});

/** The three reads one after another, as the route made them; a read that fails adds nothing. */
async function readOneByOne(specs: ReturnType<typeof suggestionSpecs>) {
  const directus = getTypedDirectus();
  const read = async (spec: (typeof specs)[SuggestionKey]) => {
    if (!spec) return undefined;
    try {
      return (await directus.request(
        readItems(spec.collection as any, {
          filter: spec.filter as any,
          fields: [...spec.fields] as any,
          ...(spec.sort ? { sort: [...spec.sort] as any } : {}),
          limit: spec.limit,
        })
      )) as any[];
    } catch {
      return undefined; // non-fatal
    }
  };
  const chunks = await read(specs.sg_chunks);
  const rules = await read(specs.sg_rules);
  const emails = await read(specs.sg_emails);
  return { chunks, rules, emails };
}
