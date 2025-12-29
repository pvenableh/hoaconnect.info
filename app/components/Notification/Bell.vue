<script setup lang="ts">
import type { UnifiedNotification } from "~/composables/useNotifications";

const {
  notifications,
  getUnseenCount,
  openNotification,
  markAllAsSeen,
  getNotificationStyle,
  formatDate,
} = useNotifications();

// Get org navigation helpers for building correct paths
const { buildOrgPath } = useOrgNavigation();

// Build paths for each notification type
const announcementsPath = computed(() => buildOrgPath("/announcements"));

// Dropdown state
const isOpen = ref(false);
const dropdownRef = ref<HTMLElement | null>(null);
const buttonRef = ref<HTMLElement | null>(null);

// Active filter tab
const activeFilter = ref<"all" | "announcement" | "mention" | "email">("all");

// Filter notifications by type
const filteredNotifications = computed(() => {
  if (activeFilter.value === "all") {
    return notifications.value;
  }
  return notifications.value.filter((n) => n.type === activeFilter.value);
});

// Get counts by type
const announcementCount = computed(
  () => notifications.value.filter((n) => n.type === "announcement" && !n.isRead).length
);
const mentionCount = computed(
  () => notifications.value.filter((n) => n.type === "mention" && !n.isRead).length
);
const emailCount = computed(
  () => notifications.value.filter((n) => n.type === "email" && !n.isRead).length
);

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

// Handle notification click
const handleNotificationClick = (notification: UnifiedNotification) => {
  openNotification(notification);
  isOpen.value = false;
};

// Mark all as read
const handleMarkAllAsRead = async () => {
  await markAllAsSeen();
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

// Bell animation when there are unseen notifications
const shouldAnimate = computed(() => getUnseenCount.value > 0);

// Get type label
const getTypeLabel = (type: string) => {
  const labels: Record<string, string> = {
    announcement: "Announcement",
    mention: "Mention",
    email: "Email",
  };
  return labels[type] || type;
};
</script>

<template>
  <div class="relative">
    <!-- Bell Button -->
    <button
      ref="buttonRef"
      @click="toggleDropdown"
      class="relative p-2 rounded-lg hover:bg-stone-100 transition-colors focus:outline-none focus:ring-2 focus:ring-stone-300"
      :class="{ 'animate-bell-ring': shouldAnimate }"
      :aria-label="`Notifications${getUnseenCount > 0 ? ` (${getUnseenCount} unread)` : ''}`"
    >
      <Icon name="lucide:bell" class="w-5 h-5 text-stone-600" />

      <!-- Unseen Badge -->
      <span
        v-if="getUnseenCount > 0"
        class="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[18px] h-[18px] px-1 text-xs font-medium text-white bg-red-500 rounded-full"
      >
        {{ getUnseenCount > 9 ? "9+" : getUnseenCount }}
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
        class="absolute right-0 z-50 mt-2 w-80 sm:w-[420px] origin-top-right rounded-lg bg-white shadow-lg ring-1 ring-stone-200 focus:outline-none"
      >
        <!-- Header -->
        <div class="flex items-center justify-between px-4 py-3 border-b border-stone-100">
          <h3 class="font-semibold text-stone-900">Notifications</h3>
          <button
            v-if="getUnseenCount > 0"
            @click="handleMarkAllAsRead"
            class="text-xs text-stone-500 hover:text-stone-700 transition-colors"
          >
            Mark all as read
          </button>
        </div>

        <!-- Filter Tabs -->
        <div class="flex border-b border-stone-100">
          <button
            v-for="tab in [
              { key: 'all', label: 'All', count: getUnseenCount },
              { key: 'announcement', label: 'Announcements', count: announcementCount },
              { key: 'mention', label: 'Mentions', count: mentionCount },
              { key: 'email', label: 'Emails', count: emailCount },
            ]"
            :key="tab.key"
            @click="activeFilter = tab.key as any"
            class="flex-1 px-3 py-2 text-xs font-medium transition-colors relative"
            :class="
              activeFilter === tab.key
                ? 'text-stone-900 border-b-2 border-stone-900'
                : 'text-stone-500 hover:text-stone-700'
            "
          >
            {{ tab.label }}
            <span
              v-if="tab.count > 0"
              class="ml-1 inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 text-[10px] font-medium rounded-full"
              :class="
                activeFilter === tab.key
                  ? 'bg-stone-900 text-white'
                  : 'bg-stone-200 text-stone-600'
              "
            >
              {{ tab.count > 9 ? "9+" : tab.count }}
            </span>
          </button>
        </div>

        <!-- Notifications List -->
        <div class="max-h-[400px] overflow-y-auto">
          <div v-if="filteredNotifications.length === 0" class="px-4 py-8 text-center">
            <Icon name="lucide:inbox" class="w-8 h-8 text-stone-300 mx-auto mb-2" />
            <p class="text-sm text-stone-500">No notifications</p>
          </div>

          <div v-else class="divide-y divide-stone-100">
            <button
              v-for="notification in filteredNotifications"
              :key="notification.id"
              @click="handleNotificationClick(notification)"
              class="w-full px-4 py-3 text-left hover:bg-stone-50 transition-colors flex gap-3"
              :class="{
                'bg-stone-50/50': !notification.isRead,
              }"
            >
              <!-- Type Icon -->
              <div
                class="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center"
                :class="[
                  getNotificationStyle(notification).bg,
                  getNotificationStyle(notification).text,
                ]"
              >
                <Icon
                  :name="'lucide:' + getNotificationStyle(notification).icon"
                  class="w-4 h-4"
                />
              </div>

              <!-- Content -->
              <div class="flex-1 min-w-0">
                <div class="flex items-start justify-between gap-2">
                  <h4
                    class="text-sm font-medium text-stone-900 truncate"
                    :class="{ 'font-semibold': !notification.isRead }"
                  >
                    {{ notification.title }}
                  </h4>
                  <!-- Unseen indicator -->
                  <span
                    v-if="!notification.isRead"
                    class="flex-shrink-0 w-2 h-2 mt-1.5 rounded-full bg-blue-500"
                  />
                </div>

                <!-- Subtitle -->
                <p v-if="notification.subtitle" class="text-xs text-stone-500 truncate">
                  {{ notification.subtitle }}
                </p>

                <!-- Meta -->
                <div class="flex items-center gap-2 mt-0.5">
                  <span
                    class="text-xs px-1.5 py-0.5 rounded"
                    :class="[
                      getNotificationStyle(notification).bg,
                      getNotificationStyle(notification).text,
                    ]"
                  >
                    {{ getTypeLabel(notification.type) }}
                  </span>
                  <span class="text-xs text-stone-400">
                    {{ formatDate(notification.date) }}
                  </span>
                  <span
                    v-if="notification.priority === 'urgent'"
                    class="text-xs text-red-600 font-medium"
                  >
                    Urgent
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
