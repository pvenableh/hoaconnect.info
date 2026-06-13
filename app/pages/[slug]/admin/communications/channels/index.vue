<script setup lang="ts">
import type { HoaChannel } from "~~/types/directus";

// First-class Channels destination inside the Communications hub (auth layout +
// the Email·Channels·Audience tab strip). Reuses the channels list + search +
// create-modal; selecting a channel opens the full focused thread view. The
// top-nav quick-peek chat slide-over stays available for power users.
definePageMeta({
  middleware: ["admin", "subscription"],
  layout: "auth",
});

const router = useRouter();
const { buildOrgPath } = useOrgNavigation();
const { selectedOrgId, currentOrg } = await useSelectedOrg();
const { isAdminOfCurrentDomain } = useCurrentDomainAccess();
const { isEnabled } = useModules();

const orgId = computed(() => selectedOrgId.value);
const orgName = computed(() => currentOrg.value?.organization?.name || "Channels");
const isAdmin = computed(() => isAdminOfCurrentDomain.value);
const channelsEnabled = computed(() => isEnabled("channels"));

const showCreateModal = ref(false);

// Org-wide message search (mirrors the full channels page).
const { searchOrg } = useChannelSearch();
const searchQuery = ref("");
const searchResults = ref<Awaited<ReturnType<typeof searchOrg>>>([]);
const searching = ref(false);

const runSearch = async () => {
  if (!orgId.value || !searchQuery.value.trim()) {
    searchResults.value = [];
    return;
  }
  searching.value = true;
  try {
    searchResults.value = await searchOrg(orgId.value, searchQuery.value);
  } finally {
    searching.value = false;
  }
};
watch(searchQuery, runSearch);

const fmtTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "";

const openChannel = (channel: HoaChannel) =>
  router.push(buildOrgPath(`/admin/channels/${channel.slug}`));

const openResult = (r: { channel: { slug: string } | null; id: string }) => {
  if (!r.channel) return;
  router.push(buildOrgPath(`/admin/channels/${r.channel.slug}?message=${r.id}`));
};

const handleChannelCreated = (channel: { slug: string }) =>
  router.push(buildOrgPath(`/admin/channels/${channel.slug}`));
</script>

<template>
  <div class="ui-kit accent-cyan min-h-screen t-bg">
    <PageContainer>
      <CommunicationsTabs />

      <WidgetGlass strong class="mb-8 flex justify-between items-start gap-4">
        <div>
          <p class="text-xs uppercase tracking-widest t-text-tertiary mb-1.5">Communications · Channels</p>
          <h1 class="text-3xl font-semibold tracking-tight t-text">Channels</h1>
          <p class="t-text-secondary mt-1">
            Ongoing group conversations for {{ orgName }} — board, committees, and community threads.
          </p>
        </div>
        <Button v-if="isAdmin && channelsEnabled" @click="showCreateModal = true" size="lg">
          <Icon name="lucide:plus" class="w-5 h-5 mr-2" />
          New channel
        </Button>
      </WidgetGlass>

      <!-- Module disabled -->
      <div v-if="!channelsEnabled" class="ios-card p-12 text-center">
        <Icon name="lucide:messages-square" class="mx-auto h-12 w-12 t-text-muted mb-3 opacity-60" />
        <h3 class="text-lg font-medium t-text mb-1">Channels aren't enabled</h3>
        <p class="t-text-muted">
          Turn on the Channels module in Settings to start group conversations.
        </p>
      </div>

      <ClientOnly v-else>
        <template #fallback>
          <div class="py-16 flex justify-center"><div class="spinner-ios" /></div>
        </template>

        <div class="grid grid-cols-1 lg:grid-cols-[18rem_1fr] gap-6">
          <!-- Channel list -->
          <Card class="overflow-hidden">
            <div class="max-h-[34rem] overflow-y-auto">
              <ChannelsList
                v-if="orgId"
                :organization-id="orgId"
                :is-admin="isAdmin"
                @select="openChannel"
                @create="showCreateModal = true"
              />
            </div>
          </Card>

          <!-- Search + welcome -->
          <Card class="p-6">
            <div class="relative mb-4">
              <Icon
                name="lucide:search"
                class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 t-text-muted"
              />
              <Input v-model="searchQuery" placeholder="Search all channels…" class="pl-9" />
            </div>

            <div v-if="searchQuery.trim()">
              <div v-if="searching" class="py-10 flex justify-center"><div class="spinner-ios" /></div>
              <div
                v-else-if="searchResults.length"
                class="divide-y t-border-divider rounded-lg overflow-hidden border t-border"
              >
                <button
                  v-for="r in searchResults"
                  :key="r.id"
                  class="w-full text-left px-4 py-3 hover:t-bg-subtle transition-colors"
                  @click="openResult(r)"
                >
                  <div class="flex items-center gap-2 mb-0.5">
                    <Icon name="lucide:hash" class="w-3.5 h-3.5 t-text-muted" />
                    <span class="text-xs font-medium t-text-muted">{{ r.channel?.name }}</span>
                    <span class="text-xs t-text-muted ml-auto">{{ fmtTime(r.date_created) }}</span>
                  </div>
                  <p class="text-sm t-text line-clamp-2">{{ r.snippet }}</p>
                </button>
              </div>
              <p v-else class="text-sm t-text-muted py-10 text-center">No matches.</p>
            </div>

            <div v-else class="py-12 text-center">
              <div class="w-14 h-14 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center">
                <Icon name="lucide:message-square" class="w-7 h-7 text-primary" />
              </div>
              <h2 class="text-lg font-semibold t-text mb-1">Pick a channel</h2>
              <p class="t-text-muted text-sm">
                Select a channel on the left to open the conversation, or search across all of them.
              </p>
            </div>
          </Card>
        </div>
      </ClientOnly>

      <ChannelsCreateChannelModal
        v-if="orgId && channelsEnabled"
        v-model:open="showCreateModal"
        :organization-id="orgId"
        @created="handleChannelCreated"
      />
    </PageContainer>
  </div>
</template>
