/**
 * Daily/weekly digest — build a per-member cross-category roll-up of what's new
 * in their community and send it through the branded transactional-email path.
 *
 * Every section query is defensively wrapped so a failing (or not-yet-existing)
 * collection yields an empty section instead of throwing — a partial digest is
 * always better than none. The digest is gated upstream by the member's prefs
 * (digest_enabled + cadence/hour in the cron; the master email switch in the
 * send path), so this module just assembles and renders.
 */

import { readItems } from "@directus/sdk";
import { sendBrandedTransactionalEmail } from "./transactional-email";
import type { DigestSection } from "#core/shared/notifications/preferences";

interface DigestItem {
  label: string;
  sub?: string;
}
interface DigestSectionOut {
  key: DigestSection;
  title: string;
  items: DigestItem[];
}

export interface DigestContext {
  userId: string;
  organizationId: string;
  /** hoa_members ids for this user in this org (payment requests are per-member). */
  memberIds: string[];
  sections: DigestSection[];
  /** ISO cutoff for "new since" content. */
  sinceIso: string;
}

const fmtDate = (d?: string | null) =>
  d
    ? new Date(d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
    : "";

async function safe<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}

/**
 * Untyped item read — the digest touches several collections with heterogeneous
 * date/status filters, so we bypass the SDK's strict per-collection filter
 * typing here and treat results as any[]. Every call is wrapped in safe().
 */
function rawItems(collection: string, query: Record<string, any>): Promise<any[]> {
  return getTypedDirectus().request(
    readItems(collection as any, query as any)
  ) as Promise<any[]>;
}

/** Assemble the roll-up sections for one member. */
export async function buildDigest(ctx: DigestContext): Promise<DigestSectionOut[]> {
  const out: DigestSectionOut[] = [];
  const nowIso = new Date().toISOString();
  const has = (s: DigestSection) => ctx.sections.includes(s);

  if (has("announcements")) {
    const rows = await safe(() =>
      rawItems("hoa_announcements", {
        filter: {
          organization: { _eq: ctx.organizationId },
          status: { _eq: "published" },
          date_created: { _gte: ctx.sinceIso },
        },
        fields: ["id", "title", "date_created"],
        sort: ["-date_created"],
        limit: 8,
      })
    );
    const items = rows?.filter(Boolean).map((r) => ({ label: r.title || "Announcement" }));
    if (items?.length) out.push({ key: "announcements", title: "New announcements", items });
  }

  if (has("meetings")) {
    const rows = await safe(() =>
      rawItems("hoa_meetings", {
        filter: {
          organization: { _eq: ctx.organizationId },
          is_published: { _eq: true },
          meeting_date: { _gte: nowIso },
        },
        fields: ["id", "title", "meeting_date"],
        sort: ["meeting_date"],
        limit: 5,
      })
    );
    const items = rows
      ?.filter(Boolean)
      .map((r) => ({ label: r.title || "Meeting", sub: fmtDate(r.meeting_date) }));
    if (items?.length) out.push({ key: "meetings", title: "Upcoming meetings", items });
  }

  if (has("payments") && ctx.memberIds.length) {
    const rows = await safe(() =>
      rawItems("payment_requests", {
        filter: {
          member: { _in: ctx.memberIds },
          status: { _in: ["active", "partially_paid", "overdue"] },
        },
        fields: ["id", "title", "amount_remaining", "due_date", "status"],
        sort: ["due_date"],
        limit: 6,
      })
    );
    const items = rows?.filter(Boolean).map((r) => ({
      label: r.title || "Payment due",
      sub: [
        r.amount_remaining != null ? `$${Number(r.amount_remaining).toFixed(2)}` : null,
        r.due_date ? `due ${fmtDate(r.due_date)}` : null,
      ]
        .filter(Boolean)
        .join(" · "),
    }));
    if (items?.length) out.push({ key: "payments", title: "Dues & payments due", items });
  }

  if (has("documents")) {
    const rows = await safe(() =>
      rawItems("hoa_documents", {
        filter: {
          organization: { _eq: ctx.organizationId },
          date_created: { _gte: ctx.sinceIso },
        },
        fields: ["id", "title", "date_created"],
        sort: ["-date_created"],
        limit: 8,
      })
    );
    const items = rows?.filter(Boolean).map((r) => ({ label: r.title || "Document" }));
    if (items?.length) out.push({ key: "documents", title: "New documents", items });
  }

  if (has("requests")) {
    const rows = await safe(() =>
      rawItems("hoa_requests", {
        filter: {
          organization: { _eq: ctx.organizationId },
          status: { _in: ["open", "in_progress", "waiting"] },
        },
        fields: ["id", "title", "status"],
        sort: ["-date_created"],
        limit: 6,
      })
    );
    const items = rows?.filter(Boolean).map((r) => ({ label: r.title || "Request" }));
    if (items?.length) out.push({ key: "requests", title: "Open requests", items });
  }

  return out;
}

/** Render the digest sections into email-safe body HTML. */
export function renderDigestHtml(sections: DigestSectionOut[]): string {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return sections
    .map((sec) => {
      const rows = sec.items
        .map(
          (it) =>
            `<tr><td style="padding:6px 0;font-size:15px;color:#111827">${esc(it.label)}${
              it.sub ? `<span style="color:#6b7280"> — ${esc(it.sub)}</span>` : ""
            }</td></tr>`
        )
        .join("");
      return `<div style="margin:20px 0 8px"><p style="text-transform:uppercase;letter-spacing:.08em;font-size:12px;font-weight:600;color:#6b7280;margin:0 0 6px">${esc(
        sec.title
      )}</p><table style="width:100%;border-collapse:collapse">${rows}</table></div>`;
    })
    .join("");
}

/**
 * Build + send one member's digest. Returns true if an email was dispatched.
 * No-op (returns false) when there's nothing worth sending.
 */
export async function sendDigest(ctx: DigestContext, opts: { cadenceLabel: string }): Promise<boolean> {
  const sections = await buildDigest(ctx);
  if (!sections.length) return false;

  const bodyHtml = renderDigestHtml(sections);
  await sendBrandedTransactionalEmail({
    organizationId: ctx.organizationId,
    recipientUserIds: [ctx.userId],
    subject: `Your ${opts.cadenceLabel} community digest`,
    heading: "Here's what's new in your community",
    bodyHtml,
    emailType: "notice",
    cta: { label: "Open your dashboard", path: "/" },
  });
  return true;
}
