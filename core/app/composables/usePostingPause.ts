/**
 * usePostingPause — is the signed-in member's posting paused in the community
 * they are looking at? (docs/spec-member-restrictions.md)
 *
 * Read from GET /api/org/member-restrictions/mine, once per community per
 * session and shared by every caller (the banner, the chat and comment
 * composers, reactions, Report), so a page with forty comments asks once.
 * Anyone the route refuses (not an active member there) reads as not paused:
 * the composers keep their own checks, and Directus has the last word.
 */
interface Mine {
  restricted: boolean;
  endsAt: string | null;
  memberNote: string | null;
  /** "until December 18, 2026" on the community's clock, or "until the board lifts it". */
  until: string | null;
}

const inflight = new Map<string, Promise<void>>();

export function usePostingPause() {
  const selectedOrgId = useState<string | null>("selectedOrgId", () => null);
  const byOrg = useState<Record<string, Mine | null>>("posting-pause", () => ({}));

  function load(orgId: string | null | undefined, force = false): Promise<void> {
    if (!import.meta.client || !orgId) return Promise.resolve();
    if (!force && (orgId in byOrg.value || inflight.has(orgId))) return inflight.get(orgId) ?? Promise.resolve();
    const run = $fetch<Mine>("/api/org/member-restrictions/mine", { query: { orgId } })
      .then((r) => void (byOrg.value = { ...byOrg.value, [orgId]: r }))
      .catch(() => void (byOrg.value = { ...byOrg.value, [orgId]: null }))
      .finally(() => inflight.delete(orgId));
    inflight.set(orgId, run);
    return run;
  }

  watch(selectedOrgId, (id) => void load(id), { immediate: true });

  const mine = computed(() => (selectedOrgId.value ? (byOrg.value[selectedOrgId.value] ?? null) : null));
  const paused = computed(() => !!mine.value?.restricted);
  const until = computed(() => mine.value?.until ?? "until the board lifts it");

  return {
    paused,
    until,
    memberNote: computed(() => mine.value?.memberNote ?? null),
    /** The one line a composer, reaction bar or Report shows in its place. */
    composerLine: computed(() => `Your posting is paused here ${until.value}. You can still read, pay dues and send requests to the board.`),
    refresh: () => load(selectedOrgId.value, true),
  };
}
