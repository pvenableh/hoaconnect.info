/**
 * useRealtimeSubscription - Reactive realtime data composable
 *
 * Provides a reactive wrapper around Directus realtime subscriptions
 * Returns reactive data that auto-updates when changes occur
 *
 * Usage:
 * const { data, isLoading, isConnected, error, refresh } = useRealtimeSubscription(
 *   'hoa_channel_messages',
 *   ['id', 'content', 'user_created.first_name'],
 *   { channel: { _eq: channelId } },
 *   '-date_created'
 * )
 */

import type { Schema } from "~~/types/directus";

type CollectionName = keyof Schema;

interface SubscriptionOptions<T> {
  /** Initial data before first fetch */
  initialData?: T[];
  /** Enable/disable the subscription */
  enabled?: boolean | Ref<boolean>;
  /** Callback when new item is created */
  onCreate?: (item: T) => void;
  /** Callback when item is updated */
  onUpdate?: (item: T) => void;
  /** Callback when item is deleted */
  onDelete?: (item: T) => void;
}

export const useRealtimeSubscription = <T = any>(
  collection: CollectionName | string,
  fields: string[],
  filter?: Record<string, any>,
  sort?: string | string[],
  options: SubscriptionOptions<T> = {}
) => {
  const { list } = useDirectusItems(collection);
  const { subscribe, isConnected, connect } = useDirectusRealtime();

  const data = ref<T[]>(options.initialData || []) as Ref<T[]>;
  const isLoading = ref(true);
  const error = ref<string | null>(null);
  const subscriptionKey = ref<string | null>(null);

  // Normalize sort to array
  const sortArray = sort
    ? Array.isArray(sort)
      ? sort
      : [sort]
    : ["-date_created"];

  // Fetch initial data
  const fetchData = async () => {
    isLoading.value = true;
    error.value = null;

    try {
      // Unwrap filter if it's reactive
      const rawFilter = filter ? toRaw(unref(filter)) : undefined;
      const result = await list({
        fields,
        filter: rawFilter,
        sort: sortArray,
        limit: -1,
      });

      data.value = (result as T[]) || [];
    } catch (err: any) {
      console.error(`[useRealtimeSubscription] Error fetching ${collection}:`, err);
      error.value = err.message || "Failed to fetch data";
    } finally {
      isLoading.value = false;
    }
  };

  // Set up realtime subscription
  const setupSubscription = async () => {
    try {
      // Ensure connection
      if (!isConnected.value) {
        await connect();
      }

      // Unwrap filter if it's reactive for subscription
      const rawFilter = filter ? toRaw(unref(filter)) : undefined;

      // Subscribe to collection changes
      const unsubscribe = await subscribe(
        collection,
        (event, eventData) => {
          switch (event) {
            case "create":
              // Add new item to the beginning (assuming newest first)
              data.value = [eventData as T, ...data.value];
              options.onCreate?.(eventData as T);
              break;

            case "update":
              // Update existing item
              const updateIndex = data.value.findIndex(
                (item: any) => item.id === eventData.id
              );
              if (updateIndex !== -1) {
                data.value = [
                  ...data.value.slice(0, updateIndex),
                  eventData as T,
                  ...data.value.slice(updateIndex + 1),
                ];
              }
              options.onUpdate?.(eventData as T);
              break;

            case "delete":
              // Remove deleted item
              data.value = data.value.filter(
                (item: any) => item.id !== eventData.id
              );
              options.onDelete?.(eventData as T);
              break;
          }
        },
        {
          filter: rawFilter,
          fields,
        }
      );

      // Set subscription key (rawFilter already defined above)
      subscriptionKey.value = `${collection}-${JSON.stringify({ filter: rawFilter, fields })}`;
    } catch (err: any) {
      console.error(
        `[useRealtimeSubscription] Error subscribing to ${collection}:`,
        err
      );
      // Don't set error - realtime is optional enhancement
    }
  };

  // Check if subscription should be enabled
  const isEnabled = computed(() => {
    if (options.enabled === undefined) return true;
    return unref(options.enabled);
  });

  // Initialize
  const initialize = async () => {
    if (!isEnabled.value) return;

    await fetchData();

    // Only set up realtime subscription on client
    if (import.meta.client) {
      await setupSubscription();
    }
  };

  // Refresh data (manual refetch)
  const refresh = async () => {
    await fetchData();
  };

  // Watch for enabled changes
  watch(
    isEnabled,
    async (enabled) => {
      if (enabled) {
        await initialize();
      }
    },
    { immediate: true }
  );

  // Watch for filter changes - use toRaw to unwrap reactive objects
  watch(
    () => {
      const rawFilter = filter ? toRaw(unref(filter)) : {};
      return JSON.stringify(rawFilter);
    },
    async () => {
      if (isEnabled.value) {
        await fetchData();
      }
    }
  );

  return {
    data: readonly(data),
    isLoading: readonly(isLoading),
    isConnected,
    error: readonly(error),
    refresh,
  };
};

/**
 * useRealtimeItem - Subscribe to a single item
 */
export const useRealtimeItem = <T = any>(
  collection: CollectionName | string,
  itemId: string | Ref<string>,
  fields: string[]
) => {
  const { get } = useDirectusItems(collection);
  const { subscribeToItem, isConnected, connect } = useDirectusRealtime();

  const data = ref<T | null>(null) as Ref<T | null>;
  const isLoading = ref(true);
  const error = ref<string | null>(null);

  const fetchItem = async () => {
    const id = unref(itemId);
    if (!id) return;

    isLoading.value = true;
    error.value = null;

    try {
      const result = await get(id, { fields });
      data.value = result as T;
    } catch (err: any) {
      console.error(
        `[useRealtimeItem] Error fetching ${collection}/${id}:`,
        err
      );
      error.value = err.message || "Failed to fetch item";
    } finally {
      isLoading.value = false;
    }
  };

  const setupSubscription = async () => {
    const id = unref(itemId);
    if (!id) return;

    try {
      if (!isConnected.value) {
        await connect();
      }

      await subscribeToItem(collection, id, (event, eventData) => {
        if (event === "update") {
          data.value = eventData as T;
        } else if (event === "delete") {
          data.value = null;
        }
      });
    } catch (err: any) {
      console.error(
        `[useRealtimeItem] Error subscribing to ${collection}/${id}:`,
        err
      );
    }
  };

  const initialize = async () => {
    await fetchItem();

    if (import.meta.client) {
      await setupSubscription();
    }
  };

  // Watch for itemId changes
  watch(
    () => unref(itemId),
    async (newId) => {
      if (newId) {
        await initialize();
      }
    },
    { immediate: true }
  );

  return {
    data: readonly(data),
    isLoading: readonly(isLoading),
    isConnected,
    error: readonly(error),
    refresh: fetchItem,
  };
};
