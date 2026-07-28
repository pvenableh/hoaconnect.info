// GET /api/ai/suggestions?orgId=… — starter prompts for the assistant's empty
// state, GROUNDED in the org's real content. The chips double as the capability
// hint: leading with an actually-indexed document teaches "this assistant can
// read our documents" far better than a static list (which previously suggested
// a pet policy that may not exist). Auth-gated to the same staff actors as chat.

import { readItems } from "@directus/sdk";

const clip = (s: unknown, n = 72): string => {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
};

export default defineEventHandler(async (event) => {
  await requireUserSession(event);
  const q = getQuery(event);
  const orgId = String(q.orgId || "").trim();
  const entityType = String(q.entityType || "").trim();
  if (!orgId) throw createError({ statusCode: 400, message: "orgId is required" });
  await requireOrgComposeAccess(event, orgId);

  const directus = getTypedDirectus();

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

  const grounded: string[] = [];

  // 1) An actually-indexed document — the chip that teaches doc-awareness.
  if (isRagConfigured()) {
    try {
      const chunks = (await directus.request(
        readItems("ai_doc_chunks", {
          filter: { organization: { _eq: orgId } },
          fields: ["source_title"],
          limit: 25,
        })
      )) as { source_title?: string | null }[];
      const titles = [...new Set(chunks.map((c) => c.source_title).filter(Boolean))] as string[];
      if (titles[0]) grounded.push(`Summarize “${clip(titles[0])}”`);
    } catch {
      /* non-fatal */
    }
  }

  // 2) A real governing rule, if any are published.
  try {
    const rules = (await directus.request(
      readItems("hoa_governance", {
        filter: { organization: { _eq: orgId }, status: { _eq: "published" } },
        fields: ["title"],
        limit: 1,
      })
    )) as { title?: string | null }[];
    if (rules[0]?.title) grounded.push(`What do our rules say about ${clip(rules[0].title, 48)}?`);
  } catch {
    /* non-fatal */
  }

  // 3) The latest announcement, if any have been sent.
  try {
    const emails = (await directus.request(
      readItems("hoa_emails", {
        filter: { organization: { _eq: orgId }, status: { _eq: "sent" } },
        fields: ["subject"],
        sort: ["-sent_at"],
        limit: 1,
      })
    )) as { subject?: string | null }[];
    if (emails[0]?.subject) grounded.push(`What was “${clip(emails[0].subject)}” about?`);
  } catch {
    /* non-fatal */
  }

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
