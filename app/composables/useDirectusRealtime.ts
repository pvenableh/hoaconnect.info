/**
 * useDirectusRealtime - WebSocket subscriptions composable
 *
 * Handles realtime subscriptions to Directus collections
 * Uses Directus WebSocket API for live updates
 *
 * Usage:
 * const { subscribe, unsubscribe, isConnected } = useDirectusRealtime()
 */

import { createDirectus, realtime, rest, authentication } from "@directus/sdk";
import type { Schema } from "~~/types/directus";

interface SubscriptionCallback {
  (event: "create" | "update" | "delete", data: any): void;
}

export const useDirectusRealtime = () => {
  const config = useRuntimeConfig();
  const { user, loggedIn } = useUserSession();

  const isConnected = ref(false);
  const client = ref<any>(null);
  const subscriptions = ref<Map<string, any>>(new Map());

  /**
   * Initialize WebSocket connection
   */
  const connect = async () => {
    if (!loggedIn.value) {
      throw new Error("Authentication required for realtime subscriptions");
    }

    if (client.value) {
      console.warn("WebSocket already connected");
      return;
    }

    try {
      // Get the access token from session
      const { data: session } = await useFetch("/api/auth/session");

      const accessToken = session.value?.secure?.directusAccessToken;
      if (!accessToken) {
        throw new Error("No access token available");
      }

      // Create WebSocket client
      const wsUrl =
        config.public.directus.websocketUrl ||
        config.public.directus.url.replace("http", "ws");

      client.value = createDirectus<Schema>(wsUrl)
        .with(realtime())
        .with(rest())
        .with(authentication("json"));

      // Set the token
      await client.value.setToken(accessToken);

      // Connect to WebSocket
      await client.value.connect();

      isConnected.value = true;
      console.log("✅ WebSocket connected");
    } catch (error: any) {
      console.error("WebSocket connection error:", error);
      isConnected.value = false;
      throw error;
    }
  };

  /**
   * Disconnect WebSocket
   */
  const disconnect = async () => {
    if (!client.value) return;

    try {
      // Unsubscribe from all active subscriptions
      for (const [key, subscription] of subscriptions.value) {
        await subscription.unsubscribe();
      }

      subscriptions.value.clear();

      // Disconnect client
      await client.value.disconnect();
      client.value = null;
      isConnected.value = false;

      console.log("✅ WebSocket disconnected");
    } catch (error: any) {
      console.error("WebSocket disconnect error:", error);
    }
  };

  /**
   * Subscribe to collection changes
   */
  const subscribe = async (
    collection: string,
    callback: SubscriptionCallback,
    options?: {
      filter?: Record<string, any>;
      fields?: string[];
    }
  ) => {
    if (!isConnected.value) {
      await connect();
    }

    try {
      // Use toRaw to unwrap reactive objects before stringifying
      const rawOptions = options ? toRaw(unref(options)) : {};
      const key = `${collection}-${JSON.stringify(rawOptions)}`;

      // Check if already subscribed
      if (subscriptions.value.has(key)) {
        console.warn(`Already subscribed to ${collection}`);
        return;
      }

      // Create subscription
      const subscription = await client.value.subscribe(collection, {
        event: "init",
        query: options || {},
      });

      // Handle events
      subscription.on("create", (data: any) => {
        callback("create", data);
      });

      subscription.on("update", (data: any) => {
        callback("update", data);
      });

      subscription.on("delete", (data: any) => {
        callback("delete", data);
      });

      // Store subscription
      subscriptions.value.set(key, subscription);

      console.log(`✅ Subscribed to ${collection}`);

      return () => unsubscribe(key);
    } catch (error: any) {
      console.error("Subscription error:", error);
      throw error;
    }
  };

  /**
   * Unsubscribe from a specific subscription
   */
  const unsubscribe = async (key: string) => {
    const subscription = subscriptions.value.get(key);

    if (!subscription) {
      console.warn(`No subscription found for ${key}`);
      return;
    }

    try {
      await subscription.unsubscribe();
      subscriptions.value.delete(key);

      console.log(`✅ Unsubscribed from ${key}`);
    } catch (error: any) {
      console.error("Unsubscribe error:", error);
    }
  };

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
    });
  };

  /**
   * Auto-cleanup on unmount
   */
  onUnmounted(() => {
    disconnect();
  });

  return {
    isConnected: readonly(isConnected),
    connect,
    disconnect,
    subscribe,
    subscribeToItem,
    unsubscribe,
  };
};

/**
 * Example Usage:
 *
 * <script setup>
 * const { subscribe, isConnected } = useDirectusRealtime()
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
