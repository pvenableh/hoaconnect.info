/**
 * Channel rules that must be identical in the server routes, the UI and the
 * tests — kept pure (no Directus, no clock reads) so each is a table test.
 *
 * Parity Round 3, Phase 7: message editing, notify-on-message, presence, DMs.
 */

// ── Editing (Decision 6) ────────────────────────────────────────────────────

/** Members may edit their own message for 15 minutes; managers have no limit. */
export const EDIT_WINDOW_MS = 15 * 60 * 1000;

export type EditVerdict =
  | { ok: true; /** Editing someone else's message — the route writes a moderation entry. */ moderated: boolean }
  | { ok: false; status: 403 | 409; reason: "not_yours" | "window_closed" | "not_editable" };

export interface EditInput {
  isAuthor: boolean;
  isManager: boolean;
  /** `date_created` of the message. */
  createdAt: string | Date | null | undefined;
  now: Date;
  /** Only published messages can be edited (a hidden/deleted one is a tombstone). */
  status?: string | null;
}

/**
 * Who may edit a message, and whether the edit is a moderation act.
 *
 * - Not published → no one (a tombstone is not content).
 * - Author, manager → always; author, member → inside the window.
 * - Manager editing another member's message → allowed and logged (`moderated`).
 * - Anyone else → refused.
 */
export function checkEditAllowed(input: EditInput): EditVerdict {
  if (input.status && input.status !== "published") {
    return { ok: false, status: 409, reason: "not_editable" };
  }
  if (input.isManager) return { ok: true, moderated: !input.isAuthor };
  if (!input.isAuthor) return { ok: false, status: 403, reason: "not_yours" };
  const created = input.createdAt ? new Date(input.createdAt).getTime() : NaN;
  // A missing/unparseable timestamp can't prove the message is recent: refuse.
  if (!Number.isFinite(created) || input.now.getTime() - created > EDIT_WINDOW_MS) {
    return { ok: false, status: 403, reason: "window_closed" };
  }
  return { ok: true, moderated: false };
}

/** Should the UI offer an edit button? Same rule, evaluated on the client's clock. */
export function canOfferEdit(input: Omit<EditInput, "status"> & { status?: string | null }): boolean {
  return checkEditAllowed(input).ok;
}

// ── Presence (cheap) ────────────────────────────────────────────────────────

/** The client beats every 60 s; a beat is good for a little over one miss. */
export const PRESENCE_HEARTBEAT_MS = 60_000;
export const PRESENCE_TTL_MS = 90_000;

export function isPresent(presentAt: string | Date | null | undefined, now: Date): boolean {
  if (!presentAt) return false;
  const t = new Date(presentAt).getTime();
  if (!Number.isFinite(t)) return false;
  const age = now.getTime() - t;
  return age >= -5_000 && age <= PRESENCE_TTL_MS; // tolerate a little clock skew
}

// ── Notify on message ───────────────────────────────────────────────────────

export interface FanOutMember {
  user: string;
  notifications_enabled?: boolean | null;
  present_at?: string | null;
}

/**
 * Who should hear about a new channel message: the channel's roster, minus the
 * author, anyone who muted it, anyone with it open right now (they are reading
 * it), and anyone who was @-mentioned in this message (their mention already
 * has its own row and push — a second row would be noise).
 *
 * `notifications_enabled` null/undefined counts as on (the column's default).
 */
export function planChannelFanOut(input: {
  members: FanOutMember[];
  authorId: string;
  mentionedIds?: string[];
  now: Date;
}): string[] {
  const mentioned = new Set(input.mentionedIds ?? []);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const m of input.members) {
    if (!m.user || seen.has(m.user)) continue;
    seen.add(m.user);
    if (m.user === input.authorId) continue;
    if (m.notifications_enabled === false) continue;
    if (mentioned.has(m.user)) continue;
    if (isPresent(m.present_at, input.now)) continue;
    out.push(m.user);
  }
  return out;
}

/** "3 new in #board" — or, in a direct message, "3 new from Ana". */
export function collapsedSubject(input: {
  count: number;
  channelName: string;
  isDm?: boolean;
  authorName?: string;
}): string {
  const n = Math.max(1, Math.floor(input.count));
  if (input.isDm) return `${n} new from ${input.authorName || "a member"}`;
  return `${n} new in #${input.channelName.replace(/^#/, "")}`;
}

/** The count in a collapsed subject ("3 new in …" → 3), or 0 when it isn't one. */
export function parseCollapsedCount(subject: string | null | undefined): number {
  const m = /^(\d+) new (?:in|from) /.exec(String(subject ?? ""));
  return m ? Number(m[1]) : 0;
}

// ── Direct messages ─────────────────────────────────────────────────────────

/** A stable key for a pair of users, independent of who started the DM. */
export function dmPairKey(a: string, b: string): string {
  return [a, b].sort().join(":");
}

/** The slug a DM channel is stored under — unique per pair, never user-typed. */
export function dmSlug(a: string, b: string): string {
  return `dm-${dmPairKey(a, b).replace(/[^a-z0-9:-]/gi, "").replace(/:/g, "-")}`;
}

/**
 * Is this channel slug a direct message's? `/channels/dm` writes `dm-…` slugs, and
 * the client uses this rather than `is_dm` so the roster still renders (and the
 * DM still opens) on a database where the column hasn't been migrated.
 */
export function isDmSlug(slug: string | null | undefined): boolean {
  return /^dm-/.test(String(slug ?? ""));
}

/**
 * A DM's roster is exactly its two people. Used by the invite route's guard
 * and by tests: no third party can ever be added.
 */
export function isValidDmRoster(userIds: string[], pair: [string, string]): boolean {
  const have = new Set(userIds);
  return have.size === 2 && have.has(pair[0]) && have.has(pair[1]);
}

/** In the roster a DM shows the *other* person, not the stored name. */
export function dmTitle(
  members: Array<{ user: string; first_name?: string | null; last_name?: string | null }>,
  currentUserId: string
): string {
  const other = members.find((m) => m.user !== currentUserId) ?? members[0];
  const name = [other?.first_name, other?.last_name].filter(Boolean).join(" ").trim();
  return name || "Direct message";
}
