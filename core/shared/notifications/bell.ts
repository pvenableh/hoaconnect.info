/**
 * Turning a `directus_notifications` row into something the notification centre
 * can render — the translation layer of the Phase 2c bell cutover.
 *
 * Before this, the bell was a client-side aggregator: ten collection scans on
 * every open, unread state kept in localStorage, and a server fan-out
 * (`notifyUsers`) writing rows that nothing read. The rows are now the source of
 * truth, which fixes what localStorage never could — read state that survives a
 * new device — but it means the surfaces have to keep working against a much
 * thinner row: id, timestamp, status, subject, message, collection, item.
 *
 * So the interesting problem here is the reverse of the aggregator's. It had
 * every field and had to summarise; this has a subject line and a collection
 * name and has to reconstruct enough type, priority and routing metadata for
 * `Notification/{Bell,Sheet,Toast}.vue` to render unchanged.
 *
 * Pure and framework-free on purpose: the mapping is the part most likely to
 * drift as new call sites appear, and it should be provable without a browser.
 *
 * Read state is `status: "archived"`, not a boolean field. Directus already
 * models inbox/archived on the row, so a second notion of "read" would be one
 * to keep in sync for nothing.
 */

import type { NotificationCategory } from "./preferences";

/** The row as the bell reads it. A structural subset of the Directus system collection. */
export interface BellRow {
  id: string;
  timestamp?: string | null;
  status?: "inbox" | "archived" | string | null;
  subject?: string | null;
  message?: string | null;
  collection?: string | null;
  item?: string | null;
  sender?: { id?: string; first_name?: string | null; last_name?: string | null } | string | null;
}

/**
 * The shape the notification surfaces already speak — kept structurally
 * identical to the aggregator's `UnifiedNotification` so the cutover is a change
 * of SOURCE, not a rewrite of three components. (The aggregator's own type stays
 * the canonical declaration; this module builds values that satisfy it.)
 */
export interface BellNotification {
  id: string;
  type: string;
  title: string;
  subtitle?: string;
  content?: string;
  date: string;
  isRead: boolean;
  priority?: "low" | "normal" | "high" | "urgent";
  metadata: Record<string, unknown>;
  originalData: BellRow;
}

/**
 * Which collection a notification came from → which type the UI groups it under.
 *
 * This is the whole reason `notifyUsers` takes a `collection`: it is the only
 * durable, non-guessable signal on the row. Everything else here is a fallback
 * for rows written before a collection was passed, or by a path that has none.
 */
const COLLECTION_TYPES: Record<string, string> = {
  hoa_announcements: "announcement",
  hoa_channel_mentions: "mention",
  hoa_channel_messages: "mention",
  hoa_meetings: "meeting",
  payment_requests: "payment",
  hoa_documents: "document",
  hoa_members: "membership",
  hoa_join_requests: "membership",
  hoa_member_change_requests: "request",
  hoa_comments: "comment",
  hoa_requests: "request",
  hoa_tasks: "task",
  hoa_project_events: "task",
  hoa_emails: "email",
  hoa_email_recipients: "email",
};

/**
 * The preference category each type is governed by. The two vocabularies are
 * nearly the same — deliberately, since a member reading "Meetings" in the bell
 * and toggling "Meetings" in their settings should be talking about one thing —
 * but they are not identical (`email` has no preference category of its own),
 * so the mapping is explicit rather than a cast.
 */
const TYPE_CATEGORIES: Record<string, NotificationCategory> = {
  announcement: "announcement",
  meeting: "meeting",
  payment: "payment",
  document: "document",
  membership: "membership",
  comment: "comment",
  request: "request",
  task: "task",
  mention: "mention",
};

export function categoryForType(type: string): NotificationCategory | null {
  return TYPE_CATEGORIES[type] ?? null;
}

/**
 * A row's type. Collection first; subject heuristics only when there isn't one.
 *
 * The heuristics are a safety net for rows already in the database from paths
 * that predate `notifyUsers` — not a design. A row with no collection also has
 * no deep link, so the worst case of a wrong guess is a chip in the wrong
 * filter tab.
 */
export function typeForRow(row: BellRow): string {
  const byCollection = row.collection ? COLLECTION_TYPES[row.collection] : undefined;
  if (byCollection) return byCollection;

  const subject = String(row.subject || "").toLowerCase();
  if (subject.includes("mention")) return "mention";
  if (subject.includes("comment")) return "comment";
  if (subject.includes("meeting")) return "meeting";
  if (subject.includes("payment") || subject.includes("invoice") || subject.includes("dues")) return "payment";
  if (subject.includes("document")) return "document";
  if (subject.includes("task") || subject.includes("milestone")) return "task";
  if (subject.includes("request") || subject.includes("inquiry")) return "request";
  if (subject.includes("join") || subject.includes("welcome") || subject.includes("member")) return "membership";
  return "announcement";
}

/**
 * Priority, inferred from the words a sender chose.
 *
 * `directus_notifications` has no priority column and adding one would mean a
 * migration plus a field on every call site for something only the toast's
 * duration and one red label use. Overdue and urgent are the two cases that
 * actually change what a member should do, so those are the two we look for.
 */
export function priorityForRow(row: BellRow): "normal" | "high" | "urgent" {
  const text = `${row.subject || ""} ${row.message || ""}`.toLowerCase();
  if (/\burgent\b|\bemergency\b|\boverdue\b|\bpast due\b/.test(text)) return "urgent";
  if (/\baction (?:is )?(?:required|needed)\b|\bneeds? (?:your )?approval\b|\breminder\b/.test(text)) return "high";
  return "normal";
}

/** Sender's display name, when the row carries an expanded sender. */
function senderName(sender: BellRow["sender"]): string | null {
  if (!sender || typeof sender !== "object") return null;
  const name = [sender.first_name, sender.last_name].filter(Boolean).join(" ").trim();
  return name || null;
}

/** Plain text from a message that may carry markup. */
export function plainText(html: string | null | undefined): string {
  return String(html ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The metadata the routing helper (`notificationTargetPath`) reads.
 *
 * The aggregator built this from full rows it had already fetched. Here the row
 * carries one `item` id and one collection, so each type gets exactly the key
 * its route needs and nothing else. A type whose route needs a field the row
 * doesn't have (a comment's target, a mention's channel) resolves to its list
 * page rather than a broken deep link — which is the honest outcome, and why
 * `notificationTargetPath`'s fallbacks matter more after this cutover than before.
 */
function metadataForRow(row: BellRow, type: string): Record<string, unknown> {
  const item = row.item ? String(row.item) : undefined;
  switch (type) {
    case "request":
      return { requestId: item };
    case "task":
      return { taskId: item, projectId: undefined };
    case "document":
      return { documentId: item };
    case "payment":
      return { paymentId: item };
    case "meeting":
      return { meetingId: item };
    case "membership":
      return { memberId: item };
    case "mention":
      return { mentionId: item };
    case "comment":
      // A comment row points at the COMMENT, not at what was commented on, so
      // there is no target to route to. The Sheet falls back to no CTA rather
      // than sending someone to the wrong page.
      return { commentId: item };
    case "email":
      return { emailId: item };
    case "announcement":
      return { announcementId: item };
    default:
      return {};
  }
}

/** One row → one renderable notification. */
export function toBellNotification(row: BellRow): BellNotification {
  const type = typeForRow(row);
  const who = senderName(row.sender);
  const body = plainText(row.message);
  return {
    id: String(row.id),
    type,
    title: row.subject || "Notification",
    subtitle: body || (who ? `From ${who}` : undefined),
    content: row.message || undefined,
    date: row.timestamp || new Date().toISOString(),
    isRead: row.status === "archived",
    priority: priorityForRow(row),
    metadata: metadataForRow(row, type),
    originalData: row,
  };
}

/** Newest first, with a stable tiebreak so equal timestamps don't shuffle. */
export function sortRows(rows: BellRow[]): BellRow[] {
  const ts = (r: BellRow) => {
    const t = new Date(r.timestamp || 0).getTime();
    return Number.isNaN(t) ? 0 : t;
  };
  return [...rows].sort((a, b) => ts(b) - ts(a) || String(a.id).localeCompare(String(b.id)));
}

/**
 * Merge a realtime row into a list, in place of any row with the same id.
 *
 * Directus sends the same row again on update, and the bell also receives rows
 * it just wrote optimistically, so "append" is wrong often enough to be the
 * default bug. Returns a new array — the caller assigns it to a ref.
 */
export function mergeRow(rows: BellRow[], incoming: BellRow): BellRow[] {
  const id = String(incoming.id);
  const idx = rows.findIndex((r) => String(r.id) === id);
  if (idx === -1) return sortRows([incoming, ...rows]);
  const next = [...rows];
  next[idx] = { ...next[idx], ...incoming };
  return sortRows(next);
}

/** Unread counts per type, for the dock badges and the Bell's filter chips. */
export function unreadByType(rows: BellRow[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of rows) {
    if (row.status === "archived") continue;
    const type = typeForRow(row);
    out[type] = (out[type] || 0) + 1;
  }
  return out;
}
