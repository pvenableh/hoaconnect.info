<script setup lang="ts">
import type { HoaChannel } from "~~/types/directus";

const props = defineProps<{
  organizationId: string;
  selectedChannelSlug?: string;
  isAdmin?: boolean;
}>();

const emit = defineEmits<{
  (e: "select", channel: HoaChannel): void;
  (e: "create"): void;
}>();

// Main list shows published (non-archived) channels for the org.
const channelFilter = computed(() => ({
  organization: { _eq: props.organizationId },
  status: { _eq: "published" },
}));

const CHANNEL_FIELDS = [
  "id",
  "name",
  "slug",
  "description",
  "is_private",
  "is_default",
  "is_pinned",
  "status",
  "date_created",
];

// Fetch channels for the organization
const { data: channels, isLoading, error, refresh } = useRealtimeSubscription<HoaChannel>(
  "hoa_channels",
  CHANNEL_FIELDS,
  channelFilter,
  "name"
);

// Latest-activity ordering: most-recently-active channel first (Slack-like).
// We aggregate the max message timestamp per channel; channels with no messages
// fall back to their creation date.
const { aggregate } = useDirectusItems("hoa_channel_messages");
const { list: listArchivedChannels } = useDirectusItems("hoa_channels");
const activity = ref<Record<string, string>>({});

const loadActivity = async () => {
  try {
    const rows = (await aggregate({
      aggregate: { max: ["date_created"] },
      groupBy: ["channel"],
      filter: { status: { _eq: "published" } },
    })) as any[];
    const map: Record<string, string> = {};
    for (const r of rows || []) {
      const cid = typeof r.channel === "string" ? r.channel : r.channel?.id;
      const ts = r.max?.date_created;
      if (cid && ts) map[cid] = ts;
    }
    activity.value = map;
  } catch {
    // Non-fatal: fall back to name order.
  }
};
onMounted(loadActivity);
watch(channels, loadActivity);

const lastActivity = (c: HoaChannel): string =>
  activity.value[c.id] || (c as any).date_created || "";

const byActivityDesc = (a: HoaChannel, b: HoaChannel) =>
  lastActivity(b).localeCompare(lastActivity(a));

// Pinned channels float to the top (sorted among themselves by latest activity).
const pinnedChannels = computed(() =>
  (channels.value?.filter((c) => (c as any).is_pinned) || []).slice().sort(byActivityDesc)
);

// Group the rest by type, each ordered by latest activity. Pinned are excluded
// here so they only appear once (in the Pinned section).
const publicChannels = computed(() =>
  (channels.value?.filter((c) => !c.is_private && !(c as any).is_pinned) || [])
    .slice()
    .sort(byActivityDesc)
);

const privateChannels = computed(() =>
  (channels.value?.filter((c) => c.is_private && !(c as any).is_pinned) || [])
    .slice()
    .sort(byActivityDesc)
);

// Archived channels — lazy-loaded when the section is expanded.
const showArchived = ref(false);
const archived = ref<HoaChannel[]>([]);
const archivedLoaded = ref(false);
const loadArchived = async () => {
  try {
    archived.value = (await listArchivedChannels({
      fields: CHANNEL_FIELDS,
      filter: {
        organization: { _eq: props.organizationId },
        status: { _eq: "archived" },
      },
      sort: ["name"],
      limit: -1,
    })) as HoaChannel[];
  } catch {
    archived.value = [];
  } finally {
    archivedLoaded.value = true;
  }
};
watch(showArchived, (open) => {
  if (open && !archivedLoaded.value) loadArchived();
});

const selectChannel = (channel: HoaChannel) => {
  emit("select", channel);
};
</script>

<template>
  <div class="channels-list">
    <!-- Header -->
    <div class="flex items-center justify-between px-3 py-2">
      <h2 class="text-sm font-semibold t-text-muted uppercase tracking-wide">
        Channels
      </h2>
      <Button
        v-if="props.isAdmin"
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
        class="h-8 t-bg-subtle rounded animate-pulse"
      />
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="px-3 py-4 text-center">
      <p class="text-sm text-red-500 mb-2">Failed to load channels</p>
      <p class="text-xs t-text-muted mb-3">{{ error }}</p>
      <Button variant="outline" size="sm" @click="refresh">
        <Icon name="lucide:refresh-cw" class="w-4 h-4 mr-1" />
        Retry
      </Button>
    </div>

    <!-- Channels List -->
    <div v-else class="space-y-4">
      <!-- Pinned Channels -->
      <div v-if="pinnedChannels.length">
        <div class="flex items-center gap-2 px-3 py-1 text-xs font-medium t-text-muted uppercase">
          <Icon name="lucide:pin" class="w-3 h-3" />
          Pinned
        </div>
        <div class="space-y-0.5">
          <button
            v-for="channel in pinnedChannels"
            :key="channel.id"
            class="w-full flex items-center gap-2 px-3 py-1.5 text-left rounded-md transition-colors"
            :class="[
              selectedChannelSlug === channel.slug
                ? 'bg-primary/10 text-primary font-medium'
                : 't-text-secondary hover:t-bg-subtle',
            ]"
            @click="selectChannel(channel)"
          >
            <Icon
              :name="channel.is_private ? 'lucide:lock' : 'lucide:hash'"
              class="w-4 h-4 shrink-0 opacity-50"
            />
            <span class="truncate text-sm">{{ channel.name }}</span>
            <Icon name="lucide:pin" class="w-3 h-3 ml-auto shrink-0 opacity-40" />
          </button>
        </div>
      </div>

      <!-- Public Channels -->
      <div v-if="publicChannels.length" class="space-y-0.5">
        <button
          v-for="channel in publicChannels"
          :key="channel.id"
          class="w-full flex items-center gap-2 px-3 py-1.5 text-left rounded-md transition-colors"
          :class="[
            selectedChannelSlug === channel.slug
              ? 'bg-primary/10 text-primary font-medium'
              : 't-text-secondary hover:t-bg-subtle',
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
        <div class="flex items-center gap-2 px-3 py-1 text-xs font-medium t-text-muted uppercase">
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
                : 't-text-secondary hover:t-bg-subtle',
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
        v-if="!pinnedChannels.length && !publicChannels.length && !privateChannels.length"
        class="px-3 py-8 text-center"
      >
        <Icon
          name="lucide:message-square-plus"
          class="w-10 h-10 mx-auto mb-3 t-text-muted"
        />
        <p class="text-sm t-text-muted mb-3">No channels yet</p>
        <Button
          v-if="props.isAdmin"
          variant="outline"
          size="sm"
          @click="emit('create')"
        >
          <Icon name="lucide:plus" class="w-4 h-4 mr-1" />
          Create Channel
        </Button>
      </div>

      <!-- Archived (collapsible) -->
      <div class="pt-1">
        <button
          class="w-full flex items-center gap-2 px-3 py-1.5 text-xs font-medium t-text-muted uppercase hover:t-text"
          @click="showArchived = !showArchived"
        >
          <Icon
            :name="showArchived ? 'lucide:chevron-down' : 'lucide:chevron-right'"
            class="w-3.5 h-3.5"
          />
          Archived
          <span v-if="archivedLoaded && archived.length" class="ml-1 normal-case">({{ archived.length }})</span>
        </button>
        <div v-if="showArchived" class="space-y-0.5">
          <button
            v-for="channel in archived"
            :key="channel.id"
            class="w-full flex items-center gap-2 px-3 py-1.5 text-left rounded-md transition-colors t-text-muted hover:t-bg-subtle"
            :class="selectedChannelSlug === channel.slug ? 'bg-primary/10 text-primary font-medium' : ''"
            @click="selectChannel(channel)"
          >
            <Icon name="lucide:archive" class="w-4 h-4 shrink-0 opacity-50" />
            <span class="truncate text-sm">{{ channel.name }}</span>
          </button>
          <p
            v-if="archivedLoaded && !archived.length"
            class="px-3 py-2 text-xs t-text-muted"
          >
            No archived channels.
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
