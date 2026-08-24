/**
 * useRealtimeSubscription - Reactive realtime data composable
 *
 * Fetches the baseline over REST, then keeps it live off the shared WebSocket.
 *
 * ADAPTER (Parity Round 2, Phase 2a). Public surface unchanged; it now talks to
 * `useWebSocketManager()` directly instead of building its own connection via
 * `useDirectusRealtime()`. Two consequences worth knowing:
 *
 * - Identical collection+fields+filter+sort across components share ONE
 *   server-side subscription (the manager deduplicates), so mounting the same
 *   thread twice no longer doubles the server's work.
 * - A changing filter now RELEASES the previous subscription before opening the
 *   next one. Pre-adapter, switching channels left the old subscription live for
 *   the lifetime of the connection — the leak that made a long session
 *   accumulate subscriptions it no longer read.
 *
 * Usage (unchanged):
 * const { data, isLoading, isConnected, error, refresh } = useRealtimeSubscription(
 *   'hoa_channel_messages',
 *   ['id', 'content', 'user_created.first_name'],
 *   { channel: { _eq: channelId } },
 *   '-date_created'
 * )
 */

import type { Schema } from "#core/types/directus";

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
  const manager = useWebSocketManager();

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

  // Handle on the live subscription, so a filter change (or unmount) can drop
  // it rather than stacking a second one on top.
  let release: (() => void) | null = null;

  const releaseSubscription = () => {
    if (!release) return;
    try {
      release();
    } catch {
      // Ignore
    }
    release = null;
    subscriptionKey.value = null;
  };

  // Fetch initial data
  const fetchData = async () => {
    const rawFilter = filter ? toRaw(unref(filter)) : undefined;

    // Debug logging
    if (import.meta.dev) {
      console.log(`[useRealtimeSubscription] Fetching ${collection}`, {
        filter: rawFilter,
        fields,
        isClient: import.meta.client,
      });
    }

    isLoading.value = true;
    error.value = null;

    try {
      const result = await list({
        fields,
        filter: rawFilter,
        sort: sortArray,
        limit: -1,
      });

      data.value = (result as T[]) || [];

      if (import.meta.dev) {
        console.log(`[useRealtimeSubscription] Fetched ${collection}:`, {
          count: data.value.length,
          isClient: import.meta.client,
        });
      }
    } catch (err: any) {
      console.error(`[useRealtimeSubscription] Error fetching ${collection}:`, err);
      error.value = err.message || "Failed to fetch data";
    } finally {
      isLoading.value = false;
    }
  };

  const applyEvent = (event: string, item: T) => {
    switch (event) {
      case "create": {
        // Skip anything the REST baseline already carries, so a create that
        // races the initial fetch cannot render twice.
        const exists = data.value.some(
          (existing: any) => existing?.id != null && existing.id === (item as any)?.id
        );
        if (!exists) {
          // Newest-first lists prepend; ascending lists append.
          data.value = sortArray[0]?.startsWith("-")
            ? [item, ...data.value]
            : [...data.value, item];
        }
        options.onCreate?.(item);
        break;
      }

      case "update": {
        const updateIndex = data.value.findIndex(
          (existing: any) => existing.id === (item as any).id
        );
        if (updateIndex !== -1) {
          data.value = [
            ...data.value.slice(0, updateIndex),
            item,
            ...data.value.slice(updateIndex + 1),
          ];
        }
        options.onUpdate?.(item);
        break;
      }

      case "delete": {
        data.value = data.value.filter(
          (existing: any) => existing.id !== (item as any).id
        );
        options.onDelete?.(item);
        break;
      }
    }
  };

  // Set up realtime subscription on the shared connection
  const setupSubscription = () => {
    // Any previous subscription belongs to a stale filter — drop it first.
    releaseSubscription();

    try {
      const rawFilter = filter ? toRaw(unref(filter)) : undefined;

      const sub = manager.subscribe(
        collection as string,
        { fields, filter: rawFilter || null, sort: sortArray },
        (event, items) => {
          // `init` is the subscription's own baseline; we already fetched ours
          // over REST with the same filter, so it is ignored.
          if (event === "init") return;
          for (const item of items || []) {
            if (item == null) continue;
            applyEvent(event, item as T);
          }
        }
      );

      release = sub.unsubscribe;
      subscriptionKey.value = sub.uid;
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
      setupSubscription();
    }
  };

  // Refresh data (manual refetch)
  const refresh = async () => {
    await fetchData();
  };

  // Watch for enabled changes and filter changes together
  watch(
    [
      isEnabled,
      () => {
        const rawFilter = filter ? toRaw(unref(filter)) : {};
        return JSON.stringify(rawFilter);
      },
    ],
    async ([enabled]) => {
      if (enabled) {
        await initialize();
      } else {
        releaseSubscription();
      }
    },
    { immediate: true }
  );

  // Ensure client-side fetch after hydration if data is missing
  // This handles cases where SSR fetch failed or didn't complete
  if (import.meta.client) {
    onMounted(() => {
      // If still loading or error occurred during SSR, retry fetch
      if (isEnabled.value && (isLoading.value || error.value)) {
        fetchData();
      }
    });
  }

  // Hand the shared subscription back when this scope ends.
  if (getCurrentScope()) onScopeDispose(releaseSubscription);

  return {
    data: readonly(data),
    isLoading: readonly(isLoading),
    isConnected: manager.isConnected,
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
  const manager = useWebSocketManager();

  const data = ref<T | null>(null) as Ref<T | null>;
  const isLoading = ref(true);
  const error = ref<string | null>(null);

  let release: (() => void) | null = null;

  const releaseSubscription = () => {
    if (!release) return;
    try {
      release();
    } catch {
      // Ignore
    }
    release = null;
  };

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

  const setupSubscription = () => {
    // The previous subscription tracked the previous id.
    releaseSubscription();

    const id = unref(itemId);
    if (!id) return;

    try {
      const sub = manager.subscribe(
        collection as string,
        { fields, filter: { id: { _eq: id } }, sort: null },
        (event, items) => {
          if (event === "init") return;
          const item = (items || [])[0];
          if (event === "update" && item) data.value = item as T;
          else if (event === "delete") data.value = null;
        }
      );
      release = sub.unsubscribe;
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
      setupSubscription();
    }
  };

  // Watch for itemId changes
  watch(
    () => unref(itemId),
    async (newId) => {
      if (newId) {
        await initialize();
      } else {
        releaseSubscription();
      }
    },
    { immediate: true }
  );

  if (getCurrentScope()) onScopeDispose(releaseSubscription);

  return {
    data: readonly(data),
    isLoading: readonly(isLoading),
    isConnected: manager.isConnected,
    error: readonly(error),
    refresh: fetchItem,
  };
};
