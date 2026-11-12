import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ref, nextTick } from "vue";

/**
 * The shared realtime feed now polls `/api/realtime/poll` instead of holding a
 * WebSocket to Directus with the user's own token. The manager is a
 * module-level singleton by design, so every test re-imports it fresh via
 * `vi.resetModules()`.
 */

type Rows = Record<string, any[] | { error: string }>;

let loggedIn: ReturnType<typeof ref<boolean>>;
let requests: any[];
/** What the server answers next, by collection. */
let serverRows: Record<string, any[]>;
let failNext: number;
let listeners: Record<string, Array<(e: any) => void>>;
let visibility: "visible" | "hidden";

const fire = (type: string) => {
  for (const fn of listeners[type] || []) fn({ type });
};

async function loadManager() {
  vi.resetModules();
  const mod = await import("#core/app/composables/useWebSocketManager");
  return mod;
}

const lastRequest = () => requests[requests.length - 1];
const tick = (ms: number) => vi.advanceTimersByTimeAsync(ms);

beforeEach(() => {
  vi.useFakeTimers();
  requests = [];
  serverRows = {};
  failNext = 0;
  loggedIn = ref(true);
  listeners = {};
  visibility = "visible";

  vi.spyOn(window, "addEventListener").mockImplementation(((t: string, f: any) => {
    (listeners[t] ||= []).push(f);
  }) as any);
  vi.spyOn(document, "addEventListener").mockImplementation(((t: string, f: any) => {
    (listeners[t] ||= []).push(f);
  }) as any);
  vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);

  vi.stubGlobal("useUserSession", () => ({ loggedIn }));
  vi.stubGlobal("$fetch", async (url: string, opts: any) => {
    requests.push({ url, ...opts });
    if (failNext > 0) {
      failNext--;
      throw Object.assign(new Error("network"), { statusCode: 502 });
    }
    const results: Rows = {};
    for (const sub of opts.body.subscriptions) {
      const rows = serverRows[sub.collection];
      results[sub.uid] = rows ? { rows, complete: true } as any : { rows: [], complete: true } as any;
    }
    return { results };
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("no token in the browser", () => {
  it("polls the app's own route and never asks for a Directus token or opens a socket", async () => {
    const WS = vi.fn();
    vi.stubGlobal("WebSocket", WS);
    const { useWebSocketManager } = await loadManager();
    useWebSocketManager().subscribe("hoa_channels", { fields: ["id"], filter: null, sort: null }, () => {});
    await tick(100);
    expect(requests.map((r) => r.url)).toEqual(["/api/realtime/poll"]);
    expect(WS).not.toHaveBeenCalled();
  });
});

describe("N→1 multiplexing and deduplication", () => {
  it("one request carries every distinct subscription", async () => {
    const { useWebSocketManager } = await loadManager();
    const m = useWebSocketManager();
    m.subscribe("hoa_channels", { fields: ["id"], filter: null, sort: ["name"] }, () => {});
    m.subscribe("hoa_comments", { fields: ["id"], filter: { entity: { _eq: "x" } }, sort: null }, () => {});
    await tick(100);
    expect(requests).toHaveLength(1);
    expect(lastRequest().body.subscriptions.map((s: any) => s.collection)).toEqual(["hoa_channels", "hoa_comments"]);
    expect(lastRequest().body.subscriptions[1].query).toEqual({ fields: ["id"], filter: { entity: { _eq: "x" } }, sort: null });
  });

  it("an identical query shares one subscription, alive while any handler remains", async () => {
    const { useWebSocketManager } = await loadManager();
    const m = useWebSocketManager();
    const q = { fields: ["id"], filter: null, sort: null };
    const a = m.subscribe("hoa_channels", q, () => {});
    const b = m.subscribe("hoa_channels", q, () => {});
    expect(a.uid).toBe(b.uid);
    expect(m.subscriptionCount()).toBe(1);
    a.unsubscribe();
    expect(m.hasSubscription(b.uid)).toBe(true);
    b.unsubscribe();
    expect(m.subscriptionCount()).toBe(0);
  });

  it("a stale release closure cannot kill a re-created subscription", async () => {
    const { useWebSocketManager } = await loadManager();
    const m = useWebSocketManager();
    const q = { fields: ["id"], filter: null, sort: null };
    const first = m.subscribe("hoa_channels", q, () => {});
    first.unsubscribe();
    const second = m.subscribe("hoa_channels", q, () => {});
    first.unsubscribe();
    expect(m.hasSubscription(second.uid)).toBe(true);
  });
});

describe("events", () => {
  it("the first poll is init with the rows; later polls send create, update and delete (keys)", async () => {
    const { useWebSocketManager, POLL_VISIBLE_MS } = await loadManager();
    const events: Array<[string, any[]]> = [];
    serverRows.hoa_comments = [{ id: "a", text: "one" }, { id: "b", text: "two" }];
    useWebSocketManager().subscribe("hoa_comments", { fields: ["id", "text"], filter: null, sort: null }, (e, d) => events.push([e, d]));
    await tick(100);
    expect(events).toEqual([["init", [{ id: "a", text: "one" }, { id: "b", text: "two" }]]]);

    serverRows.hoa_comments = [{ id: "a", text: "one, edited" }, { id: "c", text: "three" }];
    await tick(POLL_VISIBLE_MS);
    expect(events.slice(1)).toEqual([
      ["create", [{ id: "c", text: "three" }]],
      ["update", [{ id: "a", text: "one, edited" }]],
      ["delete", ["b"]],
    ]);

    await tick(POLL_VISIBLE_MS);
    expect(events).toHaveLength(4); // nothing changed, nothing sent
  });

  it("routes each result only to its own subscription; one throwing handler does not stop its siblings", async () => {
    const { useWebSocketManager } = await loadManager();
    const m = useWebSocketManager();
    serverRows.hoa_channels = [{ id: "c1" }];
    serverRows.hoa_comments = [{ id: "k1" }];
    const got: string[] = [];
    vi.spyOn(console, "error").mockImplementation(() => {});
    const q = { fields: ["id"], filter: null, sort: null };
    m.subscribe("hoa_channels", q, () => {
      throw new Error("boom");
    });
    m.subscribe("hoa_channels", q, (_e, d) => got.push(`channels:${d[0].id}`));
    m.subscribe("hoa_comments", q, (_e, d) => got.push(`comments:${d[0].id}`));
    await tick(100);
    expect(got.sort()).toEqual(["channels:c1", "comments:k1"]);
  });

  it("a subscription released while a poll is out gets nothing from it", async () => {
    const { useWebSocketManager } = await loadManager();
    const handler = vi.fn();
    const sub = useWebSocketManager().subscribe("hoa_channels", { fields: ["id"], filter: null, sort: null }, handler);
    sub.unsubscribe();
    await tick(100);
    expect(handler).not.toHaveBeenCalled();
  });
});

describe("pace, failures and waking", () => {
  it("polls every few seconds while visible and slowly while hidden", async () => {
    const { useWebSocketManager, POLL_VISIBLE_MS, POLL_HIDDEN_MS } = await loadManager();
    useWebSocketManager().subscribe("hoa_channels", { fields: ["id"], filter: null, sort: null }, () => {});
    await tick(100);
    await tick(POLL_VISIBLE_MS);
    expect(requests).toHaveLength(2);
    visibility = "hidden";
    await tick(POLL_VISIBLE_MS);
    expect(requests).toHaveLength(3); // the one already scheduled
    await tick(POLL_VISIBLE_MS * 2);
    expect(requests).toHaveLength(3);
    await tick(POLL_HIDDEN_MS);
    expect(requests).toHaveLength(4);
  });

  it("backs off after a failure, and a visible tab or a network return polls at once", async () => {
    const { useWebSocketManager, POLL_VISIBLE_MS } = await loadManager();
    const m = useWebSocketManager();
    failNext = 2;
    m.subscribe("hoa_channels", { fields: ["id"], filter: null, sort: null }, () => {});
    await tick(100);
    expect(m.isConnected.value).toBe(false);
    expect(m.reconnectAttempts.value).toBe(1);
    await tick(POLL_VISIBLE_MS); // backed off: not yet
    expect(requests).toHaveLength(1);
    await tick(POLL_VISIBLE_MS);
    expect(requests).toHaveLength(2);
    fire("online");
    await tick(0);
    expect(requests).toHaveLength(3);
    expect(m.isConnected.value).toBe(true);
    expect(m.reconnectAttempts.value).toBe(0);
    fire("visibilitychange");
    await tick(0);
    expect(requests).toHaveLength(4);
  });

  it("stops polling when the last subscriber leaves", async () => {
    const { useWebSocketManager, POLL_VISIBLE_MS } = await loadManager();
    const sub = useWebSocketManager().subscribe("hoa_channels", { fields: ["id"], filter: null, sort: null }, () => {});
    await tick(100);
    sub.unsubscribe();
    await tick(POLL_VISIBLE_MS * 3);
    expect(requests).toHaveLength(1);
  });
});

describe("session lifecycle", () => {
  it("does not poll while logged out", async () => {
    loggedIn.value = false;
    const { useWebSocketManager } = await loadManager();
    useWebSocketManager().subscribe("hoa_channels", { fields: ["id"], filter: null, sort: null }, () => {});
    await tick(5_000);
    expect(requests).toEqual([]);
  });

  it("logging out stops polling and forgets every subscription", async () => {
    const { useWebSocketManager, POLL_VISIBLE_MS } = await loadManager();
    const m = useWebSocketManager();
    m.subscribe("hoa_channels", { fields: ["id"], filter: null, sort: null }, () => {});
    await tick(100);
    loggedIn.value = false;
    await nextTick();
    expect(m.subscriptionCount()).toBe(0);
    await tick(POLL_VISIBLE_MS * 2);
    expect(requests).toHaveLength(1);
  });
});
