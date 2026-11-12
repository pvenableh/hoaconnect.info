/**
 * POST /api/realtime/poll — realtime without a Directus token in the browser.
 *
 *  - needs a session; reads run with the caller's own Directus client, so
 *    Directus applies the same permissions a socket subscription had;
 *  - one answer per subscription uid, `complete` false at the row cap;
 *  - Directus's own collections are refused, except notifications;
 *  - a token that ran out is refreshed once and the read retried;
 *  - one failing read does not sink the others.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { H3Event } from "h3";

const h = vi.hoisted(() => ({ body: {} as any, session: { user: { id: "u1" } } as any, calls: [] as any[], fail: new Map<string, any>(), refreshed: 0 }));

vi.mock("@directus/sdk", () => ({
  readItems: (collection: string, query: any) => ({ op: "readItems", collection, query }),
  readNotifications: (query: any) => ({ op: "readNotifications", collection: "directus_notifications", query }),
}));
vi.stubGlobal("defineEventHandler", (fn: unknown) => fn);
vi.stubGlobal("createError", (e: any) => Object.assign(new Error(e.message), e));

const route = (await import("#core/server/api/realtime/poll.post")).default as (e: H3Event) => Promise<any>;
const { POLL_ROW_LIMIT } = await import("#core/shared/realtime/diff");

const client = (label: string) => ({
  request: async (op: any) => {
    h.calls.push({ client: label, ...op });
    const failure = h.fail.get(op.collection);
    if (failure) {
      if (failure.once) h.fail.delete(op.collection);
      throw failure.error;
    }
    if (op.collection === "big") return Array.from({ length: POLL_ROW_LIMIT }, (_, i) => ({ id: i }));
    return [{ id: `${op.collection}-1` }];
  },
});

beforeEach(() => {
  h.calls = [];
  h.fail = new Map();
  h.refreshed = 0;
  h.session = { user: { id: "u1" } };
  vi.stubGlobal("readBody", async () => h.body);
  vi.stubGlobal("requireUserSession", async () => {
    if (!h.session) throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
    return h.session;
  });
  vi.stubGlobal("getUserDirectus", async (_e: unknown, refresh?: boolean) => {
    if (refresh) h.refreshed++;
    return client(refresh ? "refreshed" : "user");
  });
});

const poll = (subscriptions: any[]) => {
  h.body = { subscriptions };
  return route({} as H3Event);
};

describe("realtime poll", () => {
  it("needs a session", async () => {
    h.session = null;
    await expect(poll([{ uid: "a", collection: "hoa_channels", query: {} }])).rejects.toMatchObject({ statusCode: 401 });
    expect(h.calls).toEqual([]);
  });

  it("answers each subscription with the caller's own client, and says when the cap was reached", async () => {
    const { results } = await poll([
      { uid: "a", collection: "hoa_channel_messages", query: { fields: ["channel"], filter: { channel: { _eq: "c" } }, sort: ["-date_created"] } },
      { uid: "b", collection: "big", query: {} },
      { uid: "n", collection: "directus_notifications", query: { fields: ["id"], filter: { recipient: { _eq: "u1" } } } },
    ]);
    expect(results.a).toEqual({ rows: [{ id: "hoa_channel_messages-1" }], complete: true });
    expect(results.b.complete).toBe(false);
    expect(results.n).toEqual({ rows: [{ id: "directus_notifications-1" }], complete: true });
    expect(h.calls.every((c) => c.client === "user")).toBe(true);
    expect(h.calls[0]).toMatchObject({ op: "readItems", query: { fields: ["channel", "id"], filter: { channel: { _eq: "c" } }, sort: ["-date_created"], limit: POLL_ROW_LIMIT } });
    expect(h.calls[2]).toMatchObject({ op: "readNotifications" });
  });

  it("refuses Directus's own collections other than notifications, and anything that is not a collection name", async () => {
    const { results } = await poll([
      { uid: "u", collection: "directus_users", query: {} },
      { uid: "f", collection: "directus_files", query: {} },
      { uid: "x", collection: "../items", query: {} },
    ]);
    expect(Object.values(results).every((r: any) => r.error)).toBe(true);
    expect(h.calls).toEqual([]);
  });

  it("refreshes a token that ran out once, and retries", async () => {
    h.fail.set("hoa_comments", { once: true, error: { errors: [{ extensions: { code: "TOKEN_EXPIRED" } }] } });
    const { results } = await poll([{ uid: "c", collection: "hoa_comments", query: {} }]);
    expect(results.c.rows).toEqual([{ id: "hoa_comments-1" }]);
    expect(h.refreshed).toBe(1);
  });

  it("one failing read does not sink the others", async () => {
    h.fail.set("hoa_reactions", { error: { errors: [{ extensions: { code: "FORBIDDEN" } }] } });
    const { results } = await poll([
      { uid: "r", collection: "hoa_reactions", query: {} },
      { uid: "c", collection: "hoa_comments", query: {} },
    ]);
    expect(results.r).toEqual({ error: "Could not read" });
    expect(results.c.rows).toHaveLength(1);
  });
});
