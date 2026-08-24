/**
 * Inquiry notification routing.
 *
 * When a member submits an inquiry (a hoa_requests row), the org admin controls
 * who from the external property-management company gets notified, and the board
 * is notified by default. Routing is per-org config on
 * hoa_organizations.inquiry_routing: { board_default, map: { <type>: <kind> } }.
 *
 *   inquiry type (maintenance|arc|complaint|violation|task)
 *        → contact kind (rental_sales|violations|general)
 *        → all active hoa_management_contacts of that kind
 *        + the board (when board_default)
 *
 * Notifications are fired both in-app (Directus notifications, for any recipient
 * with a linked login user) and by email (transactional, for any recipient with
 * an email + notify_email). This runs with the admin token (elevated) — the
 * caller is authorized in the route.
 */
import { readItem, readItems } from "@directus/sdk";

export type InquiryKind = "rental_sales" | "violations" | "general";

interface InquiryRouting {
  board_default: boolean;
  map: Record<string, InquiryKind | "none">;
}

const DEFAULT_ROUTING: InquiryRouting = {
  board_default: true,
  map: {
    maintenance: "general",
    arc: "rental_sales",
    complaint: "violations",
    violation: "violations",
  },
};

// Human labels for the inquiry types (server has no access to the app-side
// requestWorkflows config; keep a small mirror here).
const TYPE_LABELS: Record<string, string> = {
  maintenance: "Maintenance",
  arc: "Architectural Review",
  violation: "Violation",
  complaint: "Complaint",
  task: "Task",
};

function idOf(rel: any): string | null {
  if (!rel) return null;
  return typeof rel === "string" ? rel : rel.id ?? null;
}

export interface RouteResult {
  ok: boolean;
  reason?: string;
  kind?: InquiryKind | "none";
  inApp: number;
  emails: number;
  recipients: { email: number; user: number };
}

export async function routeInquiryNotifications(requestId: string): Promise<RouteResult> {
  const config = useRuntimeConfig();
  const directus = getTypedDirectus();

  // 1. Authoritative request fields.
  const req: any = await directus.request(
    readItem("hoa_requests", requestId, {
      fields: [
        "id",
        "type",
        "title",
        "priority",
        "organization",
        { submitted_by: ["id", "first_name", "last_name"] },
      ],
    })
  );
  if (!req) return { ok: false, reason: "request not found", inApp: 0, emails: 0, recipients: { email: 0, user: 0 } };

  const orgId = idOf(req.organization);
  if (!orgId) return { ok: false, reason: "request has no organization", inApp: 0, emails: 0, recipients: { email: 0, user: 0 } };

  // 2. Org + routing config.
  const org: any = await directus.request(
    readItem("hoa_organizations", orgId, { fields: ["id", "name", "slug", "inquiry_routing"] })
  );
  const stored = (org?.inquiry_routing || {}) as Partial<InquiryRouting>;
  const routing: InquiryRouting = {
    board_default: stored.board_default ?? DEFAULT_ROUTING.board_default,
    map: { ...DEFAULT_ROUTING.map, ...(stored.map || {}) },
  };

  const kind = routing.map[req.type] as InquiryKind | "none" | undefined;

  // Recipient accumulators (deduped).
  const userRecipients = new Map<string, void>(); // user id → in-app
  const emailRecipients = new Map<string, void>(); // lowercased email → email

  // 3. Routed management vendors (category=management with the matching role).
  if (kind && kind !== "none") {
    const contacts: any[] = await directus.request(
      readItems("hoa_vendors", {
        filter: {
          organization: { _eq: orgId },
          status: { _eq: "active" },
          category: { _eq: "management" },
          management_role: { _eq: kind },
        },
        fields: ["id", "company", "name", "email", "user", "notify_email", "notify_inapp"],
        limit: -1,
      })
    );
    for (const c of contacts) {
      const uid = idOf(c.user);
      if (c.notify_inapp !== false && uid) userRecipients.set(uid);
      if (c.notify_email !== false && c.email) emailRecipients.set(String(c.email).toLowerCase());
    }
  }

  // 4. Board (default on).
  if (routing.board_default !== false) {
    const nowIso = new Date().toISOString();
    const terms: any[] = await directus.request(
      readItems("hoa_board_members", {
        filter: {
          status: { _eq: "published" },
          hoa_member: { organization: { _eq: orgId }, status: { _eq: "active" } },
          _or: [{ term_start: { _null: true } }, { term_start: { _lte: nowIso } as any }],
        },
        fields: ["id", "term_end", { hoa_member: ["user", "email"] }],
        limit: -1,
      })
    );
    for (const t of terms) {
      if (t.term_end && t.term_end < nowIso) continue; // expired term
      const uid = idOf(t.hoa_member?.user);
      const email = t.hoa_member?.email;
      if (uid) userRecipients.set(uid);
      if (email) emailRecipients.set(String(email).toLowerCase());
    }
  }

  // Don't notify the submitter about their own inquiry.
  const submitterId = idOf(req.submitted_by);
  if (submitterId) userRecipients.delete(submitterId);

  // 5. Fire notifications.
  const typeLabel = TYPE_LABELS[req.type] || "Inquiry";
  const submitterName = [req.submitted_by?.first_name, req.submitted_by?.last_name].filter(Boolean).join(" ") || "A member";
  const subject = `New ${typeLabel.toLowerCase()} inquiry: ${req.title}`;
  const message = `${submitterName} submitted a ${typeLabel.toLowerCase()} inquiry — "${req.title}".`;
  const appUrl = (config.public.appUrl || "").replace(/\/$/, "");
  const detailUrl = org?.slug ? `${appUrl}/${org.slug}/admin/requests/${req.id}` : "";

  // Through `notifyUsers`, not a raw createNotification loop: that loop wrote a
  // bell row for everyone regardless of their per-category switch, sent no push
  // at all, and trusted routing-configured user ids without a tenancy check.
  // The email leg below stays separate — it addresses raw addresses (board
  // contacts who may have no user account), which notifyUsers cannot express.
  const { bell: inApp } = await notifyUsers({
    organizationId: orgId,
    recipientUserIds: [...userRecipients.keys()],
    category: "request",
    subject,
    message,
    collection: "hoa_requests",
    item: req.id,
    path: `/admin/requests/${req.id}`,
    excludeUserId: submitterId,
  });

  let emails = 0;
  if (emailRecipients.size) {
    const html =
      `<p>${escapeHtml(submitterName)} submitted a <strong>${escapeHtml(typeLabel.toLowerCase())}</strong> inquiry.</p>` +
      `<p><strong>${escapeHtml(req.title)}</strong></p>` +
      (detailUrl ? `<p><a href="${detailUrl}">View the inquiry →</a></p>` : "") +
      `<p style="color:#888;font-size:12px">Sent by ${escapeHtml(org?.name || "your community")} via HOA Connect.</p>`;
    for (const email of emailRecipients.keys()) {
      try {
        await sendEmail({
          to: email,
          subject: `[${org?.name || "HOA Connect"}] ${subject}`,
          text: `${message}${detailUrl ? `\n\nView: ${detailUrl}` : ""}`,
          html,
        });
        emails++;
      } catch (e) {
        console.warn("[inquiry-routing] email notify failed for", email, e);
      }
    }
  }

  return {
    ok: true,
    kind: kind ?? "none",
    inApp,
    emails,
    recipients: { email: emailRecipients.size, user: userRecipients.size },
  };
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
