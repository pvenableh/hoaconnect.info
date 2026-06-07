<script setup lang="ts">
import type { HoaChannel } from "~~/types/directus";

definePageMeta({
  middleware: ["channel-access", "subscription"],
  layout: "channels",
  // No route animation when switching channels — just swap the content.
  pageTransition: false,
  layoutTransition: false,
});

const router = useRouter();
const { buildOrgPath } = useOrgNavigation();
// Org id from the awaited selected-org state — the reliable, app-wide source the
// rest of /[slug]/admin uses (activeHoa can be briefly null on client nav).
const { selectedOrgId, currentOrg } = await useSelectedOrg();
const { isAdminOfCurrentDomain } = useCurrentDomainAccess();

const orgId = computed(() => selectedOrgId.value);
const orgName = computed(() => currentOrg.value?.organization?.name || "Channels");
const isAdmin = computed(() => isAdminOfCurrentDomain.value);

const showCreateModal = ref(false);

// Org-wide message search (Track E)
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

const openResult = (r: { channel: { slug: string } | null; id: string }) => {
  if (!r.channel) return;
  router.push(
    buildOrgPath(`/admin/channels/${r.channel.slug}?message=${r.id}`)
  );
};

const fmtTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "";

// Handle channel selection
const handleChannelSelect = (channel: HoaChannel) => {
  router.push(buildOrgPath(`/admin/channels/${channel.slug}`));
};

// Handle channel creation
const handleChannelCreated = (channel: any) => {
  router.push(buildOrgPath(`/admin/channels/${channel.slug}`));
};
</script>

<template>
  <div class="h-full min-h-0">
    <ClientOnly>
      <template #fallback>
        <div class="h-full flex items-center justify-center"><div class="spinner-ios" /></div>
      </template>
  <div class="flex h-full min-h-0">
    <!-- Sidebar with Channels List -->
    <aside
      class="w-64 border-r border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900 overflow-y-auto"
    >
      <div class="p-4 border-b border-stone-200 dark:border-stone-800 flex items-center gap-2.5">
        <NuxtLink
          :to="buildOrgPath('/')"
          class="inline-flex items-center justify-center w-8 h-8 rounded-full t-bg-subtle hover:opacity-80 shrink-0"
          title="Back to dashboard"
        >
          <Icon name="lucide:chevron-left" class="w-4 h-4" />
        </NuxtLink>
        <h1 class="font-semibold text-lg truncate">
          {{ orgName }}
        </h1>
      </div>

      <ChannelsList
        v-if="orgId"
        :organization-id="orgId"
        :is-admin="isAdmin"
        @select="handleChannelSelect"
        @create="showCreateModal = true"
      />
    </aside>

    <!-- Main Content - Welcome / Search -->
    <main class="flex-1 flex flex-col items-center justify-center bg-white dark:bg-stone-900 px-4">
      <div class="w-full max-w-lg">
        <div class="text-center mb-6">
          <div
            class="w-16 h-16 mx-auto mb-6 rounded-full bg-primary/10 flex items-center justify-center"
          >
            <Icon name="lucide:message-square" class="w-8 h-8 text-primary" />
          </div>
          <h2 class="text-2xl font-semibold mb-2">Welcome to Channels</h2>
          <p class="text-stone-500 mb-6">
            Select a channel from the sidebar, search all channels below, or
            create a new one.
          </p>
          <Button v-if="isAdmin" @click="showCreateModal = true">
            <Icon name="lucide:plus" class="w-4 h-4 mr-2" />
            Create Channel
          </Button>
        </div>

        <!-- Org-wide search -->
        <div class="relative">
          <Icon
            name="lucide:search"
            class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 t-text-muted"
          />
          <Input
            v-model="searchQuery"
            placeholder="Search all channels…"
            class="pl-9"
          />
        </div>
        <div v-if="searchQuery.trim()" class="mt-3 ios-card divide-y divide-black/[0.04] dark:divide-white/[0.05] max-h-80 overflow-y-auto">
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

    <!-- Create Channel Modal -->
    <ChannelsCreateChannelModal
      v-if="orgId"
      v-model:open="showCreateModal"
      :organization-id="orgId"
      @created="handleChannelCreated"
    />
  </div>
    </ClientOnly>
  </div>
</template>
