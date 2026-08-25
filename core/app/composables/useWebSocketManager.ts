/**
 * useWebSocketManager - one shared Directus realtime connection for the whole app.
 *
 * Every realtime subscriber in the app (channels, comments, reactions, and from
 * Phase 2c the notification bell) multiplexes over a SINGLE WebSocket. Before
 * this, each realtime composable built its own Directus SDK client and opened
 * its own socket — a channel thread alone opened three, plus one per
 * expanded message. Directus counts those against its connection limit, and the
 * SDK's shared message reader means concurrent subscriptions on one client race
 * each other for frames.
 *
 * Design (ported from Earnest `app/composables/useWebSocketManager.ts`):
 * - N→1 multiplexing: one socket, messages routed to handlers by `uid`.
 * - Deduplication: identical collection+filter+fields+sort share one server-side
 *   subscription and fan out to every handler registered against it.
 * - Exponential backoff on unexpected close, capped attempts.
 * - 30s idle teardown so SPA navigation (unmount page A → mount page B) reuses
 *   the live socket instead of churning a disconnect/reconnect/token-fetch cycle.
 * - `online` / `visibilitychange` revive that RESETS the attempt counter, so a
 *   laptop waking from sleep recovers instead of staying dead until re-login.
 * - Stale-socket guards on every listener, so a replaced socket's late `close`
 *   can never tear down its successor.
 *
 * This is deliberately a raw `WebSocket` rather than the Directus SDK's
 * `realtime()` composable: the SDK exposes one async iterator per subscription
 * that competes for frames off the same connection, which is the very thing this
 * manager exists to avoid.
 *
 * Direct use is fine, but `useRealtimeSubscription` and
 * `useDirectusSubscription` wrap it with REST baseline + scope cleanup and are
 * usually what a component wants.
 */

export interface WsSubscriptionQuery {
  fields: string[]
  filter: Record<string, any> | null
  sort: string[] | null
}

export type WsSubscriptionHandler = (event: string, data: any[]) => void

interface SubscriptionEntry {
  collection: string
  query: WsSubscriptionQuery
  handler: WsSubscriptionHandler
}

interface SharedSubscription {
  uid: string
  collection: string
  query: WsSubscriptionQuery
  handlers: Set<WsSubscriptionHandler>
}

// ─── Module-level singleton state (client-side only) ─────────────────────────

let _ws: WebSocket | null = null
let _wsUrl = ""
let _loggedIn: Ref<boolean> | null = null
let _initialized = false
let _authenticated = false
let _authenticating = false
let _reconnectAttempts = 0
let _reconnectTimer: ReturnType<typeof setTimeout> | null = null
let _idleTeardownTimer: ReturnType<typeof setTimeout> | null = null

/** uid → routing entry. Survives a teardown so a revive can re-subscribe them. */
const _subscriptions = new Map<string, SubscriptionEntry>()
/** `collection:filter:fields:sort` → the one server-side subscription for it. */
const _sharedSubs = new Map<string, SharedSubscription>()

const _connected = ref(false)
const _connecting = ref(false)
const _connectionError = ref<string | null>(null)
const _reconnectAttemptsRef = ref(0)

const MAX_RECONNECT = 5
const RECONNECT_BASE_MS = 1000
const RECONNECT_MAX_MS = 16000
const IDLE_TEARDOWN_MS = 30_000

// ─── Initialization (called once, from a setup/composable context) ───────────

function _init() {
  if (_initialized || import.meta.server) return
  _initialized = true

  const config = useRuntimeConfig()
  const directus = (config.public as any)?.directus
  _wsUrl =
    directus?.websocketUrl ||
    (directus?.url ? String(directus.url).replace(/^http/, "ws") : "")

  const { loggedIn } = useUserSession()
  _loggedIn = loggedIn as Ref<boolean>

  // Global logout → tear down the shared connection and forget every
  // subscription. Unlike the idle/error teardowns, this one is terminal: the
  // next user must not inherit the previous user's routing table.
  watch(loggedIn, (isLoggedIn) => {
    if (!isLoggedIn) {
      _teardown()
      _subscriptions.clear()
      _sharedSubs.clear()
    }
  })

  // Revive realtime after a network return or a tab wake. Without this, once
  // the backoff exhausts MAX_RECONNECT (or the socket died while the laptop
  // slept), the connection stays dead until logout/login. Resetting the attempt
  // counter here is what lets a visible/online event recover it.
  const revive = () => {
    if (!_loggedIn?.value || _subscriptions.size === 0) return
    if (_ws && _ws.readyState < 2) return // already CONNECTING or OPEN
    _setAttempts(0)
    _ensureConnection()
  }

  if (typeof window !== "undefined") {
    window.addEventListener("online", revive)
  }
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") revive()
    })
  }
}

function _setAttempts(n: number) {
  _reconnectAttempts = n
  _reconnectAttemptsRef.value = n
}

// ─── Idle teardown (debounced) ───────────────────────────────────────────────

function _scheduleIdleTeardown() {
  if (_idleTeardownTimer) clearTimeout(_idleTeardownTimer)
  _idleTeardownTimer = setTimeout(() => {
    _idleTeardownTimer = null
    if (_subscriptions.size === 0) _teardown()
  }, IDLE_TEARDOWN_MS)
}

function _cancelIdleTeardown() {
  if (_idleTeardownTimer) {
    clearTimeout(_idleTeardownTimer)
    _idleTeardownTimer = null
  }
}

// ─── Connection lifecycle ────────────────────────────────────────────────────

function _ensureConnection() {
  if (import.meta.server) return
  if (!_loggedIn?.value) return
  if (!_wsUrl) {
    _connectionError.value = "No Directus websocket URL configured"
    return
  }
  if (_ws && _ws.readyState < 2) return // CONNECTING or OPEN

  _cancelIdleTeardown()
  _connecting.value = true

  try {
    const ws = new WebSocket(_wsUrl)
    _ws = ws

    // Every listener guards against a stale instance: if a newer socket has
    // already replaced this one, its late events must not touch shared state.
    ws.addEventListener("open", () => {
      if (_ws !== ws) return
      _connected.value = true
      _connecting.value = false
      _connectionError.value = null
      _setAttempts(0)
      void _authenticate()
    })

    ws.addEventListener("message", (e) => {
      if (_ws !== ws) return
      _onMessage(e)
    })

    ws.addEventListener("close", (e) => {
      if (_ws !== ws) return
      _connected.value = false
      _connecting.value = false
      _authenticated = false
      _authenticating = false

      // Only reconnect if it was unexpected and someone still wants data.
      if (!e.wasClean && _loggedIn?.value && _subscriptions.size > 0) {
        _scheduleReconnect()
      }
    })

    ws.addEventListener("error", () => {
      if (_ws !== ws) return
      _connected.value = false
      _connecting.value = false
      _connectionError.value = "WebSocket error"
      if (_loggedIn?.value && _subscriptions.size > 0) {
        _scheduleReconnect()
      }
    })
  } catch (err: any) {
    _connecting.value = false
    _connectionError.value = err?.message || "Connection failed"
    console.error("[WS Manager] Connection failed:", err)
  }
}

/**
 * Close the socket and reset connection state. Deliberately keeps both
 * registries intact: `_onAuth` re-subscribes everything in `_subscriptions` on
 * the next connection, so a teardown is recoverable. Only logout clears them.
 */
function _teardown() {
  if (_reconnectTimer) {
    clearTimeout(_reconnectTimer)
    _reconnectTimer = null
  }
  _cancelIdleTeardown()

  if (_ws) {
    const ws = _ws
    _ws = null // drop the reference first so the close handler sees itself as stale
    try {
      if (ws.readyState < 2) ws.close(1000, "Teardown")
    } catch {
      // Ignore
    }
  }

  _connected.value = false
  _connecting.value = false
  _authenticated = false
  _authenticating = false
  _setAttempts(0)
}

function _scheduleReconnect() {
  if (_reconnectTimer) clearTimeout(_reconnectTimer)
  if (_reconnectAttempts >= MAX_RECONNECT) {
    _connectionError.value = "Max reconnection attempts reached"
    return
  }
  if (!_loggedIn?.value) return

  const delay = Math.min(
    RECONNECT_BASE_MS * Math.pow(2, _reconnectAttempts),
    RECONNECT_MAX_MS
  )

  _reconnectTimer = setTimeout(() => {
    _reconnectTimer = null
    _setAttempts(_reconnectAttempts + 1)
    _ensureConnection()
  }, delay)
}

// ─── Authentication ──────────────────────────────────────────────────────────

async function _authenticate() {
  if (!_ws || _ws.readyState !== WebSocket.OPEN || _authenticating) return
  _authenticating = true

  try {
    const res = await $fetch<{ token: string }>("/api/websocket/token")
    const token = res?.token

    if (!token || !_ws || _ws.readyState !== WebSocket.OPEN) {
      _authenticating = false
      return
    }

    _ws.send(JSON.stringify({ type: "auth", access_token: token }))
  } catch (err) {
    _authenticating = false
    _connectionError.value = "Authentication token fetch failed"
    console.error("[WS Manager] Token fetch failed:", err)
  }
}

// ─── Message routing ─────────────────────────────────────────────────────────

function _onMessage(e: MessageEvent) {
  let msg: any
  try {
    msg = JSON.parse(e.data)
  } catch {
    return
  }

  switch (msg.type) {
    case "auth":
      _onAuth(msg)
      break
    case "subscription":
      _onSubscriptionData(msg)
      break
    case "ping":
      if (_ws?.readyState === WebSocket.OPEN) {
        _ws.send(JSON.stringify({ type: "pong" }))
      }
      break
  }
}

function _onAuth(msg: any) {
  _authenticating = false

  if (msg.status === "ok") {
    _authenticated = true
    _connectionError.value = null

    // (Re-)subscribe every active subscription on this fresh connection.
    for (const uid of _subscriptions.keys()) {
      _sendSubscribe(uid)
    }
    return
  }

  console.error("[WS Manager] Auth failed:", msg.reason)
  _connectionError.value = msg.reason || "Authentication failed"
  if (msg.reason?.includes("invalid") || msg.reason?.includes("expired")) {
    _teardown()
  }
}

function _onSubscriptionData(msg: any) {
  const entry = msg.uid ? _subscriptions.get(msg.uid) : undefined
  if (!entry) return
  entry.handler(msg.event, msg.data || [])
}

// ─── Subscribe helpers ───────────────────────────────────────────────────────

function _sendSubscribe(uid: string) {
  const entry = _subscriptions.get(uid)
  if (!entry || !_ws || _ws.readyState !== WebSocket.OPEN) return

  const query: Record<string, any> = { fields: entry.query.fields }
  if (entry.query.filter) query.filter = entry.query.filter
  if (entry.query.sort) query.sort = entry.query.sort

  _ws.send(
    JSON.stringify({
      type: "subscribe",
      collection: entry.collection,
      query,
      uid,
    })
  )
}

function _sendUnsubscribe(uid: string) {
  if (!_ws || _ws.readyState !== WebSocket.OPEN) return
  _ws.send(JSON.stringify({ type: "unsubscribe", uid }))
}

function _makeSubKey(collection: string, query: WsSubscriptionQuery): string {
  return [
    collection,
    JSON.stringify(query.filter || {}),
    JSON.stringify(query.fields || []),
    JSON.stringify(query.sort || []),
  ].join(":")
}

/**
 * Drop one handler from a shared subscription, tearing the subscription down
 * once the last handler leaves.
 *
 * The `_sharedSubs.get(subKey) === shared` identity check matters: a caller can
 * hold a stale release closure for a key that has since been unsubscribed and
 * re-created by a different component. Without it, the stale closure would
 * delete the NEW subscription and silently kill live realtime for whoever owns
 * it now. (Earnest's version compares nothing here.)
 */
function _release(subKey: string, shared: SharedSubscription, handler: WsSubscriptionHandler) {
  if (_sharedSubs.get(subKey) !== shared) return
  shared.handlers.delete(handler)
  if (shared.handlers.size > 0) return

  _sharedSubs.delete(subKey)
  _sendUnsubscribe(shared.uid)
  _subscriptions.delete(shared.uid)

  if (_subscriptions.size === 0) _scheduleIdleTeardown()
}

let _uidCounter = 0

// ─── Public composable ──────────────────────────────────────────────────────

export function useWebSocketManager() {
  // Lazy-init on first use (always from a setup / composable context).
  _init()

  /**
   * Register a subscription on the shared connection. If another caller already
   * subscribes to the same collection+filter+fields+sort, the handler joins that
   * subscription instead of opening a duplicate.
   */
  function subscribe(
    collection: string,
    query: WsSubscriptionQuery,
    handler: WsSubscriptionHandler
  ): { uid: string; unsubscribe: () => void } {
    // A new subscriber means we're active again — cancel any pending idle
    // teardown so navigation reuses the live connection.
    _cancelIdleTeardown()

    const subKey = _makeSubKey(collection, query)
    const existing = _sharedSubs.get(subKey)

    if (existing) {
      existing.handlers.add(handler)
      return {
        uid: existing.uid,
        unsubscribe: () => _release(subKey, existing, handler),
      }
    }

    const uid = `${collection}_${(++_uidCounter).toString(36)}_${Math.random()
      .toString(36)
      .slice(2, 8)}`
    const shared: SharedSubscription = {
      uid,
      collection,
      query,
      handlers: new Set([handler]),
    }
    _sharedSubs.set(subKey, shared)

    // The per-uid entry fans out to every handler sharing this subscription.
    _subscriptions.set(uid, {
      collection,
      query,
      handler: (event, data) => {
        for (const h of [...shared.handlers]) {
          try {
            h(event, data)
          } catch (err) {
            console.error(`[WS Manager] Handler error for ${collection}:`, err)
          }
        }
      },
    })

    _ensureConnection()

    // If auth already completed, subscribe now; otherwise `_onAuth` sweeps up
    // every registered uid when it does.
    if (_authenticated && _ws?.readyState === WebSocket.OPEN) {
      _sendSubscribe(uid)
    }

    return { uid, unsubscribe: () => _release(subKey, shared, handler) }
  }

  /** Force a full reconnect (e.g. after a token refresh). */
  function reconnect() {
    _teardown()
    if (_subscriptions.size > 0) _ensureConnection()
  }

  return {
    subscribe,
    reconnect,
    isConnected: readonly(_connected),
    isConnecting: readonly(_connecting),
    connectionError: readonly(_connectionError),
    reconnectAttempts: readonly(_reconnectAttemptsRef),
    /** Number of distinct server-side subscriptions currently multiplexed. */
    subscriptionCount: () => _subscriptions.size,
    hasSubscription: (uid: string) => _subscriptions.has(uid),
  }
}
