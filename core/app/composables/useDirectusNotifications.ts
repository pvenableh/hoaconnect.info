/**
 * useDirectusNotifications — the bell store.
 *
 * Phase 2c of the Earnest parity round. This file used to be a 339-line CRUD
 * wrapper around `/api/directus/notifications` with zero importers, sitting next
 * to a 1061-line client-side aggregator that was doing the bell's actual work by
 * scanning ten collections on every open and keeping read state in
 * localStorage. The server, meanwhile, had been writing `directus_notifications`
 * rows since the push work — rows nothing ever read.
 *
 * The two halves are now one. The rows are the bell, and this is the store over
 * them:
 *
 * - **Module singleton.** One list, one subscription, one in-flight fetch, no
 *   matter how many components call this. `Bell`, `Sheet`, `Toast`, the dock
 *   badge and every `useUnreadByCategory()` consumer share it.
 * - **Live over the Phase 2a WS manager.** No polling, and — the point of 2a —
 *   no second socket: the bell multiplexes onto the same connection channels
 *   uses. The aggregator polled; that is what this replaces.
 * - **Read = `status: "archived"`.** Durable and cross-device, which localStorage
 *   never was. Directus already models inbox/archived, so a second "read" notion
 *   would be one more thing to keep in sync.
 * - **Archived pagination** is separate from the live list: the inbox is small
 *   and always resident; history is paged in on demand.
 *
 * Throttling matters more here than it looks. Every surface that mounts wants
 * the list, and a login lands several at once, so `refresh()` coalesces
 * concurrent callers onto one request and rate-limits the rest — the same
 * login-burst guard Earnest's `useNotifications` grew for the same reason.
 */

import {
  mergeRow,
  sortRows,
  toBellNotification,
  unreadByType,
  type BellNotification,
  type BellRow,
} from "#core/shared/notifications/bell";

/** Fields the list needs. `sender` is expanded for the "from" line. */
const BELL_FIELDS = [
  "id",
  "timestamp",
  "status",
  "subject",
  "message",
  "collection",
  "item",
  "sender.id",
  "sender.first_name",
  "sender.last_name",
];

const ARCHIVED_PAGE_SIZE = 25;
/** Two refreshes inside this window collapse into one. */
const REFRESH_THROTTLE_MS = 5000;

// ── Module-level singleton state ─────────────────────────────────────────────
// Deliberately module scope, not useState: this is client-only (a socket and a
// user's own inbox), and SSR-serialising an unread list would only produce a
// hydration mismatch the moment the socket delivered its first row.

const _rows = ref<BellRow[]>([]);
const _loading = ref(false);
const _error = ref<string | null>(null);
const _archived = ref<BellRow[]>([]);
const _archivedLoading = ref(false);
const _archivedPage = ref(1);
const _archivedHasMore = ref(true);
const _connected = ref(false);

let _inflight: Promise<void> | null = null;
let _lastRefreshAt = 0;
let _subscribedFor: string | null = null;
let _release: (() => void) | null = null;
/** Rows seen by the live handler, so consumers can react to genuinely new ones. */
const _seenIds = new Set<string>();
/** Newest row that arrived over the socket since load — the toast's trigger. */
const _lastIncoming = ref<BellRow | null>(null);

async function request<T>(body: Record<string, unknown>): Promise<T> {
  return (await $fetch("/api/directus/notifications", { method: "POST", body })) as T;
}

export const useDirectusNotifications = () => {
  const { user, loggedIn } = useUserSession() as {
    user: Ref<{ id?: string } | null>;
    loggedIn: Ref<boolean>;
  };
  const manager = useWebSocketManager();

  const userId = computed(() => (loggedIn.value ? user.value?.id || null : null));

  const inboxFilter = () => ({
    _and: [{ recipient: { _eq: userId.value } }, { status: { _eq: "inbox" } }],
  });

  // ── Reading ────────────────────────────────────────────────────────────────

  /**
   * Reload the inbox. Concurrent callers share one request; a caller inside the
   * throttle window gets the current list rather than a second round trip.
   * `force` skips the throttle (used after a write, where the list is known
   * stale).
   */
  async function refresh(force = false): Promise<void> {
    if (!import.meta.client || !userId.value) return;
    if (_inflight) return _inflight;
    if (!force && Date.now() - _lastRefreshAt < REFRESH_THROTTLE_MS) return;

    _lastRefreshAt = Date.now();
    _loading.value = true;
    _error.value = null;

    _inflight = (async () => {
      try {
        const rows = await request<BellRow[]>({
          operation: "list",
          query: { filter: inboxFilter(), fields: BELL_FIELDS, sort: ["-timestamp"], limit: 100 },
        });
        _rows.value = sortRows(rows || []);
        // Everything present at load is baseline, not an arrival — otherwise
        // every reload would fire a toast per unread row.
        _seenIds.clear();
        for (const r of _rows.value) _seenIds.add(String(r.id));
      } catch (e: unknown) {
        _error.value = (e as Error)?.message || "Could not load notifications";
      } finally {
        _loading.value = false;
        _inflight = null;
      }
    })();

    return _inflight;
  }

  /**
   * Page through read history. Separate from the inbox on purpose: the inbox is
   * bounded by how much a member has ignored, history is unbounded.
   */
  async function fetchArchived(reset = false): Promise<void> {
    if (!import.meta.client || !userId.value) return;
    if (_archivedLoading.value) return;
    if (reset) {
      _archived.value = [];
      _archivedPage.value = 1;
      _archivedHasMore.value = true;
    }
    if (!_archivedHasMore.value) return;

    _archivedLoading.value = true;
    try {
      const rows = await request<BellRow[]>({
        operation: "list",
        query: {
          filter: {
            _and: [{ recipient: { _eq: userId.value } }, { status: { _eq: "archived" } }],
          },
          fields: BELL_FIELDS,
          sort: ["-timestamp"],
          limit: ARCHIVED_PAGE_SIZE,
          page: _archivedPage.value,
        },
      });
      const page = rows || [];
      _archived.value = reset ? page : [..._archived.value, ...page];
      // No meta on this proxy route, so a short page IS the end of the list.
      _archivedHasMore.value = page.length === ARCHIVED_PAGE_SIZE;
      _archivedPage.value += 1;
    } catch (e) {
      console.warn("[bell] could not load archived notifications", e);
    } finally {
      _archivedLoading.value = false;
    }
  }

  const loadMoreArchived = () => fetchArchived(false);

  // ── Writing ────────────────────────────────────────────────────────────────

  /**
   * Mark rows read. Optimistic: the row leaves the inbox immediately and the
   * server catches up, because a badge that lingers after a click reads as a
   * broken badge. A failure puts it back.
   */
  async function markAsRead(ids: string | string[]): Promise<void> {
    const list = (Array.isArray(ids) ? ids : [ids]).map(String).filter(Boolean);
    if (!list.length) return;

    const removed = _rows.value.filter((r) => list.includes(String(r.id)));
    if (!removed.length) return;
    _rows.value = _rows.value.filter((r) => !list.includes(String(r.id)));

    try {
      await Promise.all(
        list.map((id) =>
          request({ operation: "update", id, data: { status: "archived" } })
        )
      );
      // History now has rows it didn't when it was paged in.
      _archivedPage.value = 1;
      _archivedHasMore.value = true;
      _archived.value = [];
    } catch (e) {
      console.warn("[bell] could not mark read; restoring", e);
      _rows.value = sortRows([..._rows.value, ...removed]);
    }
  }

  /** Mark everything currently in the inbox read. */
  async function markAllAsRead(): Promise<void> {
    await markAsRead(_rows.value.map((r) => String(r.id)));
  }

  /** Put a row back in the inbox. */
  async function markAsUnread(id: string): Promise<void> {
    await request({ operation: "update", id, data: { status: "inbox" } });
    await refresh(true);
  }

  /**
   * Archive every unread row for one (collection, item) — what a detail page
   * calls when the member opens the thing they were notified about. Returns how
   * many it marked.
   */
  async function markItemRead(collection: string, item: string): Promise<number> {
    if (!import.meta.client || !userId.value || !collection || !item) return 0;
    // Prefer the rows we already hold: the common case needs no network at all.
    const local = _rows.value
      .filter((r) => r.collection === collection && String(r.item) === String(item))
      .map((r) => String(r.id));
    if (local.length) {
      await markAsRead(local);
      return local.length;
    }
    // Not in the resident list (older than the 100 we hold) — ask the server.
    try {
      const rows = await request<Array<{ id: string }>>({
        operation: "list",
        query: {
          filter: {
            _and: [
              { recipient: { _eq: userId.value } },
              { status: { _eq: "inbox" } },
              { collection: { _eq: collection } },
              { item: { _eq: item } },
            ],
          },
          fields: ["id"],
          limit: 50,
        },
      });
      const ids = (rows || []).map((r) => String(r.id)).filter(Boolean);
      if (!ids.length) return 0;
      await Promise.all(
        ids.map((id) => request({ operation: "update", id, data: { status: "archived" } }))
      );
      return ids.length;
    } catch (e) {
      console.warn("[bell] could not mark item read", e);
      return 0;
    }
  }

  // ── Live ───────────────────────────────────────────────────────────────────

  /**
   * Subscribe to this user's inbox on the SHARED socket.
   *
   * Filtered server-side by recipient, so a member only ever receives their own
   * rows. Directus sends deletes as bare KEYS rather than objects — the same
   * trap Phase 2a fixed in `useRealtimeSubscription` — so the delete branch maps
   * over ids, not over `.id`.
   *
   * An archive is delivered as an `update`, and the filter means the row no
   * longer matches; Directus still sends it, so we drop archived rows from the
   * inbox here rather than trusting the filter to stop them.
   */
  function ensureSubscribed() {
    if (!import.meta.client) return;
    const uid = userId.value;
    if (!uid) return;
    if (_subscribedFor === uid && _release) return;

    _release?.();
    _release = null;

    const sub = manager.subscribe(
      "directus_notifications",
      {
        fields: BELL_FIELDS,
        filter: { recipient: { _eq: uid } },
        sort: ["-timestamp"],
      },
      (event, data) => {
        if (event === "delete") {
          const gone = new Set((data || []).map((d) => String(d)));
          _rows.value = _rows.value.filter((r) => !gone.has(String(r.id)));
          return;
        }
        for (const raw of (data || []) as BellRow[]) {
          if (!raw?.id) continue;
          const id = String(raw.id);
          if (raw.status === "archived") {
            // Read somewhere else — another tab, another device, or a detail
            // page. This is the cross-device read state the aggregator's
            // localStorage could never deliver.
            _rows.value = _rows.value.filter((r) => String(r.id) !== id);
            continue;
          }
          const isNew = !_seenIds.has(id);
          _seenIds.add(id);
          _rows.value = mergeRow(_rows.value, raw);
          if (isNew && event === "create") _lastIncoming.value = raw;
        }
      }
    );

    _subscribedFor = uid;
    _release = () => {
      sub.unsubscribe();
      if (_subscribedFor === uid) _subscribedFor = null;
    };
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────
  //
  // Bound to the USER, not to a component: the store outlives any one surface,
  // and tying teardown to whichever component happened to mount first is how the
  // old aggregator ended up with instance-tracking flags. Logout clears both the
  // list and the subscription so the next session starts empty.

  if (import.meta.client) {
    watch(
      userId,
      (id) => {
        if (!id) {
          _release?.();
          _release = null;
          _subscribedFor = null;
          _rows.value = [];
          _archived.value = [];
          _seenIds.clear();
          _lastIncoming.value = null;
          return;
        }
        ensureSubscribed();
        void refresh(true);
      },
      { immediate: true }
    );

    watch(
      () => manager.isConnected.value,
      (connected) => {
        _connected.value = connected;
        // A reconnect means we were blind for a while; the inbox may have moved.
        if (connected) void refresh();
      },
      { immediate: true }
    );
  }

  // ── Derived ────────────────────────────────────────────────────────────────

  const notifications = computed<BellNotification[]>(() =>
    _rows.value.map(toBellNotification)
  );
  const unreadCount = computed(() => _rows.value.length);
  const countsByType = computed(() => unreadByType(_rows.value));
  const archivedNotifications = computed<BellNotification[]>(() =>
    _archived.value.map(toBellNotification)
  );

  return {
    // State
    rows: readonly(_rows) as Readonly<Ref<BellRow[]>>,
    notifications,
    archivedNotifications,
    unreadCount,
    countsByType,
    isLoading: readonly(_loading),
    isLoadingArchived: readonly(_archivedLoading),
    archivedHasMore: readonly(_archivedHasMore),
    error: readonly(_error),
    isConnected: readonly(_connected),
    /** Newest row delivered over the socket, for surfaces that announce arrivals. */
    lastIncoming: readonly(_lastIncoming),

    // Actions
    refresh,
    fetchArchived,
    loadMoreArchived,
    markAsRead,
    markAllAsRead,
    markAsUnread,
    markItemRead,
  };
};
