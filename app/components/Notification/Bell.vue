<script setup lang="ts">
import type {
  UnifiedNotification,
  NotificationType,
} from "#core/app/composables/useNotifications";
import { groupByDate } from "#core/shared/notifications/grouping";
import { BUILDING_FEED_PATH } from "#core/shared/app/destinations";

const bell = useNotifications();
const {
  notifications,
  getUnseenCount,
  getUnseenCountByType,
  openNotification,
  markAllAsSeen,
  getNotificationStyle,
  formatDate,
} = bell;

// Read history and the inline preference switches are v2 only — the aggregator
// had no history to page through (localStorage held ids, not rows) and no way
// to honour a per-category switch, since nothing on its path ever consulted one.
// Both surfaces hide themselves rather than render dead controls.
const hasArchive = "archivedNotifications" in bell;
const archived = computed<UnifiedNotification[]>(() =>
  hasArchive ? ((bell as any).archivedNotifications.value as UnifiedNotification[]) : []
);
const archivedHasMore = computed(() => (hasArchive ? (bell as any).archivedHasMore.value : false));
const isLoadingArchived = computed(() =>
  hasArchive ? (bell as any).isLoadingArchived.value : false
);

/** Inbox is what's unread; Archive is everything already dealt with. */
const view = ref<"inbox" | "archive">("inbox");
const showPrefs = ref(false);

const prefs = useNotificationPreferences();

watch(view, (mode) => {
  if (mode === "archive" && hasArchive && !archived.value.length) {
    void (bell as any).fetchArchived(true);
  }
});


type FilterKey = "all" | NotificationType;

// Get org navigation helpers for building correct paths
const { buildOrgPath } = useOrgNavigation();

// The dropdown's "see everything" footer. Announcements lost their own page in
// Phase 9 and now render as Building-feed cards, so the footer points there —
// but only when the org actually has the feed module on, since the Building tab
// silently falls back to Overview when it doesn't. A link that lands somewhere
// other than what it says is worse than no link.
const { isEnabled } = useModules();
const feedEnabled = computed(() => isEnabled("feed"));
const buildingFeedPath = computed(() => buildOrgPath(BUILDING_FEED_PATH));

// Dropdown state
const isOpen = ref(false);
const dropdownRef = ref<HTMLElement | null>(null);
const buttonRef = ref<HTMLElement | null>(null);

// Active filter tab
const activeFilter = ref<FilterKey>("all");

// Filter the visible list by type. Which list that is depends on the view:
// the live inbox, or the paged read history.
const visibleNotifications = computed<UnifiedNotification[]>(() =>
  view.value === "archive" ? archived.value : (notifications.value as UnifiedNotification[])
);

const filteredNotifications = computed(() => {
  if (activeFilter.value === "all") return visibleNotifications.value;
  return visibleNotifications.value.filter((n) => n.type === activeFilter.value);
});

// Date-grouped sections (Today / Yesterday / Earlier this week / Older), each
// carrying a running offset so the entrance stagger flows across the whole list.
const groupedNotifications = computed(() => {
  const groups = groupByDate(filteredNotifications.value as UnifiedNotification[]);
  let offset = 0;
  return groups.map((g) => {
    const withOffset = { ...g, offset };
    offset += g.items.length;
    return withOffset;
  });
});

// Category tabs — "all" plus one chip per notification type. Each chip shows
// its unread count and only the categories present (or "all") are rendered.
const TAB_DEFS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "announcement", label: "Announcements" },
  { key: "meeting", label: "Meetings" },
  { key: "payment", label: "Payments" },
  { key: "document", label: "Documents" },
  { key: "membership", label: "Members" },
  { key: "request", label: "Requests" },
  { key: "task", label: "Tasks" },
  { key: "comment", label: "Comments" },
  { key: "mention", label: "Mentions" },
  { key: "email", label: "Email" },
];

const tabs = computed(() =>
  TAB_DEFS.filter(
    (t) =>
      t.key === "all" ||
      visibleNotifications.value.some((n) => n.type === t.key)
  ).map((t) => ({
    ...t,
    count:
      t.key === "all"
        ? getUnseenCount.value
        : getUnseenCountByType(t.key as NotificationType),
  }))
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
  if (isOpen.value) void prefs.load();
};

const togglePrefs = () => {
  showPrefs.value = !showPrefs.value;
  if (showPrefs.value) void prefs.load();
};

const onTogglePref = async (key: string) => {
  const ok = await prefs.toggleBell(key as never);
  if (!ok) console.warn("[bell] could not save the preference for", key);
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
    meeting: "Meeting",
    payment: "Payment",
    document: "Document",
    membership: "Member",
    comment: "Comment",
    request: "Request",
    task: "Task",
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
      class="header-pill relative inline-flex items-center justify-center"
      :class="{ 'animate-bell-ring': shouldAnimate, 'is-active': isOpen }"
      :aria-label="`Notifications${getUnseenCount > 0 ? ` (${getUnseenCount} unread)` : ''}`"
    >
      <Icon name="lucide:bell" class="w-4 h-4" />

      <!-- Unseen Badge -->
      <span
        v-if="getUnseenCount > 0"
        class="notif-badge absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[18px] h-[18px] px-1 text-xs font-medium text-white bg-red-500 rounded-full"
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
        class="absolute right-0 z-50 mt-2 w-80 sm:w-[420px] origin-top-right rounded-xl t-bg-elevated shadow-xl ring-1 t-border focus:outline-none overflow-hidden"
      >
        <!-- Header -->
        <div class="flex items-center justify-between px-4 py-3 border-b t-border-divider">
          <h3 class="font-semibold t-text">Notifications</h3>
          <div class="flex items-center gap-3">
            <button
              v-if="getUnseenCount > 0 && view === 'inbox'"
              @click="handleMarkAllAsRead"
              class="text-xs t-text-muted hover:t-text transition-colors"
            >
              Mark all as read
            </button>
            <button
              v-if="hasArchive"
              @click="togglePrefs"
              class="t-text-muted hover:t-text transition-colors"
              :aria-label="showPrefs ? 'Close notification settings' : 'Notification settings'"
              :aria-pressed="showPrefs"
            >
              <Icon :name="showPrefs ? 'lucide:x' : 'lucide:settings-2'" class="w-4 h-4" />
            </button>
          </div>
        </div>

        <!-- Which switches are on. Right here, because the moment someone wants
             to silence a category is the moment it just interrupted them. -->
        <div v-if="showPrefs" class="px-4 py-3 border-b t-border-divider t-bg-subtle">
          <p class="text-[11px] font-semibold uppercase tracking-wider t-text-muted mb-2">
            Show me notifications for
          </p>
          <div class="grid grid-cols-2 gap-x-4 gap-y-1">
            <label
              v-for="c in prefs.categories"
              :key="c.key"
              class="flex items-center gap-2 py-1 text-sm t-text-secondary cursor-pointer"
            >
              <input
                type="checkbox"
                class="rounded"
                :checked="prefs.bellEnabled(c.key)"
                @change="onTogglePref(c.key)"
              />
              <span>{{ c.label }}</span>
            </label>
          </div>
          <p class="mt-2 text-[11px] t-text-muted">
            Email and digest settings live on your account page.
          </p>
        </div>

        <!-- Unread vs. history. Read state lives on the row now, so history is
             a real, cross-device list rather than whatever this browser
             remembered. -->
        <div v-if="hasArchive" class="flex gap-1 px-3 pt-2">
          <button
            v-for="mode in (['inbox', 'archive'] as const)"
            :key="mode"
            @click="view = mode"
            class="px-3 py-1.5 text-xs font-medium rounded-lg transition-colors"
            :class="view === mode ? 't-bg-subtle t-text' : 't-text-muted hover:t-text'"
          >
            {{ mode === 'inbox' ? 'Unread' : 'Earlier' }}
            <span v-if="mode === 'inbox' && getUnseenCount > 0" class="ml-1 t-text-accent">
              {{ getUnseenCount > 9 ? "9+" : getUnseenCount }}
            </span>
          </button>
        </div>

        <!-- Filter Chips (horizontally scrollable) -->
        <div class="flex gap-1.5 overflow-x-auto px-3 py-2 border-b t-border-divider no-scrollbar">
          <button
            v-for="tab in tabs"
            :key="tab.key"
            @click="activeFilter = tab.key"
            class="flex-shrink-0 inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-full transition-colors"
            :class="
              activeFilter === tab.key
                ? 'shadow-sm'
                : 't-bg-subtle t-text-secondary hover:t-bg'
            "
            :style="
              activeFilter === tab.key
                ? { background: 'var(--theme-accent-primary)', color: '#fff' }
                : undefined
            "
          >
            {{ tab.label }}
            <span
              v-if="tab.count > 0"
              class="inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 text-[10px] font-semibold rounded-full"
              :class="activeFilter === tab.key ? 'bg-white/25 text-white' : 't-bg-accent/20 t-text-accent'"
            >
              {{ tab.count > 9 ? "9+" : tab.count }}
            </span>
          </button>
        </div>

        <!-- Notifications List -->
        <div class="max-h-[420px] overflow-y-auto">
          <div v-if="filteredNotifications.length === 0" class="px-4 py-8 text-center">
            <Icon
              :name="view === 'archive' ? 'lucide:archive' : 'lucide:inbox'"
              class="w-8 h-8 t-text-muted mx-auto mb-2 opacity-60"
            />
            <p class="text-sm t-text-muted">
              {{ view === "archive" ? "Nothing here yet" : "You're all caught up" }}
            </p>
          </div>

          <template v-else>
            <section v-for="group in groupedNotifications" :key="group.key">
              <!-- Date section header -->
              <p
                class="sticky top-0 z-10 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wider t-text-muted t-bg-subtle"
              >
                {{ group.label }}
              </p>
              <div class="divide-y t-border-divider">
                <button
                  v-for="(notification, ii) in group.items"
                  :key="notification.id"
                  @click="handleNotificationClick(notification)"
                  class="stagger-item w-full px-4 py-3 text-left hover:t-bg-subtle transition-colors flex gap-3"
                  :style="
                    !notification.isRead
                      ? { background: 'color-mix(in srgb, var(--theme-accent-primary) 6%, transparent)' }
                      : undefined
                  "
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
                        class="text-sm font-medium t-text truncate"
                        :class="{ 'font-semibold': !notification.isRead }"
                      >
                        {{ notification.title }}
                      </h4>
                      <!-- Unseen indicator -->
                      <span
                        v-if="!notification.isRead"
                        class="flex-shrink-0 w-2 h-2 mt-1.5 rounded-full"
                        style="background: var(--theme-accent-primary)"
                      />
                    </div>

                    <!-- Subtitle -->
                    <p v-if="notification.subtitle" class="text-xs t-text-muted truncate">
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
                      <span class="text-xs t-text-muted">
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
            </section>

            <div v-if="view === 'archive' && archivedHasMore" class="px-4 py-3 text-center">
              <button
                class="text-xs t-text-secondary hover:t-text transition-colors disabled:opacity-50"
                :disabled="isLoadingArchived"
                @click="(bell as any).loadMoreArchived()"
              >
                {{ isLoadingArchived ? "Loading…" : "Load more" }}
              </button>
            </div>
          </template>
        </div>

        <!-- Footer -->
        <div v-if="feedEnabled" class="px-4 py-3 border-t t-border-divider t-bg-subtle">
          <NuxtLink
            :to="buildingFeedPath"
            class="block text-center text-sm t-text-secondary hover:t-text transition-colors"
            @click="isOpen = false"
          >
            Open the building feed
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

/* Unread badge springs in (badge-pop keyframe is global, earnest-ui.css). */
.notif-badge {
  transform-origin: center;
  animation: badge-pop var(--motion-base, 240ms)
    var(--spring, cubic-bezier(0.36, 0.66, 0.04, 1)) both;
}

@media (prefers-reduced-motion: reduce) {
  .animate-bell-ring {
    animation: none;
  }
  .notif-badge {
    animation: none;
  }
}

/* Hide the horizontal scrollbar on the filter chip row */
.no-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
.no-scrollbar::-webkit-scrollbar {
  display: none;
}
</style>
