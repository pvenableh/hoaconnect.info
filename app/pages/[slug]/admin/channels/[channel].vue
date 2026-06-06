<script setup lang="ts">
import type { HoaChannel } from "~~/types/directus";

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
          class="w-64 border-r border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900 overflow-y-auto hidden md:block"
        >
          <div class="p-4 border-b border-stone-200 dark:border-stone-800 flex items-center gap-2.5">
            <NuxtLink
              :to="buildOrgPath('/dashboard')"
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
