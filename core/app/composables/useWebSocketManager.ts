/**
 * useWebSocketManager - the one shared realtime feed for the whole app.
 *
 * Every realtime subscriber (channels, replies, comments, reactions, the
 * notification bell, unread counts) registers here. The name is historical: it
 * no longer opens a WebSocket. It used to open one straight to Directus with
 * the user's own Directus access token, fetched from `/api/websocket/token`,
 * and that token let any signed-in user call Directus directly, past every app
 * route. The app is on Vercel, where a socket relay cannot run, so the feed
 * now polls `/api/realtime/poll`, which runs each subscription's query on the
 * server with the user's token (the same permissions a socket had) and returns
 * the rows; `diffRows` turns two polls into the `init`, `create`, `update` and
 * `delete` events a Directus subscription sent, in the same shapes. Changes
 * arrive within a few seconds instead of at once.
 *
 * Kept from the socket design:
 * - N→1 multiplexing: one request per tick carries every subscription.
 * - Deduplication: identical collection+filter+fields+sort share one
 *   subscription and fan out to every handler registered against it.
 * - Backoff after a failed poll, reset by `online` / `visibilitychange`.
 * - A stale release closure cannot kill a re-created subscription.
 * - Logout forgets every subscription.
 *
 * `useRealtimeSubscription` and `useDirectusSubscription` wrap this with a REST
 * baseline and scope cleanup and are usually what a component wants.
 */
import { diffRows, type RowSnapshot } from "#core/shared/realtime/diff"

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

type PollResult = { rows: any[]; complete: boolean } | { error: string }

// ─── Module-level singleton state (client-side only) ─────────────────────────

let _loggedIn: Ref<boolean> | null = null
let _initialized = false
let _timer: ReturnType<typeof setTimeout> | null = null
let _inFlight = false
/** A subscription arrived during a poll: poll again soon rather than after a full interval. */
let _soon = false
let _failures = 0

/** uid → routing entry. */
const _subscriptions = new Map<string, SubscriptionEntry>()
/** `collection:filter:fields:sort` → the one subscription for it. */
const _sharedSubs = new Map<string, SharedSubscription>()
/** uid → the rows the last poll returned. Absent until the first poll (which sends `init`). */
const _snapshots = new Map<string, RowSnapshot>()

const _connected = ref(false)
const _connecting = ref(false)
const _connectionError = ref<string | null>(null)
const _reconnectAttemptsRef = ref(0)

export const POLL_VISIBLE_MS = 4_000
export const POLL_HIDDEN_MS = 30_000
const POLL_SOON_MS = 50
const BACKOFF_MAX_MS = 60_000

// ─── Initialization (called once, from a setup/composable context) ───────────

function _init() {
  if (_initialized || import.meta.server) return
  _initialized = true

  const { loggedIn } = useUserSession()
  _loggedIn = loggedIn as Ref<boolean>

  // Logout is terminal: the next user must not inherit this user's routing table.
  watch(loggedIn, (isLoggedIn) => {
    if (!isLoggedIn) {
      _stop()
      _subscriptions.clear()
      _sharedSubs.clear()
      _snapshots.clear()
    }
  })

  // A network return or a tab wake polls at once and forgets earlier failures.
  const revive = () => {
    if (!_loggedIn?.value || _subscriptions.size === 0) return
    _failures = 0
    _setAttempts(0)
    _schedule(0)
  }
  if (typeof window !== "undefined") window.addEventListener("online", revive)
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") revive()
    })
  }
}

function _setAttempts(n: number) {
  _reconnectAttemptsRef.value = n
}

const _hidden = () => typeof document !== "undefined" && document.visibilityState === "hidden"

function _nextDelay() {
  if (_soon) return POLL_SOON_MS
  const base = _hidden() ? POLL_HIDDEN_MS : POLL_VISIBLE_MS
  return _failures ? Math.min(base * 2 ** _failures, BACKOFF_MAX_MS) : base
}

// ─── Poll loop ───────────────────────────────────────────────────────────────

function _stop() {
  if (_timer) clearTimeout(_timer)
  _timer = null
  _soon = false
  _connected.value = false
  _connecting.value = false
}

function _schedule(delay: number) {
  if (import.meta.server) return
  if (_timer) clearTimeout(_timer)
  _timer = null
  if (!_loggedIn?.value || _subscriptions.size === 0) {
    _connected.value = false
    return
  }
  _timer = setTimeout(() => {
    _timer = null
    void _poll()
  }, delay)
}

async function _poll() {
  if (_inFlight) {
    _soon = true
    return
  }
  if (!_loggedIn?.value || _subscriptions.size === 0) return
  _inFlight = true
  _soon = false
  if (!_connected.value) _connecting.value = true

  const batch = [..._subscriptions.entries()].map(([uid, entry]) => ({
    uid,
    collection: entry.collection,
    query: entry.query,
  }))

  try {
    const res = await $fetch<{ results: Record<string, PollResult> }>("/api/realtime/poll", {
      method: "POST",
      body: { subscriptions: batch },
    })
    _failures = 0
    _setAttempts(0)
    _connected.value = true
    _connectionError.value = null

    for (const { uid } of batch) {
      const entry = _subscriptions.get(uid)
      if (!entry) continue // released while the poll was out
      const result = res?.results?.[uid]
      if (!result || "error" in result) {
        _connectionError.value = (result as { error?: string } | undefined)?.error ?? "No result"
        continue
      }
      const previous = _snapshots.get(uid)
      const diff = diffRows(previous ?? new Map(), result.rows ?? [], result.complete !== false)
      _snapshots.set(uid, diff.next)
      if (!previous) {
        entry.handler("init", result.rows ?? [])
        continue
      }
      if (diff.create.length) entry.handler("create", diff.create)
      if (diff.update.length) entry.handler("update", diff.update)
      if (diff.delete.length) entry.handler("delete", diff.delete)
    }
  } catch (err: any) {
    _failures++
    _setAttempts(_failures)
    _connected.value = false
    _connectionError.value = err?.statusCode === 401 ? "Signed out" : err?.message || "Poll failed"
  } finally {
    _inFlight = false
    _connecting.value = false
    _schedule(_nextDelay())
  }
}

// ─── Subscribe helpers ───────────────────────────────────────────────────────

function _makeSubKey(collection: string, query: WsSubscriptionQuery): string {
  return [
    collection,
    JSON.stringify(query.filter || {}),
    JSON.stringify(query.fields || []),
    JSON.stringify(query.sort || []),
  ].join(":")
}

/**
 * Drop one handler from a shared subscription, ending the subscription once the
 * last handler leaves. The identity check matters: a stale release closure for
 * a key that has since been re-created by another component must not delete
 * the new subscription.
 */
function _release(subKey: string, shared: SharedSubscription, handler: WsSubscriptionHandler) {
  if (_sharedSubs.get(subKey) !== shared) return
  shared.handlers.delete(handler)
  if (shared.handlers.size > 0) return

  _sharedSubs.delete(subKey)
  _subscriptions.delete(shared.uid)
  _snapshots.delete(shared.uid)
  if (_subscriptions.size === 0) _stop()
}

let _uidCounter = 0

// ─── Public composable ──────────────────────────────────────────────────────

export function useWebSocketManager() {
  _init()

  /**
   * Register a subscription. If another caller already subscribes to the same
   * collection+filter+fields+sort, the handler joins that subscription. The
   * first poll answers with `init` and the rows as they are.
   */
  function subscribe(
    collection: string,
    query: WsSubscriptionQuery,
    handler: WsSubscriptionHandler
  ): { uid: string; unsubscribe: () => void } {
    const subKey = _makeSubKey(collection, query)
    const existing = _sharedSubs.get(subKey)

    if (existing) {
      existing.handlers.add(handler)
      return { uid: existing.uid, unsubscribe: () => _release(subKey, existing, handler) }
    }

    const uid = `${collection}_${(++_uidCounter).toString(36)}_${Math.random().toString(36).slice(2, 8)}`
    const shared: SharedSubscription = { uid, collection, query, handlers: new Set([handler]) }
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
            console.error(`[Realtime] Handler error for ${collection}:`, err)
          }
        }
      },
    })

    if (_inFlight) _soon = true
    else _schedule(POLL_SOON_MS)

    return { uid, unsubscribe: () => _release(subKey, shared, handler) }
  }

  /** Poll now and forget earlier failures. */
  function reconnect() {
    _failures = 0
    _setAttempts(0)
    _schedule(0)
  }

  return {
    subscribe,
    reconnect,
    isConnected: readonly(_connected),
    isConnecting: readonly(_connecting),
    connectionError: readonly(_connectionError),
    reconnectAttempts: readonly(_reconnectAttemptsRef),
    /** Number of distinct subscriptions currently multiplexed. */
    subscriptionCount: () => _subscriptions.size,
    hasSubscription: (uid: string) => _subscriptions.has(uid),
  }
}
