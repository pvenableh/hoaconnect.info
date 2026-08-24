import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ref, nextTick } from "vue";

/**
 * The manager is a module-level singleton by design (one socket per app), so
 * every test re-imports it fresh via `vi.resetModules()`.
 */

class FakeWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  static instances: FakeWebSocket[] = [];

  readyState = FakeWebSocket.CONNECTING;
  sent: string[] = [];
  closeCalls: Array<{ code?: number; reason?: string }> = [];
  private listeners: Record<string, Array<(e: any) => void>> = {};

  constructor(public url: string) {
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type: string, fn: (e: any) => void) {
    (this.listeners[type] ||= []).push(fn);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close(code?: number, reason?: string) {
    this.closeCalls.push({ code, reason });
    this.readyState = FakeWebSocket.CLOSED;
    this.emit("close", { wasClean: true });
  }

  // ─── test drivers ───
  emit(type: string, e: any) {
    for (const fn of this.listeners[type] || []) fn(e);
  }

  openIt() {
    this.readyState = FakeWebSocket.OPEN;
    this.emit("open", {});
  }

  serverSend(payload: unknown) {
    this.emit("message", { data: JSON.stringify(payload) });
  }

  dropIt(wasClean = false) {
    this.readyState = FakeWebSocket.CLOSED;
    this.emit("close", { wasClean });
  }

  /** Every frame this client sent, parsed. */
  frames(): any[] {
    return this.sent.map((s) => JSON.parse(s));
  }

  subscribeFrames(): any[] {
    return this.frames().filter((f) => f.type === "subscribe");
  }
}

let loggedIn: ReturnType<typeof ref<boolean>>;
let tokenFetches: number;

/**
 * `vi.resetModules()` gives each test a fresh singleton, but the window/document
 * listeners registered by the PREVIOUS test's module instance stay attached to
 * the shared happy-dom globals. Dispatching a real `online` event would wake
 * every one of them. So listeners are captured per test and fired directly.
 */
let listeners: Record<string, Array<(e: any) => void>>;
const fire = (type: string) => {
  for (const fn of listeners[type] || []) fn({ type });
};

async function loadManager() {
  vi.resetModules();
  const mod = await import("#core/app/composables/useWebSocketManager");
  return mod.useWebSocketManager;
}

/** Open the socket, answer the token fetch, and let the server accept auth. */
async function handshake(ws: FakeWebSocket) {
  ws.openIt();
  await vi.advanceTimersByTimeAsync(0);
  ws.serverSend({ type: "auth", status: "ok" });
}

const sockets = () => FakeWebSocket.instances;
const latest = () => FakeWebSocket.instances[FakeWebSocket.instances.length - 1]!;

beforeEach(() => {
  vi.useFakeTimers();
  FakeWebSocket.instances = [];
  tokenFetches = 0;
  loggedIn = ref(true);
  listeners = {};

  vi.spyOn(window, "addEventListener").mockImplementation(((t: string, f: any) => {
    (listeners[t] ||= []).push(f);
  }) as any);
  vi.spyOn(document, "addEventListener").mockImplementation(((t: string, f: any) => {
    (listeners[t] ||= []).push(f);
  }) as any);

  vi.stubGlobal("WebSocket", FakeWebSocket);
  vi.stubGlobal("useRuntimeConfig", () => ({
    public: { directus: { url: "https://d.test", websocketUrl: "wss://d.test/websocket" } },
  }));
  vi.stubGlobal("useUserSession", () => ({ loggedIn }));
  vi.stubGlobal("$fetch", async () => {
    tokenFetches++;
    return { token: "tok" };
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("N→1 multiplexing", () => {
  it("opens exactly one socket for many subscriptions across collections", async () => {
    const useWebSocketManager = await loadManager();
    const a = useWebSocketManager();
    const b = useWebSocketManager();

    a.subscribe("hoa_channels", { fields: ["id"], filter: null, sort: null }, () => {});
    b.subscribe("hoa_channel_messages", { fields: ["id"], filter: { c: 1 }, sort: ["-date_created"] }, () => {});
    b.subscribe("hoa_comments", { fields: ["id"], filter: null, sort: null }, () => {});

    expect(sockets()).toHaveLength(1);
    expect(a.subscriptionCount()).toBe(3);
  });

  it("sends one subscribe frame per distinct query, all on the same socket", async () => {
    const useWebSocketManager = await loadManager();
    const m = useWebSocketManager();

    m.subscribe("hoa_channels", { fields: ["id"], filter: null, sort: null }, () => {});
    m.subscribe("hoa_comments", { fields: ["id"], filter: null, sort: null }, () => {});

    const ws = latest();
    await handshake(ws);

    expect(sockets()).toHaveLength(1);
    expect(ws.subscribeFrames().map((f) => f.collection)).toEqual([
      "hoa_channels",
      "hoa_comments",
    ]);
  });

  it("carries filter and sort into the subscribe frame, omitting empty ones", async () => {
    const useWebSocketManager = await loadManager();
    const m = useWebSocketManager();

    m.subscribe(
      "hoa_channel_messages",
      { fields: ["id", "content"], filter: { channel: { _eq: "c1" } }, sort: ["-date_created"] },
      () => {}
    );
    m.subscribe("hoa_comments", { fields: ["id"], filter: null, sort: null }, () => {});

    const ws = latest();
    await handshake(ws);

    const [messages, comments] = ws.subscribeFrames();
    expect(messages.query).toEqual({
      fields: ["id", "content"],
      filter: { channel: { _eq: "c1" } },
      sort: ["-date_created"],
    });
    expect(comments.query).toEqual({ fields: ["id"] });
  });
});

describe("deduplication", () => {
  it("shares one server-side subscription for an identical query", async () => {
    const useWebSocketManager = await loadManager();
    const m = useWebSocketManager();
    const seenA: any[] = [];
    const seenB: any[] = [];

    const q = () => ({ fields: ["id"], filter: { org: "o1" }, sort: null });
    const subA = m.subscribe("hoa_comments", q(), (e, d) => seenA.push([e, d]));
    const subB = m.subscribe("hoa_comments", q(), (e, d) => seenB.push([e, d]));

    expect(subA.uid).toBe(subB.uid);
    expect(m.subscriptionCount()).toBe(1);

    const ws = latest();
    await handshake(ws);
    expect(ws.subscribeFrames()).toHaveLength(1);

    ws.serverSend({ type: "subscription", uid: subA.uid, event: "create", data: [{ id: "1" }] });
    expect(seenA).toEqual([["create", [{ id: "1" }]]]);
    expect(seenB).toEqual([["create", [{ id: "1" }]]]);
  });

  it("keeps the subscription alive while any handler remains", async () => {
    const useWebSocketManager = await loadManager();
    const m = useWebSocketManager();
    const q = () => ({ fields: ["id"], filter: null, sort: null });

    const subA = m.subscribe("hoa_comments", q(), () => {});
    const subB = m.subscribe("hoa_comments", q(), () => {});
    const ws = latest();
    await handshake(ws);

    subA.unsubscribe();
    expect(m.subscriptionCount()).toBe(1);
    expect(ws.frames().some((f) => f.type === "unsubscribe")).toBe(false);

    subB.unsubscribe();
    expect(m.subscriptionCount()).toBe(0);
    expect(ws.frames().filter((f) => f.type === "unsubscribe")).toEqual([
      { type: "unsubscribe", uid: subA.uid },
    ]);
  });

  it("a stale release closure cannot kill a re-created subscription", async () => {
    const useWebSocketManager = await loadManager();
    const m = useWebSocketManager();
    const q = () => ({ fields: ["id"], filter: null, sort: null });

    const first = m.subscribe("hoa_comments", q(), () => {});
    const ws = latest();
    await handshake(ws);
    first.unsubscribe();

    // A different component re-subscribes to the same query...
    const received: any[] = [];
    const second = m.subscribe("hoa_comments", q(), (e) => received.push(e));
    expect(second.uid).not.toBe(first.uid);

    // ...and the stale closure fires again (double-unmount, retried cleanup).
    first.unsubscribe();

    expect(m.subscriptionCount()).toBe(1);
    ws.serverSend({ type: "subscription", uid: second.uid, event: "update", data: [{ id: "x" }] });
    expect(received).toEqual(["update"]);
  });
});

describe("uid routing", () => {
  it("routes each frame only to its own subscription's handlers", async () => {
    const useWebSocketManager = await loadManager();
    const m = useWebSocketManager();
    const channels: any[] = [];
    const comments: any[] = [];

    const chan = m.subscribe("hoa_channels", { fields: ["id"], filter: null, sort: null }, (e, d) =>
      channels.push([e, d])
    );
    const comm = m.subscribe("hoa_comments", { fields: ["id"], filter: null, sort: null }, (e, d) =>
      comments.push([e, d])
    );

    const ws = latest();
    await handshake(ws);

    ws.serverSend({ type: "subscription", uid: comm.uid, event: "create", data: [{ id: "c" }] });
    expect(channels).toEqual([]);
    expect(comments).toEqual([["create", [{ id: "c" }]]]);

    ws.serverSend({ type: "subscription", uid: chan.uid, event: "delete", data: [{ id: "k" }] });
    expect(channels).toEqual([["delete", [{ id: "k" }]]]);
    expect(comments).toHaveLength(1);
  });

  it("ignores frames for unknown uids and unparseable payloads", async () => {
    const useWebSocketManager = await loadManager();
    const m = useWebSocketManager();
    const seen: any[] = [];
    m.subscribe("hoa_channels", { fields: ["id"], filter: null, sort: null }, (e) => seen.push(e));

    const ws = latest();
    await handshake(ws);

    ws.serverSend({ type: "subscription", uid: "nope", event: "create", data: [{}] });
    ws.emit("message", { data: "not json" });
    expect(seen).toEqual([]);
  });

  it("one throwing handler does not stop its siblings", async () => {
    const useWebSocketManager = await loadManager();
    const m = useWebSocketManager();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const seen: string[] = [];
    const q = () => ({ fields: ["id"], filter: null, sort: null });

    const sub = m.subscribe("hoa_comments", q(), () => {
      throw new Error("boom");
    });
    m.subscribe("hoa_comments", q(), () => seen.push("second"));

    const ws = latest();
    await handshake(ws);
    ws.serverSend({ type: "subscription", uid: sub.uid, event: "create", data: [{}] });

    expect(seen).toEqual(["second"]);
  });

  it("answers server pings with a pong", async () => {
    const useWebSocketManager = await loadManager();
    const m = useWebSocketManager();
    m.subscribe("hoa_channels", { fields: ["id"], filter: null, sort: null }, () => {});

    const ws = latest();
    await handshake(ws);
    ws.serverSend({ type: "ping" });

    expect(ws.frames().some((f) => f.type === "pong")).toBe(true);
  });
});

describe("authentication", () => {
  it("defers subscribe frames until auth succeeds, then sends them all", async () => {
    const useWebSocketManager = await loadManager();
    const m = useWebSocketManager();
    m.subscribe("hoa_channels", { fields: ["id"], filter: null, sort: null }, () => {});
    m.subscribe("hoa_comments", { fields: ["id"], filter: null, sort: null }, () => {});

    const ws = latest();
    ws.openIt();
    await vi.advanceTimersByTimeAsync(0);

    expect(ws.subscribeFrames()).toHaveLength(0);
    expect(ws.frames()[0]).toEqual({ type: "auth", access_token: "tok" });

    ws.serverSend({ type: "auth", status: "ok" });
    expect(ws.subscribeFrames()).toHaveLength(2);
  });

  it("subscribes immediately once already authenticated", async () => {
    const useWebSocketManager = await loadManager();
    const m = useWebSocketManager();
    m.subscribe("hoa_channels", { fields: ["id"], filter: null, sort: null }, () => {});
    const ws = latest();
    await handshake(ws);
    expect(ws.subscribeFrames()).toHaveLength(1);

    m.subscribe("hoa_comments", { fields: ["id"], filter: null, sort: null }, () => {});
    expect(ws.subscribeFrames()).toHaveLength(2);
    expect(sockets()).toHaveLength(1);
  });

  it("tears down on an expired-token auth failure", async () => {
    const useWebSocketManager = await loadManager();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const m = useWebSocketManager();
    m.subscribe("hoa_channels", { fields: ["id"], filter: null, sort: null }, () => {});

    const ws = latest();
    ws.openIt();
    await vi.advanceTimersByTimeAsync(0);
    ws.serverSend({ type: "auth", status: "error", reason: "Token expired" });

    expect(m.isConnected.value).toBe(false);
    expect(ws.closeCalls).toHaveLength(1);
  });
});

describe("reconnection", () => {
  it("backs off exponentially after an unclean close and re-subscribes", async () => {
    const useWebSocketManager = await loadManager();
    const m = useWebSocketManager();
    m.subscribe("hoa_channels", { fields: ["id"], filter: null, sort: null }, () => {});

    const first = latest();
    await handshake(first);
    first.dropIt(false);

    // Nothing before the 1s base delay.
    await vi.advanceTimersByTimeAsync(999);
    expect(sockets()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(sockets()).toHaveLength(2);

    // Second failure waits 2s, third 4s.
    latest().dropIt(false);
    await vi.advanceTimersByTimeAsync(1999);
    expect(sockets()).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(sockets()).toHaveLength(3);

    // The restored connection re-subscribes everything it still routes.
    const restored = latest();
    await handshake(restored);
    expect(restored.subscribeFrames().map((f) => f.collection)).toEqual(["hoa_channels"]);
  });

  it("does not reconnect after a clean close", async () => {
    const useWebSocketManager = await loadManager();
    const m = useWebSocketManager();
    m.subscribe("hoa_channels", { fields: ["id"], filter: null, sort: null }, () => {});
    const ws = latest();
    await handshake(ws);

    ws.dropIt(true);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sockets()).toHaveLength(1);
  });

  it("gives up after 5 attempts, then an online event revives it", async () => {
    const useWebSocketManager = await loadManager();
    const m = useWebSocketManager();
    m.subscribe("hoa_channels", { fields: ["id"], filter: null, sort: null }, () => {});
    await handshake(latest());

    for (let i = 0; i < 6; i++) {
      latest().dropIt(false);
      await vi.advanceTimersByTimeAsync(30_000);
    }
    // 1 original + 5 retries; the 6th drop finds the attempt budget spent.
    expect(sockets()).toHaveLength(6);
    expect(m.connectionError.value).toBe("Max reconnection attempts reached");

    fire("online");
    expect(sockets()).toHaveLength(7);
    expect(m.reconnectAttempts.value).toBe(0);
  });

  it("a tab becoming visible again also revives a dead connection", async () => {
    const useWebSocketManager = await loadManager();
    const m = useWebSocketManager();
    m.subscribe("hoa_channels", { fields: ["id"], filter: null, sort: null }, () => {});
    await handshake(latest());

    for (let i = 0; i < 6; i++) {
      latest().dropIt(false);
      await vi.advanceTimersByTimeAsync(30_000);
    }
    expect(sockets()).toHaveLength(6);

    fire("visibilitychange");
    expect(sockets()).toHaveLength(7);
    await handshake(latest());
    expect(latest().subscribeFrames().map((f) => f.collection)).toEqual(["hoa_channels"]);
  });

  it("revive is a no-op when nothing is subscribed or a socket is already live", async () => {
    const useWebSocketManager = await loadManager();
    const m = useWebSocketManager();
    fire("online");
    expect(sockets()).toHaveLength(0);

    m.subscribe("hoa_channels", { fields: ["id"], filter: null, sort: null }, () => {});
    await handshake(latest());
    fire("online");
    fire("visibilitychange");
    expect(sockets()).toHaveLength(1);
  });

  it("a replaced socket's late close cannot tear down its successor", async () => {
    const useWebSocketManager = await loadManager();
    const m = useWebSocketManager();
    m.subscribe("hoa_channels", { fields: ["id"], filter: null, sort: null }, () => {});

    const first = latest();
    await handshake(first);
    first.dropIt(false);
    await vi.advanceTimersByTimeAsync(1000);

    const second = latest();
    await handshake(second);
    expect(m.isConnected.value).toBe(true);

    // The dead socket fires one more close event.
    first.dropIt(false);
    expect(m.isConnected.value).toBe(true);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sockets()).toHaveLength(2);
  });

  it("reconnect() replaces the socket and restores subscriptions", async () => {
    const useWebSocketManager = await loadManager();
    const m = useWebSocketManager();
    m.subscribe("hoa_channels", { fields: ["id"], filter: null, sort: null }, () => {});
    await handshake(latest());

    m.reconnect();
    expect(sockets()).toHaveLength(2);

    const restored = latest();
    await handshake(restored);
    expect(restored.subscribeFrames().map((f) => f.collection)).toEqual(["hoa_channels"]);
  });
});

describe("idle teardown", () => {
  it("keeps the socket for 30s after the last subscriber leaves", async () => {
    const useWebSocketManager = await loadManager();
    const m = useWebSocketManager();
    const sub = m.subscribe("hoa_channels", { fields: ["id"], filter: null, sort: null }, () => {});
    const ws = latest();
    await handshake(ws);

    sub.unsubscribe();
    await vi.advanceTimersByTimeAsync(29_999);
    expect(m.isConnected.value).toBe(true);

    await vi.advanceTimersByTimeAsync(1);
    expect(m.isConnected.value).toBe(false);
    expect(ws.closeCalls).toEqual([{ code: 1000, reason: "Teardown" }]);
  });

  it("a subscriber arriving inside the idle window reuses the live socket", async () => {
    const useWebSocketManager = await loadManager();
    const m = useWebSocketManager();
    const sub = m.subscribe("hoa_channels", { fields: ["id"], filter: null, sort: null }, () => {});
    const ws = latest();
    await handshake(ws);

    // SPA navigation: page A unmounts, page B mounts a moment later.
    sub.unsubscribe();
    await vi.advanceTimersByTimeAsync(5_000);
    m.subscribe("hoa_comments", { fields: ["id"], filter: null, sort: null }, () => {});

    await vi.advanceTimersByTimeAsync(60_000);
    expect(sockets()).toHaveLength(1);
    expect(m.isConnected.value).toBe(true);
    expect(tokenFetches).toBe(1);
  });
});

describe("session lifecycle", () => {
  it("logging out closes the socket and forgets every subscription", async () => {
    const useWebSocketManager = await loadManager();
    const m = useWebSocketManager();
    m.subscribe("hoa_channels", { fields: ["id"], filter: null, sort: null }, () => {});
    const ws = latest();
    await handshake(ws);

    loggedIn.value = false;
    await nextTick();

    expect(ws.closeCalls).toHaveLength(1);
    expect(m.subscriptionCount()).toBe(0);
    expect(m.isConnected.value).toBe(false);
  });

  it("does not connect while logged out", async () => {
    loggedIn = ref(false);
    const useWebSocketManager = await loadManager();
    const m = useWebSocketManager();
    m.subscribe("hoa_channels", { fields: ["id"], filter: null, sort: null }, () => {});

    expect(sockets()).toHaveLength(0);
    expect(m.subscriptionCount()).toBe(1);
  });
});
