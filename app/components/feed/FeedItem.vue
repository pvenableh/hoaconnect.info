<script setup lang="ts">
import type { FeedItem } from "~/composables/useActivityFeed";
import { getCommentCapability, can } from "~/config/commentCapabilities";

const props = withDefaults(
  defineProps<{
    item: FeedItem;
    organizationId: string | null;
    isBoard?: boolean;
    isMember?: boolean;
  }>(),
  { isBoard: false, isMember: true }
);

const { buildOrgPath } = useOrgNavigation();

// The comment thread (and its realtime subscription) mounts lazily on expand,
// so a long feed doesn't open a subscription per card up front.
const showComments = ref(false);

const accentBg: Record<string, string> = {
  red: "bg-red-50 text-red-600",
  amber: "bg-amber-50 text-amber-600",
  blue: "bg-blue-50 text-blue-600",
  purple: "bg-purple-50 text-purple-600",
  violet: "bg-violet-50 text-violet-600",
  sky: "bg-sky-50 text-sky-600",
  stone: "bg-stone-100 text-stone-600",
};

const viewer = computed(() => ({
  isBoard: props.isBoard,
  isMember: props.isMember,
  isParticipant: false,
}));
const cap = computed(() => getCommentCapability(props.item.sourceCollection));
const canReact = computed(() => can(cap.value.react, viewer.value));

const link = computed(() => {
  const routes: Record<string, string> = {
    hoa_announcements: "/announcements",
    hoa_meetings: "/meetings",
    hoa_documents: `/documents/${props.item.sourceId}`,
  };
  return buildOrgPath(routes[props.item.sourceCollection] || "/dashboard");
});

const formatDate = (s: string | null | undefined) => {
  if (!s) return "";
  const d = new Date(s);
  const diffH = Math.floor((Date.now() - d.getTime()) / 3600000);
  if (diffH < 1) return "Just now";
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `${diffD}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};
</script>

<template>
  <article class="ios-card p-5">
    <!-- Header -->
    <div class="flex items-start gap-3">
      <div
        class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
        :class="accentBg[item.accent] || accentBg.stone"
      >
        <Icon :name="item.icon" class="w-5 h-5" />
      </div>
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2">
          <span class="text-xs font-medium uppercase tracking-wide text-stone-400">
            {{ item.subtitle }}
          </span>
          <span
            v-if="item.isPinned"
            class="inline-flex items-center gap-0.5 text-[10px] font-medium text-amber-600"
          >
            <Icon name="lucide:pin" class="w-2.5 h-2.5" /> Pinned
          </span>
          <span class="text-xs text-stone-300">·</span>
          <span class="text-xs text-stone-400">{{ formatDate(item.date) }}</span>
        </div>
        <NuxtLink :to="link" class="block mt-0.5">
          <h3 class="font-semibold text-stone-900 hover:underline">{{ item.title }}</h3>
        </NuxtLink>
      </div>
    </div>

    <!-- Excerpt -->
    <p v-if="item.excerpt" class="mt-2 text-sm text-stone-600 line-clamp-3">
      {{ item.excerpt }}
    </p>

    <!-- Engagement bar -->
    <div class="mt-3 pt-3 border-t border-stone-100 flex items-center justify-between gap-3">
      <CommentsReactionBar
        :target-collection="item.sourceCollection"
        :target-id="item.sourceId"
        :can-react="canReact"
      />
      <button
        type="button"
        class="inline-flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-800 transition-colors"
        @click="showComments = !showComments"
      >
        <Icon name="lucide:message-circle" class="w-4 h-4" />
        <span>{{ showComments ? "Hide comments" : "Comment" }}</span>
      </button>
    </div>

    <!-- Inline comment thread -->
    <div v-if="showComments" class="mt-4 pt-4 border-t border-stone-100">
      <CommentsCommentThread
        :target-collection="item.sourceCollection"
        :target-id="item.sourceId"
        :organization-id="organizationId"
        :is-board="isBoard"
        :is-member="isMember"
        title="Comments"
      />
    </div>
  </article>
</template>
