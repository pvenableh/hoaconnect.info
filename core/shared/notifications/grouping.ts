// Pure notification-center logic: sorting, unread counts, date grouping and
// deep-link target resolution. Framework-free so the notification surfaces
// (Notification/Bell.vue, Notification/Sheet.vue) share ONE source of truth and
// the tricky bits (date bucketing, unread maths, per-type routing) are
// unit-testable without a DOM or a live Directus.
//
// Operates on a structural subset of `UnifiedNotification` (see
// app/composables/useNotifications.ts) so this module never depends on app code.
import { BUILDING_FEED_PATH, emailWebViewPath } from "../app/destinations";

export interface NotificationLike {
  id: string;
  type: string;
  date: string;
  isRead: boolean;
  priority?: string | null;
  metadata?: Record<string, unknown> | null;
}

/** Newest-first, stable. Invalid/missing dates sort to the end. */
export function sortByDateDesc<T extends NotificationLike>(list: T[]): T[] {
  const ts = (d: string) => {
    const t = new Date(d).getTime();
    return Number.isNaN(t) ? -Infinity : t;
  };
  return [...list].sort((a, b) => ts(b.date) - ts(a.date));
}

/** Total unread. */
export function unreadCount(list: NotificationLike[]): number {
  return list.reduce((n, x) => (x.isRead ? n : n + 1), 0);
}

/** Unread for a single type. */
export function unreadCountByType(list: NotificationLike[], type: string): number {
  return list.reduce((n, x) => (x.type === type && !x.isRead ? n + 1 : n), 0);
}

export type DateBucketKey = "today" | "yesterday" | "week" | "earlier";

const BUCKET_ORDER: DateBucketKey[] = ["today", "yesterday", "week", "earlier"];
const BUCKET_LABELS: Record<DateBucketKey, string> = {
  today: "Today",
  yesterday: "Yesterday",
  week: "Earlier this week",
  earlier: "Older",
};

/** Local midnight for a Date, returned as ms. */
function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/**
 * Which relative-day bucket a notification falls into, relative to `now`.
 * "week" = within the last 7 days (but not today/yesterday); everything older
 * is "earlier". Undated notifications fall into "earlier".
 */
export function dateBucket(dateStr: string, now: Date = new Date()): DateBucketKey {
  const t = new Date(dateStr).getTime();
  if (Number.isNaN(t)) return "earlier";
  const today = startOfDay(now);
  const dayMs = 86400000;
  if (t >= today) return "today";
  if (t >= today - dayMs) return "yesterday";
  if (t >= today - 7 * dayMs) return "week";
  return "earlier";
}

export interface NotificationGroup<T extends NotificationLike> {
  key: DateBucketKey;
  label: string;
  items: T[];
}

/**
 * Group a notification list into ordered relative-day sections
 * (Today / Yesterday / Earlier this week / Older). Items are sorted newest-first
 * within each section; empty sections are omitted.
 */
export function groupByDate<T extends NotificationLike>(
  list: T[],
  now: Date = new Date()
): NotificationGroup<T>[] {
  const sorted = sortByDateDesc(list);
  const buckets = new Map<DateBucketKey, T[]>();
  for (const n of sorted) {
    const key = dateBucket(n.date, now);
    const arr = buckets.get(key);
    if (arr) arr.push(n);
    else buckets.set(key, [n]);
  }
  return BUCKET_ORDER.filter((k) => buckets.has(k)).map((k) => ({
    key: k,
    label: BUCKET_LABELS[k],
    items: buckets.get(k)!,
  }));
}

/**
 * Resolve the org-relative deep-link path for a notification's target. Returns
 * a path you can pass to `buildOrgPath` (or `null` when there's no good target).
 * Mirrors the per-type navigation in Notification/Sheet.vue so click-through and
 * the detail-sheet CTAs always agree.
 */
export function notificationTargetPath(n: NotificationLike): string | null {
  const m = (n.metadata || {}) as Record<string, any>;
  switch (n.type) {
    case "mention": {
      if (!m.channelId) return "/admin/channels";
      return `/admin/channels/${m.channelId}${m.messageId ? `#message-${m.messageId}` : ""}`;
    }
    case "request":
      return m.requestId ? `/requests/${m.requestId}` : "/requests";
    case "task":
      return m.projectId ? `/projects/${m.projectId}` : "/projects";
    case "document":
      return m.documentId ? `/documents/${m.documentId}` : "/documents";
    case "payment":
      return "/payments";
    case "meeting":
      return "/meetings";
    case "membership":
      return "/admin/members";
    // Announcements no longer have a page of their own — they render as cards
    // in the Building feed, which is where "show me this announcement" goes.
    case "announcement":
      return BUILDING_FEED_PATH;
    // An email is NOT in that feed, so it deep-links to its own web view.
    // No id means no honest destination: null drops the CTA rather than
    // dumping the reader somewhere the message isn't. See shared/app/destinations.
    case "email":
      return emailWebViewPath(m.emailId as string | undefined);
    case "comment": {
      const routes: Record<string, string> = {
        hoa_requests: m.commentTargetId ? `/requests/${m.commentTargetId}` : "/requests",
        hoa_documents: m.commentTargetId ? `/documents/${m.commentTargetId}` : "/documents",
        hoa_meetings: "/meetings",
        hoa_announcements: BUILDING_FEED_PATH,
        payment_requests: "/payments",
      };
      return routes[m.commentTargetCollection as string] || null;
    }
    default:
      return null;
  }
}
