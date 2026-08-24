/**
 * useNotifyEvent — tell the server that a row the browser just wrote is news.
 *
 * Several of the collections the notification bell shows are created straight
 * from the browser through the Directus proxy (mentions, meetings, comments), so
 * there is no server moment where a fan-out could hang. This is the ping that
 * creates one: `/api/org/notify-event` re-reads the row for itself, decides what
 * it says and who hears it, and writes the bell rows.
 *
 * Deliberately thin, and deliberately fire-and-forget:
 *
 * - It carries no copy and no recipients. The client says only which row
 *   changed; a caller cannot choose the audience, the wording or the community.
 * - It never throws and never awaits into a user-facing path. A notification is
 *   a consequence of the write, not part of it — failing the "meeting saved"
 *   toast because a bell row didn't land would be the wrong trade every time.
 * - "Nothing to say" answers (a draft comment, an already-announced meeting)
 *   come back as `{ok:false, reason}` with a 200, so they stay out of the
 *   console. Only real failures are logged, at debug volume.
 */

export type NotifiableAction = "create" | "update";

export function useNotifyEvent() {
  /**
   * Announce a row. Returns immediately; the request continues in the
   * background. Safe to call from a submit handler without awaiting.
   */
  function announce(
    collection: string,
    itemId: string | null | undefined,
    action: NotifiableAction = "create"
  ): void {
    if (!import.meta.client) return;
    const id = String(itemId ?? "").trim();
    if (!id) return;

    void $fetch("/api/org/notify-event", {
      method: "POST",
      body: { collection, action, itemId: id },
    }).catch((e) => {
      // A dropped notification is not worth a red line in someone's console —
      // but a 403 here means the membership check is misconfigured, which is
      // worth finding in dev.
      if (import.meta.dev) console.debug("[notify-event] not announced:", collection, id, e?.data?.message || e?.message);
    });
  }

  return { announce };
}
