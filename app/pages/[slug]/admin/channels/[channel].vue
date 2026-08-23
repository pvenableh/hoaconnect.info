<script setup lang="ts">
import type { HoaChannel } from "#core/types/directus";

definePageMeta({
  middleware: ["channel-access", "subscription"],
  layout: "channels",
  // No route animation when switching channels — just swap the content.
  pageTransition: false,
  layoutTransition: false,
});

const route = useRoute();
const router = useRouter();
const { buildOrgPath } = useOrgNavigation();
const { selectedOrgId, currentOrg } = await useSelectedOrg();
const { isAdminOfCurrentDomain, isBoardMemberOfCurrentDomain } = useCurrentDomainAccess();

const orgId = computed(() => selectedOrgId.value);
const orgName = computed(() => currentOrg.value?.organization?.name || "Channels");
const isAdmin = computed(() => isAdminOfCurrentDomain.value);
const canManage = computed(() => isAdmin.value || isBoardMemberOfCurrentDomain.value);

const channelSlug = computed(() => route.params.channel as string);
const highlightMessageId = computed(() => route.query.message as string | undefined);
const showCreateModal = ref(false);

// Anchor the AI assistant to the open channel. The route carries the slug, so we
// resolve the channel id (the dossier keys on id) client-side and set focus.
const { setContext: setAiFocus, clearContext: clearAiFocus } = useAiContext();
const { list: listChannelsForFocus } = useDirectusItems("hoa_channels");
async function syncChannelFocus() {
  const slug = channelSlug.value;
  if (!slug || !orgId.value) return clearAiFocus();
  try {
    const rows = await listChannelsForFocus({
      filter: { slug: { _eq: slug }, organization: { _eq: orgId.value } },
      fields: ["id", "name"],
      limit: 1,
    });
    const ch = rows?.[0] as any;
    if (ch?.id) setAiFocus({ entityType: "channel", entityId: String(ch.id), label: `#${ch.name || slug}` });
    else clearAiFocus();
  } catch {
    clearAiFocus();
  }
}
onMounted(syncChannelFocus);
watch(channelSlug, syncChannelFocus);
onBeforeUnmount(clearAiFocus);

const handleChannelSelect = (channel: HoaChannel) =>
  router.push(buildOrgPath(`/admin/channels/${channel.slug}`));
const handleChannelCreated = (channel: any) =>
  router.push(buildOrgPath(`/admin/channels/${channel.slug}`));
const backToList = () => router.push(buildOrgPath("/admin/channels"));
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
          class="w-64 border-r t-border t-bg-alt overflow-y-auto hidden md:block"
        >
          <div class="p-4 border-b t-border flex items-center gap-2.5">
            <NuxtLink
              :to="buildOrgPath('/')"
              class="inline-flex items-center justify-center w-8 h-8 rounded-full t-bg-subtle hover:opacity-80 shrink-0"
              title="Back to dashboard"
            >
              <Icon name="lucide:chevron-left" class="w-4 h-4" />
            </NuxtLink>
            <h1 class="font-semibold text-lg truncate">{{ orgName }}</h1>
          </div>

          <ChannelsList
            v-if="orgId"
            :organization-id="orgId"
            :selected-channel-slug="channelSlug"
            :is-admin="isAdmin"
            @select="handleChannelSelect"
            @create="showCreateModal = true"
          />
        </aside>

        <!-- Thread -->
        <ChannelsChannelThread
          v-if="orgId"
          :organization-id="orgId"
          :channel-slug="channelSlug"
          :is-admin="isAdmin"
          :can-manage="canManage"
          :highlight-message-id="highlightMessageId"
          @back="backToList"
          @archived="backToList"
          @deleted="backToList"
        />

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
