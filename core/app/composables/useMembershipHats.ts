/**
 * useMembershipHats — the session user's hats in each community, for the org
 * switcher's badge (GET /api/user/hats; docs/spec-capability-nav.md). One
 * fetch per user per page load, shared by every caller. Identity only.
 */
import type { HatBadgeInput } from "#core/shared/roles/hat-badge";

export interface MembershipHatsRow extends HatBadgeInput {
  orgId: string;
}

interface HatsState {
  userId: string | null;
  rows: MembershipHatsRow[];
  loaded: boolean;
}

let inflight: Promise<void> | null = null;

export const useMembershipHats = () => {
  const { user } = useUserSession();
  const state = useState<HatsState>("membershipHats", () => ({ userId: null, rows: [], loaded: false }));

  const load = async () => {
    if (!import.meta.client) return;
    const userId = (user.value as { id?: string } | null)?.id ?? null;
    if (!userId || (state.value.loaded && state.value.userId === userId)) return;
    if (inflight) return inflight;
    inflight = (async () => {
      try {
        const res = await $fetch<{ hats: MembershipHatsRow[] }>("/api/user/hats");
        state.value = { userId, rows: res?.hats ?? [], loaded: true };
      } catch {
        // Signed out or offline: the switcher keeps its own role labels.
        state.value = { userId, rows: [], loaded: true };
      } finally {
        inflight = null;
      }
    })();
    return inflight;
  };

  const forOrg = (orgId: string | null | undefined): MembershipHatsRow | null =>
    (orgId && state.value.rows.find((r) => r.orgId === orgId)) || null;

  return { load, forOrg };
};
