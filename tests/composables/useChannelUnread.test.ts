/**
 * The composable's job is coordination, not arithmetic — the counts come from
 * the server. What can go wrong here is everything around them:
 *
 *   · six components calling refresh() on mount and firing six requests. That
 *     is not hypothetical; Earnest measured four concurrent fetches of this
 *     endpoint on one page load before the guard went in;
 *   · a badge that clears only after a round-trip, so opening a channel leaves
 *     the number sitting there for a beat;
 *   · a total that drifts, because clearing one channel subtracted a stale
 *     count or went negative;
 *   · and the one that matters for the divider: markRead must send the cursor
 *     it was given, since the caller passes the timestamp it actually rendered
 *     up to rather than "now".
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

let fetchCalls: Array<{ url: string; opts?: any }>;
let unreadPayload: { channels: Record<string, { count: number; lastReadAt: string | null }>; total: number };
let failNext: boolean;
let resolveFetch: (() => void) | null;

beforeEach(() => {
  vi.resetModules();
  fetchCalls = [];
  unreadPayload = { channels: {}, total: 0 };
  failNext = false;
  resolveFetch = null;

  vi.stubGlobal("$fetch", async (url: string, opts?: any) => {
    fetchCalls.push({ url, opts });
    if (resolveFetch) {
      await new Promise<void>((r) => {
        resolveFetch = r as () => void;
      });
    }
    if (failNext) throw new Error("directus is having a moment");
    if (url.endsWith("/unread")) return unreadPayload;
    return { ok: true };
  });

  vi.stubGlobal("useWebSocketManager", () => ({
    subscribe: () => ({ uid: "u1", unsubscribe: () => {} }),
  }));
  vi.stubGlobal("import.meta", { client: true });
});

const load = async () => (await import("#core/app/composables/useChannelUnread")).useChannelUnread;

describe("refresh", () => {
  it("collapses concurrent callers into one request", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    vi.stubGlobal("$fetch", async (url: string) => {
      fetchCalls.push({ url });
      await gate;
      return unreadPayload;
    });

    const useChannelUnread = await load();
    const a = useChannelUnread();
    const b = useChannelUnread();

    const both = Promise.all([a.refresh(), b.refresh()]);
    release();
    await both;

    expect(fetchCalls.filter((c) => c.url.endsWith("/unread"))).toHaveLength(1);
  });

  it("shares one state across every caller", async () => {
    unreadPayload = { channels: { c1: { count: 3, lastReadAt: null } }, total: 3 };
    const useChannelUnread = await load();
    const a = useChannelUnread();
    const b = useChannelUnread();

    await a.refresh();
    expect(b.countFor("c1")).toBe(3);
    expect(b.total.value).toBe(3);
  });

  it("keeps the last known counts when the request fails", async () => {
    unreadPayload = { channels: { c1: { count: 2, lastReadAt: null } }, total: 2 };
    const useChannelUnread = await load();
    const unread = useChannelUnread();
    await unread.refresh();

    failNext = true;
    await unread.refresh();
    expect(unread.total.value).toBe(2);
    expect(unread.countFor("c1")).toBe(2);
  });
});

describe("markRead", () => {
  it("zeroes the channel and subtracts exactly its count from the total", async () => {
    unreadPayload = {
      channels: { c1: { count: 4, lastReadAt: null }, c2: { count: 1, lastReadAt: null } },
      total: 5,
    };
    const useChannelUnread = await load();
    const unread = useChannelUnread();
    await unread.refresh();

    await unread.markRead("c1", "2026-06-01T00:00:00.000Z");
    expect(unread.countFor("c1")).toBe(0);
    expect(unread.countFor("c2")).toBe(1);
    expect(unread.total.value).toBe(1);
  });

  it("never drives the total below zero", async () => {
    unreadPayload = { channels: { c1: { count: 9, lastReadAt: null } }, total: 2 };
    const useChannelUnread = await load();
    const unread = useChannelUnread();
    await unread.refresh();

    await unread.markRead("c1");
    expect(unread.total.value).toBe(0);
  });

  it("sends the cursor it was handed, not just now", async () => {
    const useChannelUnread = await load();
    await useChannelUnread().markRead("c1", "2026-06-01T00:00:00.000Z");

    const post = fetchCalls.find((c) => c.url === "/api/hoa/channels/c1/read");
    expect(post?.opts?.method).toBe("POST");
    expect(post?.opts?.body).toEqual({ last_read_at: "2026-06-01T00:00:00.000Z" });
  });

  it("still clears the badge when the write fails", async () => {
    unreadPayload = { channels: { c1: { count: 3, lastReadAt: null } }, total: 3 };
    const useChannelUnread = await load();
    const unread = useChannelUnread();
    await unread.refresh();

    failNext = true;
    await unread.markRead("c1");
    expect(unread.countFor("c1")).toBe(0);
    expect(unread.total.value).toBe(0);
  });

  it("does nothing without a channel", async () => {
    const useChannelUnread = await load();
    await useChannelUnread().markRead(null);
    expect(fetchCalls).toHaveLength(0);
  });
});

describe("accessors", () => {
  it("reports zero rather than undefined for an unknown channel", async () => {
    const useChannelUnread = await load();
    const unread = useChannelUnread();
    expect(unread.countFor("nope")).toBe(0);
    expect(unread.countFor(null)).toBe(0);
    expect(unread.lastReadAtFor("nope")).toBeNull();
  });

  it("exposes the cursor the divider anchors to", async () => {
    unreadPayload = { channels: { c1: { count: 1, lastReadAt: "2026-05-05T00:00:00.000Z" } }, total: 1 };
    const useChannelUnread = await load();
    const unread = useChannelUnread();
    await unread.refresh();
    expect(unread.lastReadAtFor("c1")).toBe("2026-05-05T00:00:00.000Z");
  });
});
