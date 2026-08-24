/**
 * useUnreadByCategory — badge numbers for the dock and the section rails,
 * computed off the bell's list rather than fetched.
 *
 * The point is that it costs nothing. The bell already holds every unread row
 * live over the shared socket, so a dock badge is a `computed` over that array —
 * no second query, no second subscription, and no way for the badge and the bell
 * to disagree about what "unread" means, which is exactly what happened while
 * read state lived in localStorage.
 *
 * Two vocabularies meet here. The bell groups by *type* (what kind of thing it
 * is: a meeting, a payment); the preferences and the digest speak in
 * *categories*. They are nearly the same set — deliberately — so `countFor`
 * accepts either and resolves it.
 */

import { categoryForType } from "#core/shared/notifications/bell";

export function useUnreadByCategory() {
  const { countsByType, unreadCount } = useDirectusNotifications();

  /** `{ meeting: 2, payment: 1 }` — types with no unread rows are absent. */
  const counts = countsByType;

  /** Unread for one type/category key. Unknown keys are 0, never undefined. */
  function countFor(key: string | null | undefined): number {
    if (!key) return 0;
    return counts.value[key] ?? 0;
  }

  /**
   * Unread for a set of keys — a section hub that covers several types
   * ("Community" = announcements + meetings) asks once instead of summing at
   * each call site.
   */
  function countForAny(keys: Array<string | null | undefined>): number {
    return keys.reduce<number>((n, k) => n + countFor(k), 0);
  }

  /** The preference category a type is governed by, or null when it has none. */
  const categoryOf = categoryForType;

  return { counts, countFor, countForAny, categoryOf, total: unreadCount };
}
