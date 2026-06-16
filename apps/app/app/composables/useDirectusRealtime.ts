/**
 * useDirectusRealtime - WebSocket subscriptions composable
 *
 * Handles realtime subscriptions to Directus collections
 * Uses Directus WebSocket API for live updates
 * Includes automatic reconnection with exponential backoff
 *
 * Usage:
 * const { subscribe, unsubscribe, isConnected } = useDirectusRealtime()
 */

import { createDirectus, realtime, rest, authentication } from "@directus/sdk"
import type { Schema } from "~~/types/directus"

interface SubscriptionCallback {
  (event: "create" | "update" | "delete", data: any): void
}

export const useDirectusRealtime = () => {
  const config = useRuntimeConfig()
  const { loggedIn } = useUserSession()

  // Connection state
  const isConnected = ref(false)
  const isConnecting = ref(false)
  const connectionError = ref<string | null>(null)
  const reconnectAttempts = ref(0)
  const maxReconnectAttempts = 10

  const client = ref<any>(null)
  const subscriptions = ref<Map<string, any>>(new Map())

  // Store pending subscriptions for reconnection
  const pendingSubscriptions = ref<Map<string, { collection: string; callback: SubscriptionCallback; options?: any }>>(new Map())

  /**
   * Schedule reconnection with exponential backoff
   */
  const scheduleReconnect = () => {
    if (reconnectAttempts.value >= maxReconnectAttempts) {
      connectionError.value = "Max reconnection attempts reached"
      return
    }

    const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.value), 30000)
    reconnectAttempts.value++

    console.log(`Reconnecting in ${delay}ms (attempt ${reconnectAttempts.value}/${maxReconnectAttempts})`)
    setTimeout(() => connect(), delay)
  }

  /**
   * Restore subscriptions after reconnection
   */
  const restoreSubscriptions = async () => {
    for (const [key, sub] of pendingSubscriptions.value) {
      try {
        await subscribe(sub.collection, sub.callback, sub.options)
      } catch (error) {
        console.error(`Failed to restore subscription ${key}:`, error)
      }
    }
  }

  /**
   * Initialize WebSocket connection
   */
  const connect = async () => {
    if (isConnecting.value) return
    if (isConnected.value && client.value) return

    if (!loggedIn.value) {
      connectionError.value = "Authentication required for realtime subscriptions"
      throw new Error("Authentication required for realtime subscriptions")
    }

    isConnecting.value = true
    connectionError.value = null

    try {
      // Get fresh token from server using the new endpoint
      const { token } = await $fetch<{ token: string }>('/api/websocket/token')

      if (!token) {
        throw new Error("No access token available")
      }

      // Create WebSocket client
      const wsUrl =
        config.public.directus.websocketUrl ||
        config.public.directus.url.replace("http", "ws")

      client.value = createDirectus<Schema>(wsUrl)
        .with(realtime())
        .with(rest())
        .with(authentication("json"))

      // Set the token
      await client.value.setToken(token)

      // Connect to WebSocket
      await client.value.connect()

      isConnected.value = true
      isConnecting.value = false
      reconnectAttempts.value = 0
      connectionError.value = null

      console.log("WebSocket connected")

      // Restore any pending subscriptions
      if (pendingSubscriptions.value.size > 0) {
        await restoreSubscriptions()
      }
    } catch (error: any) {
      console.error("WebSocket connection error:", error)
      isConnected.value = false
      isConnecting.value = false
      connectionError.value = error.message || "Connection failed"
      scheduleReconnect()
    }
  }

  /**
   * Disconnect WebSocket
   */
  const disconnect = async () => {
    if (!client.value) return

    try {
      // Unsubscribe from all active subscriptions
      for (const [key, sub] of subscriptions.value) {
        if (sub?.unsubscribe) {
          sub.unsubscribe()
        }
      }

      subscriptions.value.clear()
      pendingSubscriptions.value.clear()

      // Disconnect client
      await client.value.disconnect()
      client.value = null
      isConnected.value = false
      isConnecting.value = false

      console.log("WebSocket disconnected")
    } catch (error: any) {
      console.error("WebSocket disconnect error:", error)
    }
  }

  /**
   * Subscribe to collection changes
   */
  const subscribe = async (
    collection: string,
    callback: SubscriptionCallback,
    options?: {
      filter?: Record<string, any>
      fields?: string[]
    }
  ) => {
    if (!isConnected.value) {
      await connect()
    }

    if (!client.value) {
      throw new Error("WebSocket not connected")
    }

    try {
      // Use toRaw to unwrap reactive objects before stringifying
      const rawOptions = options ? toRaw(unref(options)) : {}
      const key = `${collection}-${JSON.stringify(rawOptions)}`

      // Check if already subscribed
      if (subscriptions.value.has(key)) {
        console.warn(`Already subscribed to ${collection}`)
        return () => unsubscribe(key)
      }

      // Store for reconnection
      pendingSubscriptions.value.set(key, { collection, callback, options: rawOptions })

      // Create subscription - Directus SDK v20+ returns { subscription, unsubscribe }
      const { subscription, unsubscribe: unsub } = await client.value.subscribe(
        collection,
        {
          query: {
            ...rawOptions,
          },
        }
      )

      // Store the unsubscribe function
      subscriptions.value.set(key, { unsubscribe: unsub })

      // Start processing subscription events in background
      ;(async () => {
        try {
          for await (const message of subscription) {
            // Directus SDK v20+ sends messages with event and data properties
            if (message.event === "init") {
              // Initial data load - skip for now as we fetch data separately
              continue
            }

            const eventType = message.event as "create" | "update" | "delete"
            const data = message.data?.[0] || message.data

            if (eventType && data) {
              callback(eventType, data)
            }
          }
        } catch (err) {
          // Subscription ended or error occurred
          console.log(`Subscription to ${collection} ended`)
          subscriptions.value.delete(key)

          // Attempt reconnection if connection was lost
          if (!isConnected.value && pendingSubscriptions.value.has(key)) {
            scheduleReconnect()
          }
        }
      })()

      console.log(`Subscribed to ${collection}`)

      return () => unsubscribe(key)
    } catch (error: any) {
      console.error("Subscription error:", error)
      throw error
    }
  }

  /**
   * Unsubscribe from a specific subscription
   */
  const unsubscribe = async (key: string) => {
    const sub = subscriptions.value.get(key)

    if (!sub) {
      console.warn(`No subscription found for ${key}`)
      return
    }

    try {
      if (sub?.unsubscribe) {
        sub.unsubscribe()
      }
      subscriptions.value.delete(key)
      pendingSubscriptions.value.delete(key)

      console.log(`Unsubscribed from ${key}`)
    } catch (error: any) {
      console.error("Unsubscribe error:", error)
    }
  }

  /**
   * Subscribe to specific item changes
   */
  const subscribeToItem = async (
    collection: string,
    itemId: string,
    callback: SubscriptionCallback
  ) => {
    return subscribe(collection, callback, {
      filter: {
        id: { _eq: itemId },
      },
    })
  }

  /**
   * Get current subscription count
   */
  const getSubscriptionCount = () => subscriptions.value.size

  /**
   * Check if subscribed to a key
   */
  const isSubscribed = (key: string) => subscriptions.value.has(key)

  /**
   * Auto-cleanup on unmount
   */
  onUnmounted(() => {
    disconnect()
  })

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
    subscribeToItem,
    unsubscribe,
    getSubscriptionCount,
    isSubscribed,
  }
}

/**
 * Example Usage:
 *
 * <script setup>
 * const { subscribe, isConnected, connectionError } = useDirectusRealtime()
 *
 * onMounted(async () => {
 *   // Subscribe to members collection
 *   await subscribe('hoa_members', (event, data) => {
 *     if (event === 'create') {
 *       console.log('New member created:', data)
 *       // Refresh your data...
 *     }
 *     if (event === 'update') {
 *       console.log('Member updated:', data)
 *     }
 *     if (event === 'delete') {
 *       console.log('Member deleted:', data)
 *     }
 *   }, {
 *     filter: {
 *       status: { _eq: 'active' }
 *     }
 *   })
 * })
 * </script>
 */
