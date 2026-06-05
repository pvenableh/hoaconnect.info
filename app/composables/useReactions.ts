/**
 * useReactions(targetCollection, targetId) — the universal reaction rail.
 *
 * Polymorphic emoji reactions on a comment OR any entity. Enforces one
 * (user, target, emoji) by deduping in the toggle path. Aggregates client-side
 * into { emoji, count, reactedByMe }.
 *
 * Backed by the hoa_reactions collection (scripts/create-comments-collections.ts).
 */

export interface Reaction {
  id: string;
  target_collection: string;
  target_id: string;
  emoji: string;
  user?: string | { id: string } | null;
  organization?: string | null;
  date_created?: string | null;
}

export interface AggregatedReaction {
  emoji: string;
  count: number;
  reactedByMe: boolean;
  myReactionId?: string;
}

const REACTION_FIELDS = ["id", "target_collection", "target_id", "emoji", "user", "date_created"];

export const useReactions = (
  targetCollection: string,
  targetId: MaybeRefOrGetter<string | null | undefined>
) => {
  const { user } = useDirectusAuth();
  const selectedOrgId = useState<string | null>("selectedOrgId", () => null);
  const { create, remove } = useDirectusItems<Reaction>("hoa_reactions");

  const tid = computed(() => toValue(targetId));

  const filter = computed(() => ({
    target_collection: { _eq: targetCollection },
    target_id: { _eq: tid.value },
  }));

  const { data: reactions, refresh } = useRealtimeSubscription<Reaction>(
    "hoa_reactions",
    REACTION_FIELDS,
    filter as unknown as Record<string, any>,
    ["date_created"]
  );

  const userId = computed(() => user.value?.id || null);

  const reactionUserId = (r: Reaction): string | null =>
    typeof r.user === "string" ? r.user : r.user?.id || null;

  // Aggregate into { emoji, count, reactedByMe }.
  const aggregated = computed<AggregatedReaction[]>(() => {
    const map = new Map<string, AggregatedReaction>();
    for (const r of reactions.value || []) {
      const entry =
        map.get(r.emoji) || { emoji: r.emoji, count: 0, reactedByMe: false };
      entry.count += 1;
      if (reactionUserId(r) === userId.value) {
        entry.reactedByMe = true;
        entry.myReactionId = r.id;
      }
      map.set(r.emoji, entry);
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  });

  // Toggle a reaction for the current user (dedupe one (user, target, emoji)).
  const toggle = async (emoji: string) => {
    if (!userId.value) return;
    const existing = (reactions.value || []).find(
      (r) => r.emoji === emoji && reactionUserId(r) === userId.value
    );
    if (existing) {
      await remove(existing.id);
    } else {
      if (!selectedOrgId.value) throw new Error("No organization selected");
      await create({
        target_collection: targetCollection,
        target_id: String(tid.value),
        emoji,
        organization: selectedOrgId.value,
      } as Reaction);
    }
    await refresh();
  };

  return {
    reactions,
    aggregated,
    toggle,
    refresh,
  };
};
