<script setup lang="ts">
import type { HoaAnnouncement } from "~~/types/directus";

const props = defineProps<{
  announcements: HoaAnnouncement[];
}>();

const {
  isSeen,
  getUnseenCount,
  openAnnouncement,
  markAllAsSeen,
  getTypeClasses,
  formatShortDate,
  expiresSoon,
} = useAnnouncements();

// Get org navigation helpers for building correct paths
const { buildOrgPath } = useOrgNavigation();

// Build announcements page path
const announcementsPath = computed(() => buildOrgPath("/announcements"));

// Dropdown state
const isOpen = ref(false);
const dropdownRef = ref<HTMLElement | null>(null);
const buttonRef = ref<HTMLElement | null>(null);

// Computed unseen count (reactive)
const unseenCount = computed(() => getUnseenCount(props.announcements));

// Track seen state reactively for UI updates
const seenState = ref<Record<string, boolean>>({});

// Update seen state when announcements change
watch(
  () => props.announcements,
  () => {
    seenState.value = props.announcements.reduce(
      (acc, a) => {
        acc[a.id] = isSeen(a.id);
        return acc;
      },
      {} as Record<string, boolean>
    );
  },
  { immediate: true, deep: true }
);

// Check if specific announcement is seen (reactive via seenState)
const isAnnouncementSeen = (id: string) => {
  return seenState.value[id] ?? isSeen(id);
};

// Close dropdown when clicking outside
const handleClickOutside = (event: MouseEvent) => {
  if (
    dropdownRef.value &&
    !dropdownRef.value.contains(event.target as Node) &&
    buttonRef.value &&
    !buttonRef.value.contains(event.target as Node)
  ) {
    isOpen.value = false;
  }
};

// Handle announcement click
const handleAnnouncementClick = (announcement: HoaAnnouncement) => {
  openAnnouncement(announcement);
  seenState.value[announcement.id] = true;
  isOpen.value = false;
};

// Mark all as read
const handleMarkAllAsRead = () => {
  markAllAsSeen(props.announcements);
  seenState.value = props.announcements.reduce(
    (acc, a) => {
      acc[a.id] = true;
      return acc;
    },
    {} as Record<string, boolean>
  );
};

// Toggle dropdown
const toggleDropdown = () => {
  isOpen.value = !isOpen.value;
};

// Setup event listeners
onMounted(() => {
  document.addEventListener("click", handleClickOutside);
});

onUnmounted(() => {
  document.removeEventListener("click", handleClickOutside);
});

// Bell animation when there are unseen announcements
const shouldAnimate = computed(() => unseenCount.value > 0);
</script>

<template>
  <div class="relative">
    <!-- Bell Button -->
    <button
      ref="buttonRef"
      @click="toggleDropdown"
      class="relative p-2 rounded-lg hover:bg-stone-100 transition-colors focus:outline-none focus:ring-2 focus:ring-stone-300"
      :class="{ 'animate-bell-ring': shouldAnimate }"
      :aria-label="`Announcements${unseenCount > 0 ? ` (${unseenCount} unread)` : ''}`"
    >
      <Icon name="lucide:bell" class="w-5 h-5 text-stone-600" />

      <!-- Unseen Badge -->
      <span
        v-if="unseenCount > 0"
        class="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[18px] h-[18px] px-1 text-xs font-medium text-white bg-red-500 rounded-full"
      >
        {{ unseenCount > 9 ? "9+" : unseenCount }}
      </span>
    </button>

    <!-- Dropdown -->
    <Transition
      enter-active-class="transition duration-150 ease-out"
      enter-from-class="opacity-0 scale-95"
      enter-to-class="opacity-100 scale-100"
      leave-active-class="transition duration-100 ease-in"
      leave-from-class="opacity-100 scale-100"
      leave-to-class="opacity-0 scale-95"
    >
      <div
        v-if="isOpen"
        ref="dropdownRef"
        class="absolute right-0 z-50 mt-2 w-80 sm:w-96 origin-top-right rounded-lg bg-white shadow-lg ring-1 ring-stone-200 focus:outline-none"
      >
        <!-- Header -->
        <div class="flex items-center justify-between px-4 py-3 border-b border-stone-100">
          <h3 class="font-semibold text-stone-900">Announcements</h3>
          <button
            v-if="unseenCount > 0"
            @click="handleMarkAllAsRead"
            class="text-xs text-stone-500 hover:text-stone-700 transition-colors"
          >
            Mark all as read
          </button>
        </div>

        <!-- Announcements List -->
        <div class="max-h-[400px] overflow-y-auto">
          <div v-if="announcements.length === 0" class="px-4 py-8 text-center">
            <Icon name="lucide:megaphone" class="w-8 h-8 text-stone-300 mx-auto mb-2" />
            <p class="text-sm text-stone-500">No announcements</p>
          </div>

          <div v-else class="divide-y divide-stone-100">
            <button
              v-for="announcement in announcements"
              :key="announcement.id"
              @click="handleAnnouncementClick(announcement)"
              class="w-full px-4 py-3 text-left hover:bg-stone-50 transition-colors flex gap-3"
              :class="{
                'bg-stone-50/50': !isAnnouncementSeen(announcement.id),
              }"
            >
              <!-- Type Icon -->
              <div
                class="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center"
                :class="[
                  getTypeClasses(announcement.announcement_type).bg,
                  getTypeClasses(announcement.announcement_type).text,
                ]"
              >
                <Icon
                  :name="'lucide:' + getTypeClasses(announcement.announcement_type).icon"
                  class="w-4 h-4"
                />
              </div>

              <!-- Content -->
              <div class="flex-1 min-w-0">
                <div class="flex items-start justify-between gap-2">
                  <h4
                    class="text-sm font-medium text-stone-900 truncate"
                    :class="{ 'font-semibold': !isAnnouncementSeen(announcement.id) }"
                  >
                    {{ announcement.title }}
                  </h4>
                  <!-- Unseen indicator -->
                  <span
                    v-if="!isAnnouncementSeen(announcement.id)"
                    class="flex-shrink-0 w-2 h-2 mt-1.5 rounded-full bg-blue-500"
                  />
                </div>

                <!-- Meta -->
                <div class="flex items-center gap-2 mt-0.5">
                  <span
                    class="text-xs px-1.5 py-0.5 rounded"
                    :class="[
                      getTypeClasses(announcement.announcement_type).bg,
                      getTypeClasses(announcement.announcement_type).text,
                    ]"
                  >
                    {{ getTypeClasses(announcement.announcement_type).label }}
                  </span>
                  <span class="text-xs text-stone-400">
                    {{ formatShortDate(announcement.publish_date || announcement.date_created) }}
                  </span>
                  <span
                    v-if="announcement.is_pinned"
                    class="text-xs text-amber-600"
                  >
                    <Icon name="lucide:pin" class="w-3 h-3 inline" />
                  </span>
                  <span
                    v-if="expiresSoon(announcement)"
                    class="text-xs text-orange-600"
                  >
                    Expires soon
                  </span>
                </div>
              </div>
            </button>
          </div>
        </div>

        <!-- Footer -->
        <div class="px-4 py-3 border-t border-stone-100 bg-stone-50/50">
          <NuxtLink
            :to="announcementsPath"
            class="block text-center text-sm text-stone-600 hover:text-stone-900 transition-colors"
            @click="isOpen = false"
          >
            View all announcements
          </NuxtLink>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
@keyframes bell-ring {
  0% {
    transform: rotate(0);
  }
  10% {
    transform: rotate(15deg);
  }
  20% {
    transform: rotate(-15deg);
  }
  30% {
    transform: rotate(10deg);
  }
  40% {
    transform: rotate(-10deg);
  }
  50% {
    transform: rotate(5deg);
  }
  60% {
    transform: rotate(-5deg);
  }
  70% {
    transform: rotate(0);
  }
  100% {
    transform: rotate(0);
  }
}

.animate-bell-ring {
  animation: bell-ring 1s ease-in-out;
  animation-delay: 0.5s;
}
</style>
