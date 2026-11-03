<script setup lang="ts">
/**
 * ChannelsWorkspace — the one channels surface: the channel list beside either
 * the open thread or, with no channel picked, org-wide message search.
 *
 * Two hosts, one component:
 *   - `/admin/channels` and `/admin/channels/:channel` render it full height,
 *     inside the workspace shell as an IMMERSIVE page (auth layout with
 *     `meta.immersive`: the page is h-dvh, the footer hides, the dock stays).
 *   - `/admin/communications/channels` renders it `embedded` in the
 *     Communications hub at a fixed height; picking a channel there opens the
 *     full-height page.
 *
 * Before this, each host carried its own copy of the list, the search and the
 * create modal, and the full-height pages rode a separate `channels` layout that
 * dropped the dock — the one surface people leave open longest was the one with
 * no way across to the rest of the app.
 */
import type { HoaChannel } from "#core/types/directus";

const props = defineProps<{
  organizationId: string;
  orgName: string;
  isAdmin: boolean;
  canManage?: boolean;
  /** The open channel; omit for the list + search view. */
  channelSlug?: string | null;
  highlightMessageId?: string;
  /** Hosted inside a page (the Communications hub) rather than full height. */
  embedded?: boolean;
}>();

const router = useRouter();
const { buildOrgPath } = useOrgNavigation();

const showCreateModal = ref(false);

const openChannel = (channel: { slug: string }) =>
  router.push(buildOrgPath(`/admin/channels/${channel.slug}`));
const backToList = () => router.push(buildOrgPath("/admin/channels"));

// Org-wide message search (Track E).
const { searchOrg } = useChannelSearch();
const searchQuery = ref("");
const searchResults = ref<Awaited<ReturnType<typeof searchOrg>>>([]);
const searching = ref(false);

const runSearch = async () => {
  if (!props.organizationId || !searchQuery.value.trim()) {
    searchResults.value = [];
    return;
  }
  searching.value = true;
  try {
    searchResults.value = await searchOrg(props.organizationId, searchQuery.value);
  } finally {
    searching.value = false;
  }
};
watch(searchQuery, runSearch);

const openResult = (r: { channel: { slug: string } | null; id: string }) => {
  if (!r.channel) return;
  router.push(buildOrgPath(`/admin/channels/${r.channel.slug}?message=${r.id}`));
};

const fmtTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "";

// The create verb (`?new=channel`, useCreateIntent) lands here as well as on
// the button, so Spotlight and the Nav's "+ New" open the same modal.
useCreateIntent("channel", () => {
  if (props.isAdmin) showCreateModal.value = true;
});
</script>

<template>
  <div
    class="channels-workspace flex min-h-0"
    :class="embedded ? 'channels-workspace--embedded' : 'h-full'"
    data-channels-workspace
  >
    <!-- Channel list. On a phone with a channel open the thread takes the
         whole width and its own back button returns here. -->
    <aside
      class="w-64 shrink-0 border-r t-border t-bg-alt overflow-y-auto"
      :class="{ 'hidden md:block': channelSlug }"
    >
      <div v-if="!embedded" class="p-4 border-b t-border">
        <p class="type-micro type-flush">Channels</p>
        <p class="font-semibold text-lg truncate">{{ orgName }}</p>
      </div>
      <ChannelsList
        :organization-id="organizationId"
        :selected-channel-slug="channelSlug || undefined"
        :is-admin="isAdmin"
        @select="(c: HoaChannel) => openChannel(c)"
        @create="showCreateModal = true"
      />
    </aside>

    <!-- Thread -->
    <ChannelsChannelThread
      v-if="channelSlug"
      :organization-id="organizationId"
      :channel-slug="channelSlug"
      :is-admin="isAdmin"
      :can-manage="!!canManage"
      :highlight-message-id="highlightMessageId"
      @back="backToList"
      @archived="backToList"
      @deleted="backToList"
    />

    <!-- No channel picked: org-wide search. -->
    <main
      v-else
      class="flex-1 min-w-0 overflow-y-auto flex flex-col items-center px-4 py-10"
      :class="embedded ? 'justify-start' : 'justify-center t-bg-elevated'"
    >
      <div class="w-full max-w-lg">
        <div class="text-center mb-6">
          <div class="w-14 h-14 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center">
            <Icon name="lucide:message-square" class="w-7 h-7 text-primary" />
          </div>
          <h2 class="text-xl font-semibold mb-1">Pick a channel</h2>
          <p class="t-text-muted text-sm">
            Open a conversation from the list, or search across all of them.
          </p>
        </div>

        <div class="relative">
          <Icon
            name="lucide:search"
            class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 t-text-muted"
          />
          <Input v-model="searchQuery" placeholder="Search all channels…" class="pl-9" />
        </div>
        <div
          v-if="searchQuery.trim()"
          class="mt-3 ios-card divide-y divide-black/[0.04] dark:divide-white/[0.05] max-h-80 overflow-y-auto"
        >
          <div v-if="searching" class="py-6 flex justify-center">
            <div class="spinner-ios" />
          </div>
          <template v-else-if="searchResults.length">
            <button
              v-for="r in searchResults"
              :key="r.id"
              class="w-full text-left px-4 py-3 hover:t-bg-subtle"
              @click="openResult(r)"
            >
              <div class="flex items-center gap-2 mb-0.5">
                <Icon name="lucide:hash" class="w-3.5 h-3.5 t-text-muted" />
                <span class="text-xs font-medium t-text-muted">{{ r.channel?.name }}</span>
                <span class="text-xs t-text-muted ml-auto">{{ fmtTime(r.date_created) }}</span>
              </div>
              <p class="text-sm t-text line-clamp-2">{{ r.snippet }}</p>
            </button>
          </template>
          <p v-else class="text-sm t-text-muted py-6 text-center">No matches.</p>
        </div>
      </div>
    </main>

    <ChannelsCreateChannelModal
      v-model:open="showCreateModal"
      :organization-id="organizationId"
      @created="openChannel"
    />
  </div>
</template>

<style scoped>
/* Embedded in the Communications hub: a fixed-height card rather than the
   viewport, so the page around it still scrolls. */
.channels-workspace--embedded {
  height: min(70vh, 40rem);
  border-radius: var(--radius-xl, 1rem);
  overflow: hidden;
}
</style>
