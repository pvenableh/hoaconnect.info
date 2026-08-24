/**
 * What a community event turns into, before anyone has been looked up.
 *
 * Phase 2b of the Earnest parity round asked "which of the ten collections the
 * bell aggregates actually fire a notification when they change?" — and the
 * answer for several was "none". The gap is structural rather than an oversight:
 * announcements, meetings, mentions and comments are written straight from the
 * browser through the Directus proxy, so there is no server moment where a
 * fan-out could hang. `/api/org/notify-event` is that moment, and this module is
 * its brain: given a collection, an action and the row, it returns the copy, the
 * category and a DESCRIPTION of who should hear about it.
 *
 * Pure on purpose (Earnest's `notificationRecipients.ts` is not, and pays for it
 * in untestability). Nothing here reads Directus, so the tricky parts — which
 * events are notifiable at all, what the member reads, which preference switch
 * governs it — are unit-testable without a live database. Turning an audience
 * descriptor into user ids is the server's job; see
 * `core/server/utils/notification-events.ts`.
 *
 * The client sends only `(collection, action, itemId)`. Every string a member
 * eventually reads is derived HERE from the row the server re-read for itself,
 * so a caller cannot choose the copy, the category, or the recipients.
 */

import { BUILDING_FEED_PATH } from "../app/destinations";
import type { NotificationCategory } from "./preferences";

/** Who should hear about this — resolved to user ids on the server. */
export type NotifyAudience =
  /** One named person (the mentioned user, the assignee). */
  | { kind: "user"; id: string }
  /** Everyone in the org whose membership matches an audience tag. */
  | { kind: "org-audience"; audience: string }
  /** The org's admins and property managers. */
  | { kind: "admins" }
  /** People already involved with a target item — commenters, submitter, assignee. */
  | { kind: "participants"; collection: string; id: string };

export interface NotifyEventPlan {
  category: NotificationCategory;
  subject: string;
  message: string;
  /** The bell's deep-link target. */
  collection: string;
  item: string;
  /** Org-relative path for the push tap. */
  path: string | null;
  audience: NotifyAudience;
  /**
   * Fire at most once for this (collection, item). Set for state transitions
   * that a client can re-trigger — a meeting can be unpublished and republished,
   * and the second publish is not news. Per-message events (a mention, a
   * comment) leave it false: each one is genuinely new.
   */
  once: boolean;
  /** The actor, when the row identifies them, so they aren't told about themselves. */
  actorId?: string | null;
}

export interface NotifyEventInput {
  collection: string;
  action: "create" | "update";
  /** The row, as the SERVER re-read it. Never the client's copy. */
  item: Record<string, any>;
  /** Fallback when the row's own id field is absent. */
  itemId: string;
}

/**
 * What a CLIENT is allowed to announce. Deliberately narrower than what the
 * planner understands: `hoa_announcements` has a plan below because the AI
 * action executor creates announcements server-side, but no browser should be
 * able to trigger a whole-community announcement by pointing at a row.
 */
export const NOTIFIABLE_COLLECTIONS = [
  "hoa_channel_mentions",
  "hoa_meetings",
  "hoa_comments",
] as const;

export type NotifiableCollection = (typeof NOTIFIABLE_COLLECTIONS)[number];

export function isNotifiableCollection(value: unknown): value is NotifiableCollection {
  return NOTIFIABLE_COLLECTIONS.includes(value as NotifiableCollection);
}

/** Directus hands a relation back as an object when the field is dotted, a string otherwise. */
function idOf(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (typeof value === "object" && "id" in (value as Record<string, unknown>)) {
    const id = (value as Record<string, unknown>).id;
    return id ? String(id) : null;
  }
  return null;
}

function nameOf(value: unknown, fallback: string): string {
  if (!value || typeof value !== "object") return fallback;
  const r = value as Record<string, unknown>;
  const name = [r.first_name, r.last_name].filter(Boolean).join(" ").trim();
  return name || String(r.email || "") || fallback;
}

/** One line of a member's own words, short enough for a bell row and a push. */
function excerpt(text: unknown, max = 140): string {
  const s = String(text ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1).trimEnd()}…`;
}

const MEETING_TYPE_LABELS: Record<string, string> = {
  board: "Board meeting",
  annual: "Annual meeting",
  special: "Special meeting",
  committee: "Committee meeting",
};

/**
 * Where a comment's target lives. Deliberately the same map the bell's
 * `notificationTargetPath` uses for `comment`, because a notification whose push
 * lands somewhere other than its bell row is worse than one that doesn't link.
 */
const COMMENT_TARGET_PATHS: Record<string, (id: string) => string> = {
  hoa_requests: (id) => `/requests/${id}`,
  hoa_documents: (id) => `/documents/${id}`,
  hoa_meetings: () => "/meetings",
  payment_requests: () => "/payments",
};

/**
 * Turn a row into a plan, or null when this change is not news.
 *
 * Returning null is the common case and is not a failure: most updates to a
 * meeting are edits, most comments are internal notes nobody outside staff
 * should be pinged about, and a client that fires on every keystroke should get
 * silence rather than a fan-out.
 */
export function planNotifyEvent(input: NotifyEventInput): NotifyEventPlan | null {
  const item = input.item || {};
  const itemId = String(item.id ?? input.itemId ?? "");
  if (!itemId) return null;

  switch (input.collection) {
    // ── A mention is the one notification a member unambiguously asked for ──
    case "hoa_channel_mentions": {
      if (input.action !== "create") return null;
      const recipient = idOf(item.mentioned_user);
      if (!recipient) return null;
      const actorId = idOf(item.mentioned_by);
      const who = nameOf(item.mentioned_by, "Someone");
      const channelId = idOf(item.channel);
      const channelName = (item.channel as any)?.name || "a channel";
      const body = excerpt((item.message as any)?.content);
      return {
        category: "mention",
        subject: `${who} mentioned you`,
        message: body ? `In ${channelName}: "${body}"` : `${who} mentioned you in ${channelName}.`,
        collection: "hoa_channel_mentions",
        item: itemId,
        path: channelId ? `/admin/channels/${channelId}` : "/admin/channels",
        audience: { kind: "user", id: recipient },
        once: false,
        actorId,
      };
    }

    // ── A meeting becomes news the moment it becomes visible ────────────────
    case "hoa_meetings": {
      if (!item.is_published) return null;
      const label = MEETING_TYPE_LABELS[String(item.type || "")] || "Meeting";
      const when = formatMeetingDate(item.meeting_date);
      return {
        category: "meeting",
        subject: `${label} scheduled`,
        message: `${item.title || label}${when ? ` — ${when}` : ""}`,
        collection: "hoa_meetings",
        item: itemId,
        path: "/meetings",
        // A meeting can be unpublished and published again; the second time is
        // housekeeping, not news.
        once: true,
        audience: {
          kind: "org-audience",
          audience: String(item.target_audience || "all"),
        },
        actorId: idOf(item.user_created),
      };
    }

    // ── An announcement is addressed to the community by definition ─────────
    case "hoa_announcements": {
      if (item.status !== "published") return null;
      const audience = String(item.target_audience || "all");
      return {
        category: "announcement",
        subject: String(item.title || "New announcement"),
        message: excerpt(item.content) || "A new announcement was posted.",
        collection: "hoa_announcements",
        item: itemId,
        // Announcements lost their own page in Phase 9 and render as cards in
        // the Building feed — the same destination the bell's click-through
        // resolves to, so a push tap and a bell click land together.
        path: BUILDING_FEED_PATH,
        audience: { kind: "org-audience", audience },
        // Editing a published announcement is not a second announcement.
        once: true,
        actorId: idOf(item.user_created),
      };
    }

    // ── A comment reaches the people already in the conversation ────────────
    case "hoa_comments": {
      if (input.action !== "create") return null;
      if (item.status && item.status !== "published") return null;
      const target = String(item.target_collection || "");
      const targetId = idOf(item.target_id) || String(item.target_id || "");
      if (!target || !targetId) return null;
      const actorId = idOf(item.user_created);
      const who = nameOf(item.user_created, "Someone");
      const body = excerpt(item.body);
      const pathFor = COMMENT_TARGET_PATHS[target];
      return {
        // Internal board notes are still comments to the people who can see
        // them; who those people are is the server resolver's problem, and it
        // is the only thing `is_internal` changes here.
        category: "comment",
        subject: `${who} commented`,
        message: body || `${who} left a comment.`,
        collection: "hoa_comments",
        item: itemId,
        path: pathFor ? pathFor(targetId) : null,
        audience: { kind: "participants", collection: target, id: targetId },
        once: false,
        actorId,
      };
    }

    default:
      return null;
  }
}

/** "Tue, Mar 4 at 6:00 PM", or "" when the date is missing or unparseable. */
export function formatMeetingDate(value: unknown): string {
  if (!value) return "";
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
