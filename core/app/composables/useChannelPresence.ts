// Presence for ONE open channel (Parity Round 3, Phase 7.4).
//
// While a channel is open AND the tab is visible, beat every 60 s to
// `POST /api/hoa/channels/:id/presence`. The beat does two jobs on the server:
// it marks me as "reading this" (so notify-on-message leaves me alone), and the
// answer says who else is here (the avatars in the thread header). A closed tab
// just stops beating and ages out after 90 s; a clean close sends `leaving`.
//
// There is no typing indicator and no socket of its own — presence is a
// timestamp, which is why it holds across serverless instances. Failures are
// silent by design: presence is garnish, and a missed beat can only ever mean a
// notification is sent that could have been skipped.

import { PRESENCE_HEARTBEAT_MS } from "#core/shared/channels/rules";

export interface PresentMember {
  id: string;
  first_name: string | null;
  last_name: string | null;
  avatar: string | null;
}

export function useChannelPresence(channelId: Ref<string | null | undefined>) {
  const here = ref<PresentMember[]>([]);
  let timer: ReturnType<typeof setInterval> | null = null;
  let active: string | null = null;

  const post = (id: string, leaving: boolean) =>
    $fetch<{ here?: PresentMember[] }>(`/api/hoa/channels/${id}/presence`, {
      method: "POST",
      body: leaving ? { leaving: true } : {},
      // A tab that is closing still gets its leave through.
      ...(leaving ? ({ keepalive: true } as object) : {}),
    });

  const beat = async () => {
    const id = active;
    if (!id || (typeof document !== "undefined" && document.visibilityState === "hidden")) return;
    try {
      const res = await post(id, false);
      if (active === id) here.value = res?.here ?? [];
    } catch {
      /* presence is best-effort */
    }
  };

  const stop = (leave: boolean) => {
    if (timer) clearInterval(timer);
    timer = null;
    const id = active;
    active = null;
    here.value = [];
    if (leave && id) void post(id, true).catch(() => {});
  };

  const start = (id: string) => {
    stop(true);
    active = id;
    void beat();
    timer = setInterval(beat, PRESENCE_HEARTBEAT_MS);
  };

  const onVisible = () => {
    if (document.visibilityState === "visible") void beat();
  };
  const onPageHide = () => stop(true);

  if (import.meta.client) {
    watch(
      channelId,
      (id) => {
        if (id) start(id);
        else stop(true);
      },
      { immediate: true }
    );
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pagehide", onPageHide);
    onScopeDispose(() => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pagehide", onPageHide);
      stop(true);
    });
  }

  return { here };
}
