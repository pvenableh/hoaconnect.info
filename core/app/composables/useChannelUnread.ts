/**
 * Channel unread state — one number, shared by the roster badges, the thread's
 * "New" divider, the dock, and the OS app badge.
 *
 * Adapted from Earnest's `useChannelUnread`, with the same two structural
 * choices and one addition.
 *
 * The `useState` singleton is why every surface agrees. `last_read_at` has
 * existed on `hoa_channel_members` since channels shipped and was never written
 * to; the counts it now feeds are computed server-side (`/api/hoa/channels/
 * unread`) precisely so that "unread" is one definition living in one place
 * rather than a per-component guess.
 *
 * The in-flight guard is why opening the app costs one request instead of six.
 * The roster, the thread, the panel, the dock and the badge tracker all call
 * `refresh()` on mount; without collapsing them, Earnest measured four
 * concurrent fetches of the same endpoint on a single page load.
 *
 * The addition is realtime. Earnest polls this every 45s; here it rides the
 * Phase 2a WebSocket manager, so a message arriving in another channel updates
 * the badge within a debounce window rather than within a poll window, and it
 * does so on the socket the bell and the open thread are already using — no
 * second connection, no second token fetch. The subscription is module-level so
 * mounting five consumers still watches once.
 */

export interface ChannelUnread {
  count: number;
  lastReadAt: string | null;
}

interface UnreadState {
  channels: Record<string, ChannelUnread>;
  total: number;
}

/** Collapse the ~6 mount-time callers into one request. */
let _inflight: Promise<void> | null = null;
/** The single realtime watcher, and how many composables still want it. */
let _release: (() => void) | null = null;
let _watchers = 0;
let _debounce: ReturnType<typeof setTimeout> | null = null;

const REFRESH_DEBOUNCE_MS = 600;

export function useChannelUnread() {
  const state = useState<UnreadState>("channel-unread", () => ({ channels: {}, total: 0 }));

  async function refresh(): Promise<void> {
    if (_inflight) return _inflight;
    _inflight = (async () => {
      try {
        const data = await $fetch<UnreadState>("/api/hoa/channels/unread");
        state.value = { channels: data?.channels || {}, total: data?.total || 0 };
      } catch {
        // Non-fatal: badges keep their last known values rather than blanking.
      } finally {
        _inflight = null;
      }
    })();
    return _inflight;
  }

  /** Coalesce a burst of realtime events into one refresh. */
  function scheduleRefresh() {
    if (_debounce) clearTimeout(_debounce);
    _debounce = setTimeout(() => {
      _debounce = null;
      void refresh();
    }, REFRESH_DEBOUNCE_MS);
  }

  /**
   * Advance the cursor for a channel and zero its badge optimistically. The
   * optimism matters: the server round-trip is what makes the read durable and
   * cross-device, but the badge should clear the instant you open the channel,
   * not a request later.
   */
  async function markRead(channelId?: string | null, at?: string | null): Promise<void> {
    if (!channelId) return;
    const existing = state.value.channels[channelId];
    const stamp = at || new Date().toISOString();
    if (existing?.count) {
      state.value = {
        channels: { ...state.value.channels, [channelId]: { count: 0, lastReadAt: stamp } },
        total: Math.max(0, state.value.total - existing.count),
      };
    } else {
      state.value = {
        channels: { ...state.value.channels, [channelId]: { count: 0, lastReadAt: stamp } },
        total: state.value.total,
      };
    }
    try {
      await $fetch(`/api/hoa/channels/${channelId}/read`, {
        method: "POST",
        body: { last_read_at: stamp },
      });
    } catch {
      // Non-fatal — the next refresh reconciles against the server's cursor.
    }
  }

  /**
   * Keep the counts live for as long as the calling scope exists. Safe to call
   * from several components: the underlying subscription is shared and only
   * released when the last caller goes away.
   */
  function watchLive() {
    if (!import.meta.client) return;

    _watchers += 1;
    if (!_release) {
      try {
        const manager = useWebSocketManager();
        const sub = manager.subscribe(
          "hoa_channel_messages",
          // Deliberately unfiltered: this watches for activity ANYWHERE the
          // caller can see, which is the whole point of a roster badge. The
          // socket carries the user's own token, so Directus already limits the
          // events to channels they may read.
          { fields: ["id", "channel", "date_created"], filter: null, sort: null },
          (eventName) => {
            if (eventName === "init") return;
            scheduleRefresh();
          }
        );
        _release = sub.unsubscribe;
      } catch {
        // Realtime is an enhancement; the mount-time refresh still stands.
        _release = null;
      }
    }

    if (getCurrentScope()) {
      onScopeDispose(() => {
        _watchers = Math.max(0, _watchers - 1);
        if (_watchers === 0 && _release) {
          try {
            _release();
          } catch {
            // Ignore
          }
          _release = null;
          if (_debounce) {
            clearTimeout(_debounce);
            _debounce = null;
          }
        }
      });
    }
  }

  const countFor = (channelId?: string | null): number =>
    channelId ? state.value.channels[channelId]?.count || 0 : 0;

  const lastReadAtFor = (channelId?: string | null): string | null =>
    channelId ? state.value.channels[channelId]?.lastReadAt || null : null;

  const total = computed(() => state.value.total);

  return { state, refresh, markRead, watchLive, countFor, lastReadAtFor, total };
}
