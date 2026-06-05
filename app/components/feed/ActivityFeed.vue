<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    organizationId: string | null;
    isBoard?: boolean;
    isMember?: boolean;
    audienceFilter?: string[];
  }>(),
  { isBoard: false, isMember: true, audienceFilter: () => ["all"] }
);

const { items, isLoading, fetchFeed } = useActivityFeed();

const KIND_TABS = [
  { key: "all", label: "All" },
  { key: "announcement", label: "Announcements" },
  { key: "meeting", label: "Meetings" },
  { key: "document", label: "Documents" },
  { key: "poll", label: "Polls" },
  { key: "request", label: "My Requests" },
];
const activeKind = ref<string>("all");

const filtered = computed(() =>
  activeKind.value === "all"
    ? items.value
    : items.value.filter((i) => i.kind === activeKind.value)
);

onMounted(() => fetchFeed(props.audienceFilter));
watch(
  () => props.audienceFilter,
  () => fetchFeed(props.audienceFilter),
  { deep: true }
);
</script>

<template>
  <div class="space-y-4">
    <!-- Filter chips -->
    <div class="flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1">
      <button
        v-for="tab in KIND_TABS"
        :key="tab.key"
        @click="activeKind = tab.key"
        class="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors"
        :class="activeKind === tab.key ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'"
      >
        {{ tab.label }}
      </button>
    </div>

    <div v-if="isLoading" class="py-16 flex justify-center"><div class="spinner-ios" /></div>

    <div v-else-if="filtered.length" class="space-y-4">
      <FeedFeedItem
        v-for="item in filtered"
        :key="item.id"
        :item="item"
        :organization-id="organizationId"
        :is-board="isBoard"
        :is-member="isMember"
      />
    </div>

    <div v-else class="py-20 text-center">
      <div class="w-14 h-14 rounded-full bg-stone-100 flex items-center justify-center mx-auto mb-3">
        <Icon name="lucide:newspaper" class="w-7 h-7 text-stone-400" />
      </div>
      <p class="text-stone-500">Nothing in the feed yet.</p>
    </div>
  </div>
</template>

<style scoped>
.no-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
.no-scrollbar::-webkit-scrollbar {
  display: none;
}
</style>
