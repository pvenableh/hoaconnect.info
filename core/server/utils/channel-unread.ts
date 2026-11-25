/**
 * Per-channel unread counts for one user.
 *
 * Adapted from Earnest's `server/api/channels/unread.get.ts`, not ported: the
 * two data models differ in exactly one interesting way. Earnest keeps a
 * `channel_members` row after revoking access (role nulled) so the row survives
 * as a read cursor, which is why its unread pass carries an audience gate. HOA
 * has no such state — a `hoa_channel_members` row IS the grant, and revoking is
 * deleting it — so the `role: null` semantic has nothing to gate here and is
 * dropped. What is kept, because it is the part that makes unread bearable, is
 * the two-bucket algorithm and its floor.
 *
 * Bucket 1 — channels with a membership row. Count published messages by
 * someone else after `last_read_at`. A row with no cursor yet counts everything
 * (a channel you were just invited to should badge).
 *
 * Bucket 2 — channels the caller can read WITHOUT a membership row. In HOA that
 * is a narrow set: the member policy is membership-scoped, so a plain member
 * with no row cannot open the channel at all and must never be badged for it.
 * Org admins and seated board members are the exception — their policy is
 * org-scoped, so every non-private channel in the community is genuinely
 * theirs to open, including ones created before they arrived. Those are counted
 * from the caller's org-join date, never from the channel's first message. The
 * floor is the whole point: without it, an admin seated last week opens the app
 * to a four-figure badge for conversations that happened before they existed
 * here, learns the number is noise, and stops reading it.
 *
 * Muted channels (`notifications_enabled: false` — HOA's spelling of Earnest's
 * `muted`) still report their own count, so the roster can show it, but are
 * excluded from `total`. A total is a demand for attention; a muted channel has
 * already been told not to make one.
 *
 * Runs on the admin client, so every scope decision above is ours to make
 * explicitly rather than something the caller's token enforces for us.
 */

import type { BatchSpec } from "./directus-graphql";
import { accessSnapshotSpecs } from "./access-snapshot";

export interface ChannelUnread {
  count: number;
  lastReadAt: string | null;
}

export interface UnreadResult {
  channels: Record<string, ChannelUnread>;
  total: number;
}

/**
 * Does the caller read channels org-wide in `orgId`? Given the caller's
 * `hoa_members` rows in that org (any status, with the access snapshot's
 * fields, sorted by id), so the route can answer from rows already read.
 */
export type UnreadOrgWideCheck = (orgId: string, memberRows: any[]) => boolean | Promise<boolean>;

/** A batch reader: `readItemsBatch`, or a stand-in in tests. */
export type UnreadBatchReader = (specs: Record<string, BatchSpec>) => Promise<Record<string, any[]>>;

const idOf = (v: any): string | null =>
  v == null ? null : typeof v === "string" ? v : (v.id ?? null);

/**
 * The next value of a read cursor. Exported and pure because the rule it
 * encodes is easy to get wrong and was, once: the cursor only ever moves
 * FORWARD.
 *
 * The obvious rule — clamp a future timestamp to "now" — is the wrong one. The
 * timestamp a client sends is not its own clock; it is `date_created` off the
 * row it just rendered, stamped by DIRECTUS, on a different machine. When
 * Directus ran a few seconds ahead of the app server, clamping rewrote the
 * cursor to just BEFORE the message it was acknowledging, and that message
 * stayed unread while the reader sat there watching it.
 *
 * Monotonicity also covers what the clamp was reaching for: a late markRead
 * from a stale render cannot un-read newer messages.
 */
export function nextReadCursor(
  existing: string | null | undefined,
  requested: string | null | undefined,
  now: () => Date = () => new Date()
): string {
  const parsed = requested ? new Date(requested) : null;
  const want =
    parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : now().toISOString();

  const prev = existing ? new Date(existing) : null;
  if (!prev || Number.isNaN(prev.getTime())) return want;
  return prev.getTime() > new Date(want).getTime() ? prev.toISOString() : want;
}

/** Round 1: the caller's memberships (with the access snapshot's fields) and read cursors. */
export function unreadMemberSpecs(userId: string): Record<"members" | "cursors", BatchSpec> {
  const mine = accessSnapshotSpecs(userId, "").mine as { fields: readonly string[]; deep?: Record<string, unknown> };
  return {
    // Every status: admin answers count a pending membership; orgs and floors use the active ones.
    members: {
      collection: "hoa_members",
      filter: { user: { _eq: userId } },
      fields: ["organization", "date_created", ...mine.fields],
      deep: mine.deep,
      sort: ["id"],
      limit: -1,
    },
    // Read the channel alongside so a row pointing at a deleted or foreign
    // channel is dropped rather than counted.
    cursors: {
      collection: "hoa_channel_members",
      filter: { user: { _eq: userId } },
      fields: ["last_read_at", "notifications_enabled", "channel.id", "channel.status", "channel.organization"],
      limit: -1,
    },
  };
}

interface Cursor {
  channelId: string;
  lastReadAt: string | null;
  muted: boolean;
}

/** The caller's active orgs, each org's floor (its join date), and the live read cursors. */
export function unreadScope(members: readonly any[], cursors: readonly any[]) {
  const active = members.filter((r) => r?.status === "active");
  const orgIds = [...new Set(active.map((r) => idOf(r.organization)).filter(Boolean))] as string[];
  const floorByOrg: Record<string, string | null> = {};
  for (const r of active) {
    const org = idOf(r.organization);
    if (org) floorByOrg[org] = r.date_created || null;
  }
  const live: Cursor[] = [];
  for (const m of cursors) {
    const ch = m?.channel;
    if (!ch || typeof ch !== "object" || !ch.id) continue;
    if (ch.status === "deleted") continue;
    const org = idOf(ch.organization);
    if (!org || !orgIds.includes(org)) continue;
    live.push({ channelId: ch.id, lastReadAt: m.last_read_at ?? null, muted: m.notifications_enabled === false });
  }
  return { orgIds, floorByOrg, live };
}

/**
 * Round 2: every count at once. `b1_<i>` counts the i-th cursor's channel
 * after its cursor; `b2_<j>` counts, per channel, the never-opened non-private
 * channels of the j-th org-wide org after the caller's join date.
 */
export function unreadCountSpecs(
  userId: string,
  live: readonly Cursor[],
  orgWide: ReadonlyArray<{ org: string; floor: string }>
): Record<string, BatchSpec> {
  const specs: Record<string, BatchSpec> = {};
  live.forEach((c, i) => {
    const and: any[] = [
      { channel: { _eq: c.channelId } },
      { status: { _eq: "published" } },
      { user_created: { _neq: userId } },
    ];
    if (c.lastReadAt) and.push({ date_created: { _gt: c.lastReadAt } });
    specs[`b1_${i}`] = { collection: "hoa_channel_messages", count: "*", filter: { _and: and } };
  });
  const cursorIds = live.map((c) => c.channelId);
  orgWide.forEach(({ org, floor }, j) => {
    specs[`b2_${j}`] = {
      collection: "hoa_channel_messages",
      count: "*",
      groupBy: ["channel"],
      filter: {
        _and: [
          { channel: { organization: { _eq: org } } },
          { channel: { is_private: { _neq: true } } },
          { channel: { status: { _in: ["published", "archived"] } } },
          ...(cursorIds.length ? [{ channel: { _nin: cursorIds } }] : []),
          { status: { _eq: "published" } },
          { user_created: { _neq: userId } },
          // The fence: only what happened after the caller joined.
          { date_created: { _gt: floor } },
        ],
      },
      limit: -1,
    };
  });
  return specs;
}

/** The counts back into the result: bucket 1 in cursor order, then bucket 2 by org. */
export function unreadFrom(
  live: readonly Cursor[],
  orgWide: ReadonlyArray<{ org: string; floor: string }>,
  counts: Record<string, any[]>
): UnreadResult {
  const channels: Record<string, ChannelUnread> = {};
  let total = 0;
  live.forEach((c, i) => {
    const count = Number(counts[`b1_${i}`]?.[0]?.count ?? 0) || 0;
    channels[c.channelId] = { count, lastReadAt: c.lastReadAt };
    // Muted reports its count but never demands attention.
    if (!c.muted) total += count;
  });
  orgWide.forEach(({ floor }, j) => {
    for (const row of counts[`b2_${j}`] ?? []) {
      const cid = idOf(row?.channel);
      const count = Number(row?.count ?? 0) || 0;
      if (!cid || !count) continue;
      channels[cid] = { count, lastReadAt: floor };
      total += count;
    }
  });
  return { channels, total };
}

/**
 * Two Directus requests whatever the number of communities and channels:
 * memberships and cursors, then every count. (Seven or more before: each
 * community's admin and board checks, then the reads in turn.)
 */
export async function computeChannelUnread(opts: {
  userId: string;
  /** Defaults to "no org-wide access anywhere" — bucket 1 only. */
  hasOrgWideAccess?: UnreadOrgWideCheck;
  /** Defaults to `readItemsBatch`. */
  read?: UnreadBatchReader;
}): Promise<UnreadResult> {
  const { userId } = opts;
  const hasOrgWideAccess = opts.hasOrgWideAccess ?? (() => false);
  const read: UnreadBatchReader = opts.read ?? ((specs) => readItemsBatch(specs));

  const first = await read(unreadMemberSpecs(userId));
  const members = first.members ?? [];
  const { orgIds, floorByOrg, live } = unreadScope(members, first.cursors ?? []);
  if (!orgIds.length) return { channels: {}, total: 0 };

  // Bucket 2 — only for the orgs where the caller reads channels org-wide, and
  // only from a recorded join date: a missing one is not a licence to badge an
  // entire history.
  const orgWide: Array<{ org: string; floor: string }> = [];
  for (const org of orgIds) {
    const rows = members.filter((r) => idOf(r.organization) === org);
    const floor = floorByOrg[org];
    if (floor && (await hasOrgWideAccess(org, rows))) orgWide.push({ org, floor });
  }

  const specs = unreadCountSpecs(userId, live, orgWide);
  const counts = Object.keys(specs).length ? await read(specs) : {};
  return unreadFrom(live, orgWide, counts);
}
