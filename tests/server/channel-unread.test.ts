/**
 * Unread is a number that asks for attention, and the two ways to get it wrong
 * are opposite. Count too little and a conversation waits unseen. Count too
 * much — the classic failure — and the badge becomes noise within a day, at
 * which point it is worse than not having one.
 *
 * So the tests here are about the fences, not the arithmetic:
 *
 *   · the org-join floor, without which every admin seated after a community
 *     started talking opens the app to a badge for history that predates them;
 *   · muted channels reporting a count but never adding to the total;
 *   · bucket 2 being reachable ONLY where the caller genuinely reads channels
 *     org-wide. HOA's member policy is membership-scoped: a plain member with
 *     no `hoa_channel_members` row cannot open the channel at all, so badging
 *     it would point at a door that will not open;
 *   · and the tenancy line — the caller's active `hoa_members` rows are the
 *     only source of orgs, so a membership row pointing at another community's
 *     channel contributes nothing.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { BatchSpec } from "#core/server/utils/directus-graphql";

const HOME = "org-home";
const OTHER = "org-other";
const ME = "user-me";

const JOINED = "2026-01-01T00:00:00.000Z";

/** One readItemsBatch call: its specs. */
type Op = Record<string, BatchSpec>;

interface MessageRow {
  id: string;
  channel: string;
  author: string;
  at: string;
}

let ops: Op[];
/** The caller's hoa_members rows (active unless a status is given). */
let memberships: Array<{ organization: string; date_created: string | null; status?: string }>;
/** hoa_channel_members rows for the caller. */
let channelMembers: Array<{
  channel: { id: string; status?: string; organization: string };
  last_read_at: string | null;
  notifications_enabled?: boolean | null;
}>;
/** Every channel that exists, across orgs. */
let channels: Array<{ id: string; organization: string; is_private?: boolean; status?: string }>;
let messages: MessageRow[];

const countMessages = (filter: any): number => matching(filter).length;

const channelOf = (id: string) => channels.find((c) => c.id === id);

/** Does a `channel` clause hold for this channel id? Compares the id, or reaches into the channel row. */
function channelClause(id: string, clause: any): boolean {
  if (clause._eq !== undefined) return id === clause._eq;
  if (clause._in !== undefined) return clause._in.includes(id);
  if (clause._nin !== undefined) return !clause._nin.includes(id);
  const c = channelOf(id);
  if (!c) return false;
  if (clause.organization?._eq !== undefined && c.organization !== clause.organization._eq) return false;
  if (clause.is_private?._neq !== undefined && (c.is_private ?? false) === clause.is_private._neq) return false;
  if (clause.status?._in !== undefined && !clause.status._in.includes(c.status ?? "published")) return false;
  return true;
}

/** Apply the subset of Directus filter syntax these queries actually use. */
function matching(filter: any): MessageRow[] {
  const and: any[] = filter?._and ?? [];
  return messages.filter((m) => {
    for (const clause of and) {
      if (clause.channel !== undefined && !channelClause(m.channel, clause.channel)) return false;
      if (clause.user_created?._neq !== undefined && m.author === clause.user_created._neq) return false;
      if (clause.date_created?._gt !== undefined && !(m.at > clause.date_created._gt)) return false;
    }
    return true;
  });
}

beforeEach(() => {
  vi.resetModules();
  ops = [];
  memberships = [{ organization: HOME, date_created: JOINED }];
  channelMembers = [];
  channels = [];
  messages = [];
});

/** A stand-in for readItemsBatch over the fixtures above, answering as REST would (counts as text). */
async function read(specs: Op): Promise<Record<string, any[]>> {
  ops.push(specs);
  const out: Record<string, any[]> = {};
  for (const [key, spec] of Object.entries(specs)) {
    if (spec.collection === "hoa_members") out[key] = memberships.map((m) => ({ status: "active", ...m }));
    else if (spec.collection === "hoa_channel_members") out[key] = channelMembers;
    else if ("count" in spec && spec.groupBy) {
      const grouped = new Map<string, number>();
      for (const m of matching(spec.filter)) grouped.set(m.channel, (grouped.get(m.channel) || 0) + 1);
      out[key] = [...grouped.entries()].map(([channel, count]) => ({ channel, count: String(count) }));
    } else if ("count" in spec) out[key] = [{ count: String(countMessages(spec.filter)) }];
    else out[key] = [];
  }
  return out;
}

const countSpecs = () => ops.flatMap((o) => Object.values(o)).filter((s) => "count" in s);

const load = async () => (await import("#core/server/utils/channel-unread")).computeChannelUnread;
const loadCursor = async () => (await import("#core/server/utils/channel-unread")).nextReadCursor;

const run = (hasOrgWideAccess?: (orgId: string, rows: any[]) => boolean) =>
  load().then((fn) => fn({ userId: ME, hasOrgWideAccess, read }));

describe("bucket 1 — channels with a read cursor", () => {
  it("counts only messages by other people after the cursor", async () => {
    channelMembers = [
      { channel: { id: "c1", organization: HOME }, last_read_at: "2026-05-01T00:00:00.000Z" },
    ];
    messages = [
      { id: "m1", channel: "c1", author: "someone", at: "2026-04-01T00:00:00.000Z" }, // before cursor
      { id: "m2", channel: "c1", author: "someone", at: "2026-06-01T00:00:00.000Z" },
      { id: "m3", channel: "c1", author: ME, at: "2026-06-02T00:00:00.000Z" }, // mine
    ];

    const res = await run();
    expect(res.channels.c1).toEqual({ count: 1, lastReadAt: "2026-05-01T00:00:00.000Z" });
    expect(res.total).toBe(1);
  });

  it("counts everything when the cursor has never been set", async () => {
    channelMembers = [{ channel: { id: "c1", organization: HOME }, last_read_at: null }];
    messages = [
      { id: "m1", channel: "c1", author: "someone", at: "2020-01-01T00:00:00.000Z" },
      { id: "m2", channel: "c1", author: "someone", at: "2026-06-01T00:00:00.000Z" },
    ];

    const res = await run();
    expect(res.channels.c1.count).toBe(2);
    expect(res.channels.c1.lastReadAt).toBeNull();
  });

  it("reports a muted channel's count but leaves it out of the total", async () => {
    channelMembers = [
      { channel: { id: "loud", organization: HOME }, last_read_at: null },
      { channel: { id: "muted", organization: HOME }, last_read_at: null, notifications_enabled: false },
    ];
    messages = [
      { id: "m1", channel: "loud", author: "someone", at: "2026-06-01T00:00:00.000Z" },
      { id: "m2", channel: "muted", author: "someone", at: "2026-06-01T00:00:00.000Z" },
      { id: "m3", channel: "muted", author: "someone", at: "2026-06-02T00:00:00.000Z" },
    ];

    const res = await run();
    expect(res.channels.muted.count).toBe(2);
    expect(res.total).toBe(1);
  });

  it("drops a cursor row whose channel was deleted", async () => {
    channelMembers = [
      { channel: { id: "gone", organization: HOME, status: "deleted" }, last_read_at: null },
    ];
    messages = [{ id: "m1", channel: "gone", author: "someone", at: "2026-06-01T00:00:00.000Z" }];

    const res = await run();
    expect(res.channels).toEqual({});
    expect(res.total).toBe(0);
  });
});

describe("bucket 2 — org-wide channels never opened", () => {
  beforeEach(() => {
    channels = [{ id: "orgwide", organization: HOME, is_private: false }];
    messages = [
      // Predates the caller's join date — backlog.
      { id: "old", channel: "orgwide", author: "someone", at: "2025-06-01T00:00:00.000Z" },
      { id: "new", channel: "orgwide", author: "someone", at: "2026-06-01T00:00:00.000Z" },
    ];
  });

  it("is invisible to a caller without org-wide access", async () => {
    const res = await run();
    expect(res.channels).toEqual({});
    expect(res.total).toBe(0);
  });

  it("counts only what happened after the caller joined the org", async () => {
    const res = await run(() => true);
    expect(res.channels.orgwide).toEqual({ count: 1, lastReadAt: JOINED });
    expect(res.total).toBe(1);
  });

  it("counts nothing when no join date is recorded, rather than everything", async () => {
    memberships = [{ organization: HOME, date_created: null }];
    const res = await run(() => true);
    expect(res.channels).toEqual({});
    expect(res.total).toBe(0);
  });

  it("never includes a private channel", async () => {
    channels = [{ id: "secret", organization: HOME, is_private: true }];
    messages = [{ id: "m", channel: "secret", author: "someone", at: "2026-06-01T00:00:00.000Z" }];
    const res = await run(() => true);
    expect(res.channels).toEqual({});
  });

  it("skips a channel the caller already has a cursor for", async () => {
    channelMembers = [
      { channel: { id: "orgwide", organization: HOME }, last_read_at: "2026-06-02T00:00:00.000Z" },
    ];
    const res = await run(() => true);
    // Counted once, through bucket 1, and its cursor is respected.
    expect(res.channels.orgwide).toEqual({ count: 0, lastReadAt: "2026-06-02T00:00:00.000Z" });
    expect(res.total).toBe(0);
  });
});

describe("org scope", () => {
  it("returns nothing when the caller has no active membership anywhere", async () => {
    memberships = [];
    channelMembers = [{ channel: { id: "c1", organization: HOME }, last_read_at: null }];
    messages = [{ id: "m", channel: "c1", author: "someone", at: "2026-06-01T00:00:00.000Z" }];

    const res = await run(() => true);
    expect(res).toEqual({ channels: {}, total: 0 });
    // And it stopped before asking about any message at all.
    expect(countSpecs()).toEqual([]);
  });

  it("ignores a cursor row pointing at another community's channel", async () => {
    channelMembers = [
      { channel: { id: "theirs", organization: OTHER }, last_read_at: null },
      { channel: { id: "mine", organization: HOME }, last_read_at: null },
    ];
    messages = [
      { id: "m1", channel: "theirs", author: "someone", at: "2026-06-01T00:00:00.000Z" },
      { id: "m2", channel: "mine", author: "someone", at: "2026-06-01T00:00:00.000Z" },
    ];

    const res = await run();
    expect(Object.keys(res.channels)).toEqual(["mine"]);
    expect(res.total).toBe(1);
  });

  it("only asks about org-wide channels in orgs the caller has access to", async () => {
    memberships = [
      { organization: HOME, date_created: JOINED },
      { organization: OTHER, date_created: JOINED },
    ];
    channels = [
      { id: "home-wide", organization: HOME, is_private: false },
      { id: "other-wide", organization: OTHER, is_private: false },
    ];
    messages = [
      { id: "m1", channel: "home-wide", author: "someone", at: "2026-06-01T00:00:00.000Z" },
      { id: "m2", channel: "other-wide", author: "someone", at: "2026-06-01T00:00:00.000Z" },
    ];

    // Admin of HOME only — a board seat in one community is not a seat in another.
    const res = await run((org) => org === HOME);
    expect(Object.keys(res.channels)).toEqual(["home-wide"]);
    expect(res.total).toBe(1);

    const orgClauses = countSpecs()
      .filter((s: any) => s.groupBy)
      .map((s: any) => s.filter._and.find((c: any) => c.channel?.organization).channel.organization._eq);
    expect(orgClauses).toEqual([HOME]);
  });
});

describe("reads", () => {
  it("costs two batches however many channels and communities", async () => {
    memberships = [
      { organization: HOME, date_created: JOINED },
      { organization: OTHER, date_created: JOINED },
    ];
    channelMembers = [
      { channel: { id: "c1", organization: HOME }, last_read_at: null },
      { channel: { id: "c2", organization: OTHER }, last_read_at: null },
    ];
    channels = [{ id: "w", organization: HOME, is_private: false }];
    await run(() => true);
    expect(ops).toHaveLength(2);
  });

  it("asks about org-wide access with that org's membership rows, of any status", async () => {
    memberships = [
      { organization: HOME, date_created: JOINED },
      { organization: HOME, date_created: JOINED, status: "pending" },
      { organization: OTHER, date_created: JOINED },
    ];
    const seen: Record<string, number> = {};
    await run((org, rows) => {
      seen[org] = rows.length;
      return false;
    });
    expect(seen).toEqual({ [HOME]: 2, [OTHER]: 1 });
  });

  it("does not count a community the caller is only pending in", async () => {
    memberships = [{ organization: HOME, date_created: JOINED, status: "pending" }];
    channelMembers = [{ channel: { id: "c1", organization: HOME }, last_read_at: null }];
    messages = [{ id: "m", channel: "c1", author: "someone", at: "2026-06-01T00:00:00.000Z" }];
    expect(await run(() => true)).toEqual({ channels: {}, total: 0 });
  });
});

describe("nextReadCursor", () => {
  const NOW = "2026-08-24T18:50:14.000Z";
  const now = () => new Date(NOW);

  it("accepts a timestamp AHEAD of the app server's clock", async () => {
    // The regression this exists for. The value is `date_created` off a row
    // Directus stamped, on a machine whose clock ran a few seconds ahead;
    // clamping it to "now" put the cursor just before the message it was
    // acknowledging, so that message stayed unread while it sat on screen.
    const nextReadCursor = await loadCursor();
    const ahead = "2026-08-24T18:50:18.530Z";
    expect(nextReadCursor(null, ahead, now)).toBe(ahead);
  });

  it("never moves backwards", async () => {
    const nextReadCursor = await loadCursor();
    const held = "2026-08-24T18:50:00.000Z";
    expect(nextReadCursor(held, "2026-08-24T12:00:00.000Z", now)).toBe(held);
  });

  it("moves forward when the request is newer", async () => {
    const nextReadCursor = await loadCursor();
    const next = "2026-08-24T19:00:00.000Z";
    expect(nextReadCursor("2026-08-24T18:50:00.000Z", next, now)).toBe(next);
  });

  it("falls back to now when no timestamp is offered", async () => {
    const nextReadCursor = await loadCursor();
    expect(nextReadCursor(null, null, now)).toBe(NOW);
    expect(nextReadCursor(null, "not a date", now)).toBe(NOW);
  });

  it("still refuses to go backwards when falling back to now", async () => {
    const nextReadCursor = await loadCursor();
    const future = "2026-08-24T23:00:00.000Z";
    expect(nextReadCursor(future, null, now)).toBe(future);
  });

  it("ignores an unparseable stored cursor rather than sticking on it", async () => {
    const nextReadCursor = await loadCursor();
    expect(nextReadCursor("garbage", "2026-08-24T18:00:00.000Z", now)).toBe(
      "2026-08-24T18:00:00.000Z"
    );
  });
});
