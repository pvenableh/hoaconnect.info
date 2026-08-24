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

import { readItems, aggregate } from "@directus/sdk";

export interface ChannelUnread {
  count: number;
  lastReadAt: string | null;
}

export interface UnreadResult {
  channels: Record<string, ChannelUnread>;
  total: number;
}

const idOf = (v: any): string | null =>
  v == null ? null : typeof v === "string" ? v : (v.id ?? null);

/**
 * Which of the caller's orgs they can read every non-private channel in — i.e.
 * where bucket 2 applies. Injected rather than imported so the test can pin the
 * boundary without standing up admin-auth's session plumbing.
 */
export type OrgWideAccessCheck = (orgId: string) => boolean | Promise<boolean>;

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

export async function computeChannelUnread(opts: {
  directus: ReturnType<typeof getTypedDirectus>;
  userId: string;
  /** Defaults to "no org-wide access anywhere" — bucket 1 only. */
  hasOrgWideAccess?: OrgWideAccessCheck;
}): Promise<UnreadResult> {
  const { directus, userId } = opts;
  const hasOrgWideAccess = opts.hasOrgWideAccess ?? (() => false);

  // The caller's active communities, plus the per-org floor bucket 2 counts
  // from. `date_created` on the membership row is HOA's join date.
  const memberRows = (await directus.request(
    readItems("hoa_members", {
      filter: { user: { _eq: userId }, status: { _eq: "active" } },
      fields: ["organization", "date_created"],
      limit: -1,
    })
  )) as unknown as Array<{ organization: any; date_created: string | null }>;

  const orgIds = [...new Set(memberRows.map((r) => idOf(r.organization)).filter(Boolean))] as string[];
  if (!orgIds.length) return { channels: {}, total: 0 };

  const floorByOrg: Record<string, string | null> = {};
  for (const r of memberRows) {
    const org = idOf(r.organization);
    if (org) floorByOrg[org] = r.date_created || null;
  }

  // Bucket 1 — membership rows. Read the channel alongside so a row pointing at
  // a deleted or foreign channel is dropped here rather than counted.
  const memberships = (await directus.request(
    readItems("hoa_channel_members", {
      filter: { user: { _eq: userId } },
      fields: [
        "last_read_at",
        "notifications_enabled",
        { channel: ["id", "status", "organization"] },
      ],
      limit: -1,
    })
  )) as unknown as Array<{
    channel: any;
    last_read_at: string | null;
    notifications_enabled: boolean | null;
  }>;

  const live = memberships.filter((m) => {
    const ch = m.channel;
    if (!ch || typeof ch !== "object" || !ch.id) return false;
    if (ch.status === "deleted") return false;
    const org = idOf(ch.organization);
    return !!org && orgIds.includes(org);
  });

  const channels: Record<string, ChannelUnread> = {};
  let total = 0;

  await Promise.all(
    live.map(async (m) => {
      const channelId = m.channel.id as string;
      const and: any[] = [
        { channel: { _eq: channelId } },
        { status: { _eq: "published" } },
        { user_created: { _neq: userId } },
      ];
      if (m.last_read_at) and.push({ date_created: { _gt: m.last_read_at } });

      const res = (await directus.request(
        aggregate("hoa_channel_messages" as never, {
          aggregate: { count: "*" },
          query: { filter: { _and: and } as never },
        })
      )) as unknown as Array<{ count: string | number }>;

      const count = Number(res?.[0]?.count ?? 0) || 0;
      channels[channelId] = { count, lastReadAt: m.last_read_at ?? null };
      // Muted reports its count but never demands attention.
      if (m.notifications_enabled !== false) total += count;
    })
  );

  // Bucket 2 — only for the orgs where the caller reads channels org-wide.
  const orgWideOrgs: string[] = [];
  for (const org of orgIds) {
    if (await hasOrgWideAccess(org)) orgWideOrgs.push(org);
  }
  if (!orgWideOrgs.length) return { channels, total };

  const cursorIds = live.map((m) => m.channel.id as string);
  const neverOpened = (await directus.request(
    readItems("hoa_channels", {
      filter: {
        _and: [
          { organization: { _in: orgWideOrgs } },
          { is_private: { _neq: true } },
          { status: { _in: ["published", "archived"] } },
          ...(cursorIds.length ? [{ id: { _nin: cursorIds } }] : []),
        ],
      } as never,
      fields: ["id", "organization"],
      limit: -1,
    })
  )) as unknown as Array<{ id: string; organization: any }>;

  const idsByOrg = new Map<string, string[]>();
  for (const c of neverOpened) {
    const org = idOf(c.organization);
    if (!c.id || !org) continue;
    if (!idsByOrg.has(org)) idsByOrg.set(org, []);
    idsByOrg.get(org)!.push(c.id);
  }

  await Promise.all(
    [...idsByOrg.entries()].map(async ([org, ids]) => {
      const floor = floorByOrg[org] || null;
      const and: any[] = [
        { channel: { _in: ids } },
        { status: { _eq: "published" } },
        { user_created: { _neq: userId } },
      ];
      // The fence. No floor recorded → count nothing rather than everything:
      // a missing join date is not a licence to badge an entire history.
      if (!floor) return;
      and.push({ date_created: { _gt: floor } });

      const grouped = (await directus.request(
        aggregate("hoa_channel_messages" as never, {
          aggregate: { count: "*" },
          groupBy: ["channel"] as never,
          query: { filter: { _and: and } as never, limit: -1 },
        })
      )) as unknown as Array<{ channel: any; count: string | number }>;

      for (const row of grouped || []) {
        const cid = idOf(row?.channel);
        const count = Number(row?.count ?? 0) || 0;
        if (!cid || !count) continue;
        channels[cid] = { count, lastReadAt: floor };
        total += count;
      }
    })
  );

  return { channels, total };
}
