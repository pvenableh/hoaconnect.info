/**
 * useDirectusWebSocket - Enhanced WebSocket composable with reconnection
 *
 * ADAPTER (Parity Round 2, Phase 2a). Same public surface, but backed by
 * `useWebSocketManager()` rather than its own Directus SDK client, so it shares
 * the app's single socket. Reconnection, backoff and idle teardown now live in
 * the manager; the state refs below are the manager's.
 *
 * `disconnect()` releases only this instance's subscriptions — it cannot close a
 * socket other components are using.
 *
 * Usage (unchanged):
 * const { subscribe, unsubscribe, isConnected, connect, disconnect } = useDirectusWebSocket()
 */

interface SubscriptionOptions {
  collection: string
  query?: {
    fields?: string[]
    filter?: Record<string, any>
  }
  uid?: string
}

interface SubscriptionEvent<T = any> {
  type: "init" | "create" | "update" | "delete"
  data: T[]
}

type SubscriptionCallback<T = any> = (event: SubscriptionEvent<T>) => void

export function useDirectusWebSocket() {
  const manager = useWebSocketManager()
  const { loggedIn } = useUserSession()

  // Caller-facing uid → release fn, for subscriptions owned by this instance.
  const subscriptions = new Map<string, () => void>()

  async function connect() {
    if (!loggedIn.value) {
      throw new Error("Authentication required")
    }
    // The shared connection opens lazily on the first subscribe.
  }

  function disconnect() {
    for (const release of subscriptions.values()) {
      try {
        release()
      } catch {
        // Ignore
      }
    }
    subscriptions.clear()
  }

  async function subscribe<T = any>(
    options: SubscriptionOptions,
    callback: SubscriptionCallback<T>
  ): Promise<string> {
    if (!loggedIn.value) {
      throw new Error("Authentication required")
    }

    const uid = options.uid || `${options.collection}-${Date.now()}`
    if (subscriptions.has(uid)) return uid

    const rawQuery = options.query ? toRaw(unref(options.query)) : {}

    const { unsubscribe: release } = manager.subscribe(
      options.collection,
      {
        fields: rawQuery.fields || ["*"],
        filter: rawQuery.filter || null,
        sort: null,
      },
      (event, data) => {
        callback({
          type: event as SubscriptionEvent<T>["type"],
          data: (Array.isArray(data) ? data : [data]) as T[],
        })
      }
    )

    subscriptions.set(uid, release)
    return uid
  }

  function unsubscribe(uid: string) {
    const release = subscriptions.get(uid)
    if (!release) return
    release()
    subscriptions.delete(uid)
  }

  async function subscribeToItem<T = any>(
    collection: string,
    itemId: string,
    callback: SubscriptionCallback<T>
  ): Promise<string> {
    return subscribe<T>(
      {
        collection,
        query: { filter: { id: { _eq: itemId } } },
        uid: `${collection}-${itemId}`,
      },
      callback
    )
  }

  function getSubscriptionCount(): number {
    return subscriptions.size
  }

  function isSubscribed(uid: string): boolean {
    return subscriptions.has(uid)
  }

  if (getCurrentScope()) onScopeDispose(() => disconnect())

  return {
    // State (shared — there is one connection now)
    isConnected: manager.isConnected,
    isConnecting: manager.isConnecting,
    connectionError: manager.connectionError,
    reconnectAttempts: manager.reconnectAttempts,

    // Connection
    connect,
    disconnect,

    // Subscriptions
    subscribe,
    unsubscribe,
    subscribeToItem,
    getSubscriptionCount,
    isSubscribed,
  }
}
