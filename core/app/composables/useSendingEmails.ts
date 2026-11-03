// useSendingEmails — how many of the current org's emails are mid-send, for
// the Communications badge in the dock (docs/spec-email-send-queue.md §5.4).
// One shared count (useState); refreshed on demand (a send starts or ends)
// and every minute while the admin dock is up — every 15 s while a send is in
// flight. Best-effort: a failed read leaves the last count.
export function useSendingEmails() {
  const count = useState<number>("email-sending-count", () => 0);
  const { currentDomainOrgId } = useCurrentDomainAccess();

  async function refresh() {
    const organizationId = currentDomainOrgId.value;
    if (!organizationId) {
      count.value = 0;
      return;
    }
    try {
      const res = await $fetch<{ emails?: unknown[] }>("/api/email/list", {
        query: { organizationId, status: "sending", limit: 20 },
      });
      count.value = Array.isArray(res?.emails) ? res.emails.length : 0;
    } catch {
      /* keep the last count */
    }
  }

  /** Poll while mounted, only while `enabled` (the admin dock) is true. */
  function watchLive(enabled: Ref<boolean> | ComputedRef<boolean>) {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const loop = async () => {
      if (enabled.value) await refresh();
      else count.value = 0;
      timer = setTimeout(loop, count.value > 0 ? 15_000 : 60_000);
    };
    onMounted(loop);
    onBeforeUnmount(() => {
      if (timer) clearTimeout(timer);
    });
  }

  return { count, refresh, watchLive };
}
