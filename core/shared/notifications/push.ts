/**
 * Web-push payload rules — pure, no browser and no server APIs.
 *
 * Push is the BELL'S mobile twin, not the email's. The durable record is the
 * Directus notification row; push is a best-effort tap on the shoulder that the
 * row already guarantees. So a push is gated by the same per-category `_bell`
 * preference as the bell itself (see `bellAllowed`) — a member who silenced
 * announcement *emails* to keep their inbox quiet still gets the announcement
 * push, which is what "turn off emails, keep notifications" is supposed to mean.
 *
 * Notifications in HOA Connect are org-scoped: a member can belong to several
 * communities, so every payload carries which one it came from and every link
 * is org-scoped. A push that just said "New announcement" would be useless to
 * someone in three buildings.
 */
import { bellAllowed, type NotificationCategory, type NotificationPreferences } from "./preferences";

/**
 * A push service rejects an over-large payload outright, and the ~4KB limit is
 * on the ENCRYPTED body, so the plaintext budget is smaller. Titles and bodies
 * come from user-authored content (announcement subjects, task titles), so they
 * have to be bounded rather than trusted.
 */
export const PUSH_TITLE_MAX = 80;
export const PUSH_BODY_MAX = 300;

export interface PushOrgContext {
  id: string;
  slug: string;
  name?: string | null;
}

export interface PushPayload {
  title: string;
  body: string;
  /** Where a tap lands. Org-scoped; absolute once an origin is known. */
  url: string;
  /** Collapse key — a newer push for the same item replaces the older one. */
  tag?: string;
  /** Authoritative unread count, when the caller knows it. */
  badge?: number;
  org?: PushOrgContext;
}

/**
 * May we push this category to this member? Same answer as the bell, by design
 * — if the row is going to be written, the push may go with it; if the member
 * silenced the category, neither happens.
 */
export function pushAllowed(
  prefs: NotificationPreferences | null | undefined,
  category: NotificationCategory
): boolean {
  return bellAllowed(prefs, category);
}

/** Trim to a hard budget on a word boundary where one is close enough. */
export function truncate(text: string, max: number): string {
  const s = (text || "").replace(/\s+/g, " ").trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/**
 * A stable collapse key for an item, so five edits to one milestone show the
 * member one notification rather than five.
 */
export function pushTag(collection?: string | null, item?: string | null): string | undefined {
  if (!collection || !item) return undefined;
  return `${collection}:${item}`;
}

/**
 * Build the payload the service worker receives. `path` is org-relative (e.g.
 * "/admin/projects"); it becomes `/{slug}{path}` so a tap lands in the right
 * community, and absolute when an origin is supplied (`safeRequestOrigin`).
 */
export function buildPushPayload(input: {
  title: string;
  body: string;
  org: PushOrgContext;
  /** Org-relative path. Defaults to the org root. */
  path?: string | null;
  origin?: string | null;
  collection?: string | null;
  item?: string | null;
  badge?: number;
}): PushPayload {
  const path = input.path && input.path.startsWith("/") ? input.path : `/${input.path || ""}`;
  const rel = `/${input.org.slug}${path === "/" ? "" : path}`;
  const origin = (input.origin || "").replace(/\/$/, "");
  const payload: PushPayload = {
    title: truncate(input.title, PUSH_TITLE_MAX),
    body: truncate(input.body, PUSH_BODY_MAX),
    url: origin ? `${origin}${rel}` : rel,
    org: { id: input.org.id, slug: input.org.slug, name: input.org.name ?? null },
  };
  const tag = pushTag(input.collection, input.item);
  if (tag) payload.tag = tag;
  if (typeof input.badge === "number" && Number.isFinite(input.badge)) {
    payload.badge = Math.max(0, Math.floor(input.badge));
  }
  return payload;
}
