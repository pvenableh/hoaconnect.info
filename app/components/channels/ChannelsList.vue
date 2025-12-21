<script setup lang="ts">
import type { HoaChannel } from "~~/types/directus";

const props = defineProps<{
  organizationId: string;
  selectedChannelSlug?: string;
}>();

const emit = defineEmits<{
  (e: "select", channel: HoaChannel): void;
  (e: "create"): void;
}>();

const { isAdmin } = await useSelectedOrg();

// Fetch channels for the organization
const { data: channels, isLoading, error, refresh } = useRealtimeSubscription<HoaChannel>(
  "hoa_channels",
  [
    "id",
    "name",
    "slug",
    "description",
    "is_private",
    "is_default",
    "status",
  ],
  {
    organization: { _eq: props.organizationId },
    status: { _eq: "published" },
  },
  "name"
);

// Group channels by type
const publicChannels = computed(() =>
  channels.value?.filter((c) => !c.is_private) || []
);

const privateChannels = computed(() =>
  channels.value?.filter((c) => c.is_private) || []
);

const selectChannel = (channel: HoaChannel) => {
  emit("select", channel);
};
</script>

<template>
  <div class="channels-list">
    <!-- Header -->
    <div class="flex items-center justify-between px-3 py-2">
      <h2 class="text-sm font-semibold text-stone-500 dark:text-stone-400 uppercase tracking-wide">
        Channels
      </h2>
      <Button
        v-if="isAdmin"
        variant="ghost"
        size="sm"
        class="h-6 w-6 p-0"
        @click="emit('create')"
      >
        <Icon name="lucide:plus" class="w-4 h-4" />
      </Button>
    </div>

    <!-- Loading State -->
    <div v-if="isLoading" class="px-3 space-y-2">
      <div
        v-for="n in 4"
        :key="n"
        class="h-8 bg-stone-100 dark:bg-stone-800 rounded animate-pulse"
      />
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="px-3 py-4 text-center">
      <p class="text-sm text-red-500 mb-2">Failed to load channels</p>
      <Button variant="outline" size="sm" @click="refresh">
        <Icon name="lucide:refresh-cw" class="w-4 h-4 mr-1" />
        Retry
      </Button>
    </div>

    <!-- Channels List -->
    <div v-else class="space-y-4">
      <!-- Public Channels -->
      <div v-if="publicChannels.length" class="space-y-0.5">
        <button
          v-for="channel in publicChannels"
          :key="channel.id"
          class="w-full flex items-center gap-2 px-3 py-1.5 text-left rounded-md transition-colors"
          :class="[
            selectedChannelSlug === channel.slug
              ? 'bg-primary/10 text-primary font-medium'
              : 'text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800',
          ]"
          @click="selectChannel(channel)"
        >
          <Icon name="lucide:hash" class="w-4 h-4 shrink-0 opacity-50" />
          <span class="truncate text-sm">{{ channel.name }}</span>
          <Badge
            v-if="channel.is_default"
            variant="secondary"
            class="ml-auto text-xs py-0"
          >
            default
          </Badge>
        </button>
      </div>

      <!-- Private Channels -->
      <div v-if="privateChannels.length">
        <div class="flex items-center gap-2 px-3 py-1 text-xs font-medium text-stone-500 uppercase">
          <Icon name="lucide:lock" class="w-3 h-3" />
          Private
        </div>
        <div class="space-y-0.5">
          <button
            v-for="channel in privateChannels"
            :key="channel.id"
            class="w-full flex items-center gap-2 px-3 py-1.5 text-left rounded-md transition-colors"
            :class="[
              selectedChannelSlug === channel.slug
                ? 'bg-primary/10 text-primary font-medium'
                : 'text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800',
            ]"
            @click="selectChannel(channel)"
          >
            <Icon name="lucide:lock" class="w-4 h-4 shrink-0 opacity-50" />
            <span class="truncate text-sm">{{ channel.name }}</span>
          </button>
        </div>
      </div>

      <!-- Empty State -->
      <div
        v-if="!publicChannels.length && !privateChannels.length"
        class="px-3 py-8 text-center"
      >
        <Icon
          name="lucide:message-square-plus"
          class="w-10 h-10 mx-auto mb-3 text-stone-300 dark:text-stone-600"
        />
        <p class="text-sm text-stone-500 mb-3">No channels yet</p>
        <Button
          v-if="isAdmin"
          variant="outline"
          size="sm"
          @click="emit('create')"
        >
          <Icon name="lucide:plus" class="w-4 h-4 mr-1" />
          Create Channel
        </Button>
      </div>
    </div>
  </div>
</template>
