// Direct messages (Parity Round 3, Phase 7.3) — a private channel with exactly
// two people, found again by the pair. Two jobs: open one (from a member's row
// or Spotlight's "Message …"), and say who each existing one is with (the roster
// groups them under "Direct" and titles each with the OTHER person).

import { isDmSlug } from "#core/shared/channels/rules";

export interface DmPeer {
  id: string;
  name: string;
  avatar: string | null;
}

const peers = ref<Record<string, DmPeer>>({});
const loadedFor = ref<string | null>(null);

export function useDirectMessages() {
  const selectedOrgId = useState<string | null>("selectedOrgId", () => null);
  const panel = useChannelsPanel();

  /** Reload who each of my DMs is with. Cheap: one route, my memberships only. */
  const refreshPeers = async (organization?: string | null) => {
    const org = organization || selectedOrgId.value;
    if (!org) return;
    try {
      const res = await $fetch<{ peers: Record<string, DmPeer> }>("/api/hoa/channels/dm-peers", {
        query: { organization: org },
      });
      peers.value = res?.peers ?? {};
      loadedFor.value = org;
    } catch {
      /* the roster falls back to the stored name */
    }
  };

  const peerFor = (channelId?: string | null): DmPeer | null =>
    (channelId && peers.value[channelId]) || null;

  /**
   * Open (or create) my DM with `userId` in the slide-over Channels panel.
   * Resolves to the channel, or null with a toast on failure.
   */
  const startDirectMessage = async (userId: string, organization?: string | null) => {
    const org = organization || selectedOrgId.value;
    if (!org || !userId) return null;
    try {
      const res = await $fetch<{ channel: { id: string; slug: string }; created: boolean }>(
        "/api/hoa/channels/dm",
        { method: "POST", body: { organization: org, userId } }
      );
      await refreshPeers(org);
      panel.open(res.channel.slug);
      return res.channel;
    } catch (e: any) {
      const { toast } = await import("vue-sonner");
      toast.error(e?.data?.message || e?.message || "Couldn't open the conversation");
      return null;
    }
  };

  return { peers, peerFor, refreshPeers, startDirectMessage, isDmSlug };
}
