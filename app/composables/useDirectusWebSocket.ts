/**
 * useDirectusWebSocket - Enhanced WebSocket composable with reconnection
 *
 * Handles realtime subscriptions to Directus collections with:
 * - Automatic reconnection with exponential backoff
 * - Connection state management
 * - Token refresh before connection
 *
 * Usage:
 * const { subscribe, unsubscribe, isConnected, connect, disconnect } = useDirectusWebSocket()
 */

import { createDirectus, realtime, rest, authentication } from "@directus/sdk"
import type { Schema } from "~~/types/directus"

interface SubscriptionOptions {
  collection: string
  query?: {
    fields?: string[]
    filter?: Record<string, any>
  }
  uid?: string
}

interface SubscriptionEvent<T = any> {
  type: 'init' | 'create' | 'update' | 'delete'
  data: T[]
}

type SubscriptionCallback<T = any> = (event: SubscriptionEvent<T>) => void

export function useDirectusWebSocket() {
  const config = useRuntimeConfig()
  const { loggedIn } = useUserSession()

  // Connection state
  const isConnected = ref(false)
  const isConnecting = ref(false)
  const connectionError = ref<string | null>(null)
  const reconnectAttempts = ref(0)
  const maxReconnectAttempts = 10

  // Client and subscriptions
  let client: ReturnType<typeof createDirectus> | null = null
  const subscriptions = new Map<string, { unsubscribe: () => void }>()

  /**
   * Connect to WebSocket with authentication
   */
  async function connect() {
    if (isConnected.value || isConnecting.value) return

    if (!loggedIn.value) {
      connectionError.value = 'Authentication required'
      return
    }

    isConnecting.value = true
    connectionError.value = null

    try {
      // Get fresh token from server
      const { token } = await $fetch<{ token: string }>('/api/websocket/token')

      if (!token) {
        throw new Error('No access token available')
      }

      // Create WebSocket client
      const wsUrl =
        config.public.directus.websocketUrl ||
        config.public.directus.url.replace('http', 'ws')

      client = createDirectus<Schema>(wsUrl)
        .with(realtime())
        .with(rest())
        .with(authentication('json'))

      // Connect and authenticate
      await client.connect()
      await client.sendMessage({ type: 'auth', access_token: token })

      isConnected.value = true
      isConnecting.value = false
      reconnectAttempts.value = 0
      connectionError.value = null

      console.log('WebSocket connected')
    } catch (error: any) {
      isConnecting.value = false
      connectionError.value = error.message || 'Connection failed'
      console.error('WebSocket connection error:', error)
      scheduleReconnect()
    }
  }

  /**
   * Schedule reconnection with exponential backoff
   */
  function scheduleReconnect() {
    if (reconnectAttempts.value >= maxReconnectAttempts) {
      connectionError.value = 'Max reconnection attempts reached'
      return
    }

    const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.value), 30000)
    reconnectAttempts.value++

    console.log(`Reconnecting in ${delay}ms (attempt ${reconnectAttempts.value}/${maxReconnectAttempts})`)
    setTimeout(() => connect(), delay)
  }

  /**
   * Disconnect WebSocket
   */
  function disconnect() {
    // Unsubscribe from all
    subscriptions.forEach((sub, uid) => {
      try {
        sub.unsubscribe()
      } catch {
        // Ignore
      }
    })
    subscriptions.clear()

    // Disconnect client
    if (client) {
      try {
        client.disconnect()
      } catch {
        // Ignore
      }
      client = null
    }

    isConnected.value = false
    isConnecting.value = false
    console.log('WebSocket disconnected')
  }

  /**
   * Subscribe to collection changes
   */
  async function subscribe<T = any>(
    options: SubscriptionOptions,
    callback: SubscriptionCallback<T>
  ): Promise<string> {
    if (!isConnected.value) {
      await connect()
    }

    if (!client) {
      throw new Error('WebSocket not connected')
    }

    const uid = options.uid || `${options.collection}-${Date.now()}`

    try {
      const { subscription } = await client.subscribe(options.collection, {
        query: options.query,
        uid,
      })

      // Process subscription events in background
      ;(async () => {
        try {
          for await (const event of subscription) {
            callback(event as SubscriptionEvent<T>)
          }
        } catch (err) {
          console.log(`Subscription ${uid} ended`)
          subscriptions.delete(uid)
        }
      })()

      // Store unsubscribe function
      subscriptions.set(uid, {
        unsubscribe: () => {
          try {
            client?.sendMessage({ type: 'unsubscribe', uid })
          } catch {
            // Ignore
          }
        }
      })

      console.log(`Subscribed to ${options.collection} (${uid})`)
      return uid
    } catch (error: any) {
      console.error('Subscription error:', error)
      throw error
    }
  }

  /**
   * Unsubscribe from a specific subscription
   */
  function unsubscribe(uid: string) {
    const sub = subscriptions.get(uid)
    if (sub) {
      sub.unsubscribe()
      subscriptions.delete(uid)
      console.log(`Unsubscribed from ${uid}`)
    }
  }

  /**
   * Subscribe to a specific item
   */
  async function subscribeToItem<T = any>(
    collection: string,
    itemId: string,
    callback: SubscriptionCallback<T>
  ): Promise<string> {
    return subscribe<T>(
      {
        collection,
        query: {
          filter: { id: { _eq: itemId } }
        },
        uid: `${collection}-${itemId}`
      },
      callback
    )
  }

  /**
   * Get subscription count
   */
  function getSubscriptionCount(): number {
    return subscriptions.size
  }

  /**
   * Check if subscribed to a specific UID
   */
  function isSubscribed(uid: string): boolean {
    return subscriptions.has(uid)
  }

  // Auto-cleanup on unmount
  onUnmounted(() => disconnect())

  return {
    // State
    isConnected: readonly(isConnected),
    isConnecting: readonly(isConnecting),
    connectionError: readonly(connectionError),
    reconnectAttempts: readonly(reconnectAttempts),

    // Connection
    connect,
    disconnect,

    // Subscriptions
    subscribe,
    unsubscribe,
    subscribeToItem,
    getSubscriptionCount,
    isSubscribed
  }
}
