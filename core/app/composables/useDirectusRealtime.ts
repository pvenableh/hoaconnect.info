/**
 * useDirectusRealtime - WebSocket subscriptions composable
 *
 * ADAPTER (Parity Round 2, Phase 2a). The public surface below is unchanged, but
 * the implementation is now a thin shim over `useWebSocketManager()` — every
 * caller in the app multiplexes over ONE shared socket instead of building its
 * own Directus SDK client per composable instance.
 *
 * Two behaviours necessarily changed with the shared connection:
 *
 * - `connect()` no longer opens a socket eagerly. The manager connects lazily on
 *   the first `subscribe()` and keeps the socket alive for 30s after the last
 *   subscriber leaves. `connect()` still rejects when logged out, so callers
 *   that guard on it behave the same.
 * - `disconnect()` releases only THIS instance's subscriptions; it cannot close
 *   a socket other components are using. The manager tears down on its own once
 *   nothing is subscribed (or immediately on logout).
 *
 * Usage (unchanged):
 * const { subscribe, unsubscribe, isConnected } = useDirectusRealtime()
 */

interface SubscriptionCallback {
  (event: "create" | "update" | "delete", data: any): void
}

interface RealtimeSubscribeOptions {
  filter?: Record<string, any>
  fields?: string[]
}

export const useDirectusRealtime = () => {
  const manager = useWebSocketManager()
  const { loggedIn } = useUserSession()

  // Subscriptions owned by THIS composable instance, keyed the same way the
  // pre-adapter implementation keyed them so `unsubscribe(key)` still works.
  const owned = new Map<string, () => void>()

  const connect = async () => {
    if (!loggedIn.value) {
      throw new Error("Authentication required for realtime subscriptions")
    }
    // The shared connection is opened lazily by the manager on first subscribe.
  }

  /** Release every subscription this instance owns. Never closes the shared socket. */
  const disconnect = async () => {
    for (const release of owned.values()) {
      try {
        release()
      } catch {
        // Ignore
      }
    }
    owned.clear()
  }

  const unsubscribe = async (key: string) => {
    const release = owned.get(key)
    if (!release) {
      console.warn(`No subscription found for ${key}`)
      return
    }
    release()
    owned.delete(key)
  }

  const subscribe = async (
    collection: string,
    callback: SubscriptionCallback,
    options?: RealtimeSubscribeOptions
  ) => {
    if (!loggedIn.value) {
      throw new Error("Authentication required for realtime subscriptions")
    }

    // toRaw/unref so a reactive filter stringifies to a stable key.
    const rawOptions = options ? toRaw(unref(options)) : {}
    const key = `${collection}-${JSON.stringify(rawOptions)}`

    if (owned.has(key)) {
      console.warn(`Already subscribed to ${collection}`)
      return () => unsubscribe(key)
    }

    const { unsubscribe: release } = manager.subscribe(
      collection,
      {
        fields: rawOptions.fields || ["*"],
        filter: rawOptions.filter || null,
        sort: null,
      },
      (event, data) => {
        // `init` is the subscription's initial payload; callers of this
        // composable fetch their baseline over REST, so it is skipped (matching
        // the pre-adapter behaviour).
        if (event === "init") return
        const items = Array.isArray(data) ? data : [data]
        for (const item of items) {
          if (item == null) continue
          callback(event as "create" | "update" | "delete", item)
        }
      }
    )

    owned.set(key, release)
    return () => unsubscribe(key)
  }

  const subscribeToItem = async (
    collection: string,
    itemId: string,
    callback: SubscriptionCallback
  ) => {
    return subscribe(collection, callback, {
      filter: { id: { _eq: itemId } },
    })
  }

  const getSubscriptionCount = () => owned.size
  const isSubscribed = (key: string) => owned.has(key)

  // Auto-cleanup: drop this instance's subscriptions when its scope ends.
  if (getCurrentScope()) onScopeDispose(() => void disconnect())

  return {
    // State (shared across every instance — there is one connection now)
    isConnected: manager.isConnected,
    isConnecting: manager.isConnecting,
    connectionError: manager.connectionError,
    reconnectAttempts: manager.reconnectAttempts,

    // Connection
    connect,
    disconnect,

    // Subscriptions
    subscribe,
    subscribeToItem,
    unsubscribe,
    getSubscriptionCount,
    isSubscribed,
  }
}
