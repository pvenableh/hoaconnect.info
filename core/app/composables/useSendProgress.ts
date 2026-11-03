// useSendProgress — poll a queued send's progress (GET /api/email/:id/progress)
// every 5 s until it is done, for the compose page's send dialog and the email
// detail page. The labels come from core/shared/email/send-progress.ts, the
// same wording the server's tests pin. Stops by itself when the send finishes
// or the caller's scope is disposed.
import {
  progressLabel,
  progressPercent,
  type SendProgressView,
} from "#core/shared/email/send-progress";

export const SEND_PROGRESS_POLL_MS = 5_000;

export function useSendProgress() {
  const progress = ref<SendProgressView | null>(null);
  const error = ref<string | null>(null);
  let timer: ReturnType<typeof setTimeout> | null = null;
  let current: string | null = null;

  const label = computed(() => (progress.value ? progressLabel(progress.value) : ""));
  const percent = computed(() => (progress.value ? progressPercent(progress.value) : 0));
  const done = computed(() => progress.value?.phase === "done");
  const resuming = ref(false);
  const resumeError = ref<string | null>(null);

  const { refresh: refreshSending } = useSendingEmails();

  async function poll() {
    const id = current;
    if (!id) return;
    try {
      const p = await $fetch<SendProgressView & { provisioned?: boolean }>(`/api/email/${id}/progress`);
      if (id !== current) return;
      progress.value = p;
      error.value = null;
    } catch (e: any) {
      error.value = e?.data?.message || e?.message || "Couldn't read progress";
    }
    if (current !== id) return;
    if (progress.value?.phase === "done") {
      refreshSending();
      return;
    }
    timer = setTimeout(poll, SEND_PROGRESS_POLL_MS);
  }

  /** Start watching a send. `initial` (send.post's response) renders at once. */
  function watchSend(emailId: string, initial?: SendProgressView | null) {
    stop();
    current = emailId;
    progress.value = initial ?? null;
    if (initial?.phase === "done") return;
    timer = setTimeout(poll, initial ? SEND_PROGRESS_POLL_MS : 0);
  }

  /** Resume a paused send (POST /api/email/:id/resume), then watch it again. */
  async function resume() {
    const id = current;
    if (!id || resuming.value) return;
    resuming.value = true;
    resumeError.value = null;
    try {
      const p = await $fetch<SendProgressView>(`/api/email/${id}/resume`, { method: "POST" });
      watchSend(id, p);
      refreshSending();
    } catch (e: any) {
      resumeError.value = e?.data?.message || e?.message || "Couldn't resume";
    } finally {
      resuming.value = false;
    }
  }

  function stop() {
    if (timer) clearTimeout(timer);
    timer = null;
    current = null;
  }

  if (getCurrentScope()) onScopeDispose(stop);

  return { progress, label, percent, done, error, resuming, resumeError, watchSend, resume, stop };
}
