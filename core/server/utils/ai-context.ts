// Structured org-context for the AI assistant. Gathers a compact, bounded
// snapshot of an org's profile + recent content into a plain-text block that is
// placed FIRST in the chat system prompt (with cache_control) so it caches
// across a conversation's turns. This is what makes the assistant org-aware
// ("what's the latest announcement", "when's the next meeting") without the
// model guessing or the client scraping the DOM.
//
// Best-effort: each section is fetched independently and a failure degrades to
// an omitted section, never a thrown request. getTypedDirectus is auto-imported
// from server/utils/directus.ts; SDK query helpers come from @directus/sdk.

import { readItem, readItems } from "@directus/sdk";

/** How many rows of each content type to surface (keeps the cached prefix small). */
const LIMIT = 6;

/** Trim + collapse whitespace and cap a free-text field for the prompt. */
function clip(s: unknown, max = 160): string {
  const t = String(s ?? "")
    .replace(/<[^>]+>/g, " ") // strip any HTML
    .replace(/\s+/g, " ")
    .trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

/** Format an ISO date as a short calendar date (no time) for the prompt. */
function shortDate(iso: unknown): string {
  const s = String(iso ?? "");
  return s ? s.slice(0, 10) : "";
}

/**
 * Build the cacheable org-context block for the chat system prompt. Returns a
 * compact plain-text summary of the org and its recent content, or a minimal
 * stub if everything failed (the assistant still works, just less org-aware).
 */
export async function gatherOrgContext(orgId: string): Promise<string> {
  const directus = getTypedDirectus();
  const lines: string[] = [];

  // ── Org profile ────────────────────────────────────────────────────────
  try {
    const org = (await directus.request(
      readItem("hoa_organizations", orgId, {
        fields: [
          "name",
          "legal_name",
          "type",
          "city",
          "state",
          { settings: ["title", "description"] },
        ],
      })
    )) as {
      name?: string | null;
      legal_name?: string | null;
      type?: string | null;
      city?: string | null;
      state?: string | null;
      settings?: { title?: string | null; description?: string | null } | null;
    };
    const where = [org.city, org.state].filter(Boolean).join(", ");
    lines.push(
      `Association: ${org.name ?? "(unnamed)"}${org.legal_name && org.legal_name !== org.name ? ` (legal: ${org.legal_name})` : ""}`
    );
    if (org.type) lines.push(`Type: ${org.type}`);
    if (where) lines.push(`Location: ${where}`);
    const blurb = org.settings?.description || org.settings?.title;
    if (blurb) lines.push(`About: ${clip(blurb, 240)}`);
  } catch {
    /* org profile unavailable — non-fatal */
  }

  // ── Recent communications (announcements/emails) ─────────────────────────
  try {
    const emails = (await directus.request(
      readItems("hoa_emails", {
        filter: { organization: { _eq: orgId }, status: { _eq: "sent" } },
        fields: ["subject", "sent_at", "email_type"],
        sort: ["-sent_at"],
        limit: LIMIT,
      })
    )) as { subject?: string; sent_at?: string; email_type?: string }[];
    if (emails?.length) {
      lines.push("", "Recent communications:");
      for (const e of emails) {
        lines.push(`- ${clip(e.subject, 100)}${e.sent_at ? ` (${shortDate(e.sent_at)})` : ""}`);
      }
    }
  } catch {
    /* communications unavailable — non-fatal */
  }

  // ── Documents ────────────────────────────────────────────────────────────
  try {
    const docs = (await directus.request(
      readItems("hoa_documents", {
        filter: { organization: { _eq: orgId }, status: { _eq: "published" } },
        fields: ["title", "date_published"],
        sort: ["-date_published"],
        limit: LIMIT,
      })
    )) as { title?: string | null; date_published?: string | null }[];
    const titled = docs?.filter((d) => d.title);
    if (titled?.length) {
      lines.push("", "Documents on file:");
      for (const d of titled) lines.push(`- ${clip(d.title, 100)}`);
    }
  } catch {
    /* documents unavailable — non-fatal */
  }

  // ── Governing rules / bylaws ─────────────────────────────────────────────
  try {
    const rules = (await directus.request(
      readItems("hoa_governance", {
        filter: { organization: { _eq: orgId }, status: { _eq: "published" } },
        fields: ["title", "section_number", "category", "summary"],
        sort: ["section_number", "sort", "title"],
        limit: LIMIT,
      })
    )) as {
      title?: string;
      section_number?: string | null;
      category?: string | null;
      summary?: string | null;
    }[];
    if (rules?.length) {
      lines.push("", "Governing rules (titles only — full text via document search):");
      for (const r of rules) {
        const sec = r.section_number ? `${r.section_number} ` : "";
        const sum = r.summary ? ` — ${clip(r.summary, 100)}` : "";
        lines.push(`- ${sec}${clip(r.title, 80)}${sum}`);
      }
    }
  } catch {
    /* rules unavailable — non-fatal */
  }

  // ── Meetings ─────────────────────────────────────────────────────────────
  try {
    const meetings = (await directus.request(
      readItems("hoa_meetings", {
        filter: { organization: { _eq: orgId }, is_published: { _eq: true } },
        fields: ["title", "type", "status", "meeting_date"],
        sort: ["-meeting_date"],
        limit: LIMIT,
      })
    )) as { title?: string; type?: string | null; status?: string | null; meeting_date?: string | null }[];
    if (meetings?.length) {
      lines.push("", "Recent & upcoming meetings:");
      for (const m of meetings) {
        const when = m.meeting_date ? ` (${shortDate(m.meeting_date)})` : "";
        const st = m.status ? ` [${m.status}]` : "";
        lines.push(`- ${clip(m.title, 80)}${when}${st}`);
      }
    }
  } catch {
    /* meetings unavailable — non-fatal */
  }

  if (!lines.length) {
    return "No additional association context is available right now.";
  }
  return [
    "The following is current context about this community association. Use it to answer",
    "questions accurately. If something isn't here, say so rather than inventing it.",
    "",
    ...lines,
  ].join("\n");
}
