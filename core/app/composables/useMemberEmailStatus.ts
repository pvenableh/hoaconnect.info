/**
 * useMemberEmailStatus — which members of an org have their mail held back
 * (a bounced address, or an opt-out from community mail), for the Members page's
 * chips and their Clear action (Earnest parity round 3, Phase 3a).
 *
 * Client-only, from /api/hoa/member-email-status (admin-gated): the Members
 * page's own roster read is untouched, so it keeps working before the Phase 3a
 * fields exist — this just answers `available: false` and the chips stay away.
 */

export interface MemberEmailStatus {
  id: string;
  bounced: boolean;
  bouncedAt: string | null;
  bouncedReason: string | null;
  optedOut: boolean;
  optedOutAt: string | null;
  optedOutSource: string | null;
}

export function useMemberEmailStatus(orgId: Ref<string | null | undefined>) {
  const { data, refresh } = useAsyncData(
    () => `member-email-status-${orgId.value || "none"}`,
    async () => {
      if (!orgId.value) return { available: false, members: [] as MemberEmailStatus[] };
      try {
        return await $fetch<{ available: boolean; members: MemberEmailStatus[] }>(
          "/api/hoa/member-email-status",
          { query: { organizationId: orgId.value } }
        );
      } catch {
        return { available: false, members: [] as MemberEmailStatus[] };
      }
    },
    { server: false, watch: [orgId] }
  );

  const byId = computed(() => new Map((data.value?.members || []).map((m) => [m.id, m])));

  /** Restore mail to a member. Returns the server's answer (including whether the ledger took it). */
  async function clear(memberId: string, what: "bounced" | "opt_out") {
    const res = await $fetch<{ ok: boolean; changed: boolean; recorded: boolean; recordError: string | null }>(
      "/api/hoa/member-email-status",
      { method: "POST", body: { organizationId: orgId.value, memberId, clear: what } }
    );
    await refresh();
    return res;
  }

  return {
    available: computed(() => data.value?.available === true),
    statusFor: (memberId: string) => byId.value.get(memberId) || null,
    clear,
    refresh,
  };
}
