<script setup lang="ts">
// Channels inside the Communications hub (auth layout + the Email · Channels ·
// Audience tab strip). The same ChannelsWorkspace the full-height
// /admin/channels pages render, embedded; picking a channel opens the
// full-height thread. The top-nav quick-peek chat slide-over stays available.
definePageMeta({
  middleware: ["admin", "subscription"],
  layout: "auth",
});

const { selectedOrgId, currentOrg } = await useSelectedOrg();
const { isAdminOfCurrentDomain } = useCurrentDomainAccess();
const { isEnabled } = useModules();

const orgId = computed(() => selectedOrgId.value);
const orgName = computed(() => currentOrg.value?.organization?.name || "Channels");
const isAdmin = computed(() => isAdminOfCurrentDomain.value);
const channelsEnabled = computed(() => isEnabled("channels"));

// The workspace below owns the create modal and opens it for `?new=channel`
// (useCreateIntent), so the hub's own button asks the same way.
const router = useRouter();
const route = useRoute();
const newChannel = () => router.replace({ query: { ...route.query, new: "channel" } });
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
        <Button v-if="isAdmin && channelsEnabled" size="lg" @click="newChannel">
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

        <Card class="overflow-hidden p-0">
          <ChannelsWorkspace
            v-if="orgId"
            embedded
            :organization-id="orgId"
            :org-name="orgName"
            :is-admin="isAdmin"
          />
        </Card>
      </ClientOnly>

    </PageContainer>
  </div>
</template>
