// Client-side portal activity tracker. Batches events and flushes them to
// /api/org/activity (sendBeacon on page-hide so they survive navigation).
//
// Privacy/correctness guards baked in:
//   • only tracks when logged in, an org is selected, and NOT in "view as
//     member" preview (admins previewing the resident view must not pollute
//     real member activity).
//   • identity (member/user/ip) is resolved SERVER-side from the session; the
//     client only sends the event shape.
//
// Module-level queue = one shared buffer on the client (this composable is only
// used client-side, via the .client plugin and explicit calls).

import type { RawActivityEvent, ActivityEventType } from "~~/shared/activity/events";

let queue: RawActivityEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let sessionId: string | null = null;

function getSessionId(): string | undefined {
  if (!import.meta.client) return undefined;
  if (sessionId) return sessionId;
  try {
    const key = "hoa_activity_session";
    let s = sessionStorage.getItem(key);
    if (!s) {
      s = crypto.randomUUID();
      sessionStorage.setItem(key, s);
    }
    sessionId = s;
  } catch {
    sessionId = crypto.randomUUID();
  }
  return sessionId;
}

export interface TrackDownloadOptions {
  targetId: string;
  targetCollection?: string;
  label?: string;
  metadata?: Record<string, unknown>;
}

export function useActivityTracker() {
  const orgId = useState<string | undefined>("selectedOrgId");
  const { loggedIn } = useUserSession();
  const { isPreviewingMember } = useViewAs();

  const enabled = computed(
    () => import.meta.client && !!loggedIn.value && !!orgId.value && !isPreviewingMember.value
  );

  function enqueue(ev: RawActivityEvent) {
    if (!enabled.value) return;
    queue.push({ ...ev, sessionId: getSessionId() });
    if (!flushTimer) {
      flushTimer = setTimeout(() => {
        flushTimer = null;
        void flush();
      }, 4000);
    }
  }

  async function flush(useBeacon = false) {
    if (!import.meta.client || !queue.length || !orgId.value) return;
    const events = queue.splice(0, queue.length);
    const payload = JSON.stringify({ orgId: orgId.value, events });
    if (useBeacon && typeof navigator !== "undefined" && navigator.sendBeacon) {
      navigator.sendBeacon("/api/org/activity", new Blob([payload], { type: "application/json" }));
      return;
    }
    try {
      await $fetch("/api/org/activity", {
        method: "POST",
        body: payload,
        headers: { "content-type": "application/json" },
      });
    } catch {
      // Best-effort: activity logging must never surface an error to the user.
    }
  }

  const trackEvent = (type: ActivityEventType, payload: Partial<RawActivityEvent> = {}) =>
    enqueue({ type, ...payload });
  const trackPageView = (path: string) => enqueue({ type: "page_view", path });
  const trackSessionStart = () => enqueue({ type: "session_start" });
  const trackDownload = (opts: TrackDownloadOptions) =>
    enqueue({
      type: "download",
      targetCollection: opts.targetCollection ?? "hoa_documents",
      targetId: opts.targetId,
      label: opts.label,
      metadata: opts.metadata,
    });

  return { enabled, trackEvent, trackPageView, trackSessionStart, trackDownload, flush };
}
