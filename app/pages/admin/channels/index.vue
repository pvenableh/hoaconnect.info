<script setup lang="ts">
import type { HoaChannel } from "~~/types/directus";

definePageMeta({
  middleware: ["admin", "subscription"],
  layout: "auth",
});

const router = useRouter();
const { selectedOrgId, isAdmin, currentOrg } = await useSelectedOrg();

// Redirect if no organization selected
if (!selectedOrgId.value) {
  return navigateTo("/organizations");
}

const showCreateModal = ref(false);

// Handle channel selection
const handleChannelSelect = (channel: HoaChannel) => {
  router.push(`/admin/channels/${channel.slug}`);
};

// Handle channel creation
const handleChannelCreated = (channel: any) => {
  router.push(`/admin/channels/${channel.slug}`);
};
</script>

<template>
  <div class="flex h-[calc(100vh-4rem)]">
    <!-- Sidebar with Channels List -->
    <aside
      class="w-64 border-r border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900 overflow-y-auto"
    >
      <div class="p-4 border-b border-stone-200 dark:border-stone-800">
        <h1 class="font-semibold text-lg">
          {{ currentOrg?.organization?.name || "Channels" }}
        </h1>
      </div>

      <ChannelsChannelsList
        v-if="selectedOrgId"
        :organization-id="selectedOrgId"
        :is-admin="isAdmin"
        @select="handleChannelSelect"
        @create="showCreateModal = true"
      />
    </aside>

    <!-- Main Content - Welcome/Select Channel -->
    <main class="flex-1 flex items-center justify-center bg-white dark:bg-stone-900">
      <div class="text-center max-w-md px-4">
        <div
          class="w-16 h-16 mx-auto mb-6 rounded-full bg-primary/10 flex items-center justify-center"
        >
          <Icon name="lucide:message-square" class="w-8 h-8 text-primary" />
        </div>
        <h2 class="text-2xl font-semibold mb-2">Welcome to Channels</h2>
        <p class="text-stone-500 mb-6">
          Select a channel from the sidebar to start communicating with your
          team, or create a new one.
        </p>
        <Button v-if="isAdmin" @click="showCreateModal = true">
          <Icon name="lucide:plus" class="w-4 h-4 mr-2" />
          Create Channel
        </Button>
      </div>
    </main>

    <!-- Create Channel Modal -->
    <ChannelsCreateChannelModal
      v-if="selectedOrgId"
      v-model:open="showCreateModal"
      :organization-id="selectedOrgId"
      @created="handleChannelCreated"
    />
  </div>
</template>
