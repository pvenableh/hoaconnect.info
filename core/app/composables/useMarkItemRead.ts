/**
 * useMarkItemRead — opening the thing marks the notification about it read.
 *
 * Drop one line into a detail page's setup:
 *
 *   useMarkItemRead("hoa_requests", () => requestId.value);
 *
 * and every unread bell row pointing at that item is archived when the page
 * mounts (and again whenever the id changes, so a route param swap inside the
 * same component still counts as opening something new).
 *
 * This is the behaviour that makes durable read state feel right rather than
 * pedantic. A badge that survives you reading the thing it is about is worse
 * than no badge — and because "read" is now `status: "archived"` on the row
 * instead of a localStorage entry, clearing it here clears it on the member's
 * phone too. The badges follow for free: dock counts and the bell are computed
 * off the same live list.
 *
 * Client-only, best-effort, and never blocking — the page renders whether or not
 * the write lands.
 */

import { unref, type MaybeRefOrGetter } from "vue";

export function useMarkItemRead(
  collection: string,
  itemId: MaybeRefOrGetter<string | null | undefined>,
  options: { enabled?: MaybeRefOrGetter<boolean> } = {}
) {
  const { markItemRead } = useDirectusNotifications();

  const resolve = (value: MaybeRefOrGetter<unknown>) =>
    typeof value === "function" ? (value as () => unknown)() : unref(value as never);

  /** Ids handled this session, so a re-render can't re-issue the same write. */
  const handled = new Set<string>();

  async function run() {
    if (!import.meta.client) return;
    if (options.enabled !== undefined && !resolve(options.enabled)) return;

    const id = String(resolve(itemId) ?? "").trim();
    if (!id || !collection) return;

    const key = `${collection}:${id}`;
    if (handled.has(key)) return;
    handled.add(key);

    try {
      await markItemRead(collection, id);
    } catch (e) {
      // The member can still clear it from the bell — not worth surfacing.
      console.debug("[markItemRead] no rows cleared for", key, e);
    }
  }

  onMounted(run);

  watch(
    () => resolve(itemId),
    (next, prev) => {
      if (next && next !== prev) void run();
    }
  );

  return { markRead: run };
}
