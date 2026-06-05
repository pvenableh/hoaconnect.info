<script setup lang="ts">
import type { HoaChannel, HoaChannelMessage } from "~~/types/directus";
import { toast } from "vue-sonner";

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
// Org id from the awaited selected-org state — the reliable, app-wide source the
// rest of /[slug]/admin uses (activeHoa can be briefly null on client nav).
const { selectedOrgId, currentOrg } = await useSelectedOrg();
const { isAdminOfCurrentDomain, isBoardMemberOfCurrentDomain } = useCurrentDomainAccess();
const { user: currentUser } = useDirectusAuth();
const { create: createMessage } = useDirectusItems("hoa_channel_messages");
const { create: createMention } = useDirectusItems("hoa_channel_mentions");

const orgId = computed(() => selectedOrgId.value);
const orgName = computed(() => currentOrg.value?.organization?.name || "Channels");
const isAdmin = computed(() => isAdminOfCurrentDomain.value);

const channelSlug = computed(() => route.params.channel as string);
const showCreateModal = ref(false);
const showMembers = ref(false);
const canManageMembers = computed(
  () => isAdmin.value || isBoardMemberOfCurrentDomain.value
);

// In-channel message search (Track E)
const { searchInChannel } = useChannelSearch();
const showSearch = ref(false);
const searchQuery = ref("");
const searchResults = ref<Awaited<ReturnType<typeof searchInChannel>>>([]);
const searching = ref(false);

const runSearch = async () => {
  if (!currentChannel.value?.id || !searchQuery.value.trim()) {
    searchResults.value = [];
    return;
  }
  searching.value = true;
  try {
    searchResults.value = await searchInChannel(
      currentChannel.value.id,
      searchQuery.value
    );
  } finally {
    searching.value = false;
  }
};

const toggleSearch = () => {
  showSearch.value = !showSearch.value;
  if (!showSearch.value) {
    searchQuery.value = "";
    searchResults.value = [];
  }
};

watch(searchQuery, runSearch);

const highlightMessage = (id: string) => {
  nextTick(() => {
    const el = document.getElementById(`msg-${id}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("ring-2", "ring-primary/50");
    setTimeout(() => el.classList.remove("ring-2", "ring-primary/50"), 2000);
  });
};

const goToResult = (id: string) => {
  highlightMessage(id);
  showSearch.value = false;
  searchQuery.value = "";
  searchResults.value = [];
};

// Archive / unarchive (admin + board)
const isArchived = computed(() => (currentChannel.value as any)?.status === "archived");
const archiving = ref(false);
const setArchived = async (archived: boolean) => {
  if (!currentChannel.value?.id) return;
  archiving.value = true;
  try {
    await $fetch("/api/hoa/channels/archive", {
      method: "POST",
      body: { channel: currentChannel.value.id, archived },
    });
    toast.success(archived ? "Channel archived" : "Channel unarchived");
    if (archived) {
      await navigateTo(buildOrgPath("/admin/channels"));
    } else {
      await refreshMessages();
    }
  } catch (e: any) {
    toast.error(e?.data?.message || "Failed to update channel");
  } finally {
    archiving.value = false;
  }
};

// Pin / unpin (admin + board)
const isPinned = computed(() => !!(currentChannel.value as any)?.is_pinned);
const pinning = ref(false);
const setPinned = async (pinned: boolean) => {
  if (!currentChannel.value?.id) return;
  pinning.value = true;
  try {
    await $fetch("/api/hoa/channels/pin", {
      method: "POST",
      body: { channel: currentChannel.value.id, pinned },
    });
    toast.success(pinned ? "Channel pinned" : "Channel unpinned");
  } catch (e: any) {
    toast.error(e?.data?.message || "Failed to update channel");
  } finally {
    pinning.value = false;
  }
};

// Soft-delete (admin + board) — preserves messages/comments, just hides it.
const showDeleteConfirm = ref(false);
const deleting = ref(false);
const deleteChannel = async () => {
  if (!currentChannel.value?.id) return;
  deleting.value = true;
  try {
    await $fetch("/api/hoa/channels/delete", {
      method: "POST",
      body: { channel: currentChannel.value.id },
    });
    toast.success("Channel deleted");
    showDeleteConfirm.value = false;
    await navigateTo(buildOrgPath("/admin/channels"));
  } catch (e: any) {
    toast.error(e?.data?.message || "Failed to delete channel");
  } finally {
    deleting.value = false;
  }
};
const newMessage = ref("");
const messagesContainer = ref<HTMLElement | null>(null);
const editorRef = ref<any>(null);

// Fetch channel data - use computed filter for reactivity
const { data: channels, isLoading: channelLoading } =
  useRealtimeSubscription<HoaChannel>(
    "hoa_channels",
    ["id", "name", "slug", "description", "is_private", "is_pinned", "organization", "status"],
    computed(() => ({
      slug: { _eq: channelSlug.value },
      organization: { _eq: orgId.value },
      status: { _in: ["published", "archived"] },
    }))
  );

const currentChannel = computed(() => channels.value?.[0] || null);

// Back-link to the source ticket, if this channel was spawned from one (Track D).
// Fetched separately so a missing `request` field (pre-migration) can't break the
// realtime channel/message load.
const { get: getChannel } = useDirectusItems("hoa_channels");
const linkedRequest = ref<{ id: string; title?: string } | null>(null);
watch(
  () => currentChannel.value?.id,
  async (id) => {
    linkedRequest.value = null;
    if (!id) return;
    try {
      const ch: any = await getChannel(id, { fields: ["request.id", "request.title"] });
      const r = ch?.request;
      linkedRequest.value = r && typeof r === "object" ? { id: r.id, title: r.title } : null;
    } catch {
      linkedRequest.value = null;
    }
  },
  { immediate: true }
);

// Message fields for subscription
const messageFields = [
  "id",
  "status",
  "content",
  "date_created",
  "is_edited",
  "parent_message",
  "user_created.id",
  "user_created.first_name",
  "user_created.last_name",
  "user_created.avatar",
];

// Fetch messages for the channel (only top-level, not replies)
const {
  data: messages,
  isLoading: messagesLoading,
  isConnected,
  error: messagesError,
  refresh: refreshMessages,
} = useRealtimeSubscription<HoaChannelMessage>(
  "hoa_channel_messages",
  messageFields,
  computed(() => ({
    channel: {
      slug: { _eq: channelSlug.value },
      organization: { _eq: orgId.value },
    },
    status: { _eq: "published" },
    parent_message: { _null: true },
  })),
  "-date_created"
);

// Handle channel selection from sidebar
const handleChannelSelect = (channel: HoaChannel) => {
  router.push(buildOrgPath(`/admin/channels/${channel.slug}`));
};

// Handle channel creation
const handleChannelCreated = (channel: any) => {
  router.push(buildOrgPath(`/admin/channels/${channel.slug}`));
};

// Pending mentions to be saved after message creation
const pendingMentions = ref<Array<{ id: string; label: string }>>([]);

// Handle mention event from editor
const handleMention = (user: { id: string; label: string }) => {
  pendingMentions.value.push(user);
};

// Send message
const sendMessage = async () => {
  const messageText = newMessage.value?.replace(/<[^>]*>/g, "").trim();

  if (!messageText || !currentChannel.value?.id || messagesLoading.value) {
    return;
  }

  try {
    const messageData = {
      content: newMessage.value,
      channel: currentChannel.value.id,
      status: "published",
    };

    const createdMessage = await createMessage(messageData);

    // Create mention records for each mentioned user
    if (pendingMentions.value.length > 0 && createdMessage) {
      for (const mention of pendingMentions.value) {
        try {
          await createMention({
            message: (createdMessage as any).id,
            mentioned_user: mention.id,
            mentioned_by: currentUser.value?.id,
            channel: currentChannel.value.id,
            is_read: false,
          });
        } catch (error) {
          console.error("Error creating mention record:", error);
        }
      }
    }

    // Clear editor
    newMessage.value = "";
    pendingMentions.value = [];
    editorRef.value?.clear();

    // Scroll to bottom
    scrollToBottom();
  } catch (error) {
    console.error("Error sending message:", error);
    toast.error("Failed to send message");
  }
};

// Scroll to bottom of messages
const scrollToBottom = () => {
  if (messagesContainer.value) {
    nextTick(() => {
      messagesContainer.value!.scrollTop =
        messagesContainer.value!.scrollHeight;
    });
  }
};

// Watch messages for changes and scroll
watch(
  messages,
  (newMessages, oldMessages) => {
    if (newMessages?.length > (oldMessages?.length || 0)) {
      scrollToBottom();
    }
  },
  { deep: true }
);

// Initial scroll on mount
onMounted(() => {
  scrollToBottom();
});

// Watch for channel changes
watch(channelSlug, () => {
  newMessage.value = "";
  pendingMentions.value = [];
  searchQuery.value = "";
  searchResults.value = [];
  showSearch.value = false;
});

// Deep-link from org-wide search: /…/<slug>?message=<id> scrolls to that message
// once the channel's messages have loaded.
watch(
  () => [messagesLoading.value, route.query.message] as const,
  ([loading]) => {
    const target = route.query.message as string | undefined;
    if (!loading && target && messages.value?.length) {
      highlightMessage(target);
    }
  },
  { immediate: true }
);
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
        <h1 class="font-semibold text-lg truncate">
          {{ orgName }}
        </h1>
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

    <!-- Main Chat Area -->
    <main class="flex-1 flex flex-col min-h-0 bg-white dark:bg-stone-900">
      <!-- Channel Header -->
      <header
        class="flex items-center justify-between px-4 py-3 border-b border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900"
      >
        <div class="flex items-center gap-3">
          <!-- Mobile back button -->
          <NuxtLink
            :to="buildOrgPath('/admin/channels')"
            class="md:hidden text-stone-500 hover:text-stone-700"
          >
            <Icon name="lucide:chevron-left" class="w-5 h-5" />
          </NuxtLink>

          <div v-if="channelLoading" class="space-y-1">
            <div
              class="h-5 w-32 bg-stone-200 dark:bg-stone-700 rounded animate-pulse"
            />
            <div
              class="h-4 w-48 bg-stone-200 dark:bg-stone-700 rounded animate-pulse"
            />
          </div>

          <div v-else-if="currentChannel">
            <div class="flex items-center gap-2">
              <Icon
                :name="
                  currentChannel.is_private ? 'lucide:lock' : 'lucide:hash'
                "
                class="w-5 h-5 text-stone-500"
              />
              <h1 class="font-semibold text-lg">{{ currentChannel.name }}</h1>
              <span
                v-if="currentChannel.is_private"
                class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium t-bg-subtle t-text-muted"
              >
                <Icon name="lucide:lock" class="w-3 h-3" /> Private
              </span>
              <span
                v-if="isArchived"
                class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700"
              >
                <Icon name="lucide:archive" class="w-3 h-3" /> Archived
              </span>
              <Icon
                v-if="isPinned"
                name="lucide:pin"
                class="w-4 h-4 text-stone-400"
                title="Pinned"
              />
            </div>
            <p
              v-if="currentChannel.description"
              class="text-sm text-stone-500 truncate max-w-md"
            >
              {{ currentChannel.description }}
            </p>
          </div>

          <div v-else>
            <h1 class="font-semibold text-lg text-red-500">
              Channel not found
            </h1>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <!-- Back-link to source ticket -->
          <NuxtLink
            v-if="linkedRequest"
            :to="buildOrgPath(`/admin/requests/${linkedRequest.id}`)"
            class="inline-flex items-center gap-1.5 px-3 h-9 rounded-full t-bg-subtle hover:opacity-80 text-sm"
            title="Source ticket"
          >
            <Icon name="lucide:clipboard-list" class="w-4 h-4" />
            <span class="hidden sm:inline">Ticket</span>
          </NuxtLink>

          <!-- In-channel search -->
          <div v-if="currentChannel" class="relative">
            <button
              class="inline-flex items-center justify-center w-9 h-9 rounded-full t-bg-subtle hover:opacity-80"
              title="Search this channel"
              @click="toggleSearch"
            >
              <Icon name="lucide:search" class="w-4 h-4" />
            </button>
            <div
              v-if="showSearch"
              class="absolute right-0 top-11 z-20 w-80 rounded-xl border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-stone-900 shadow-lg p-3"
            >
              <Input
                v-model="searchQuery"
                placeholder="Search messages…"
                autofocus
              />
              <div class="mt-2 max-h-72 overflow-y-auto">
                <div v-if="searching" class="py-4 flex justify-center">
                  <div class="spinner-ios" />
                </div>
                <template v-else-if="searchResults.length">
                  <button
                    v-for="r in searchResults"
                    :key="r.id"
                    class="w-full text-left px-2 py-2 rounded-lg hover:t-bg-subtle"
                    @click="goToResult(r.id)"
                  >
                    <p class="text-sm t-text line-clamp-2">{{ r.snippet }}</p>
                  </button>
                </template>
                <p
                  v-else-if="searchQuery.trim()"
                  class="text-sm t-text-muted py-3 text-center"
                >
                  No matches.
                </p>
              </div>
            </div>
          </div>
          <button
            v-if="currentChannel"
            class="inline-flex items-center justify-center w-9 h-9 rounded-full t-bg-subtle hover:opacity-80"
            title="Channel members"
            @click="showMembers = true"
          >
            <Icon name="lucide:users" class="w-4 h-4" />
          </button>
          <DropdownMenu v-if="currentChannel && canManageMembers">
            <DropdownMenuTrigger
              class="inline-flex items-center justify-center w-9 h-9 rounded-full t-bg-subtle hover:opacity-80"
              title="Channel options"
            >
              <Icon name="lucide:ellipsis" class="w-4 h-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem v-if="!isPinned" :disabled="pinning" @click="setPinned(true)">
                <Icon name="lucide:pin" class="w-4 h-4 mr-2" />
                Pin channel
              </DropdownMenuItem>
              <DropdownMenuItem v-else :disabled="pinning" @click="setPinned(false)">
                <Icon name="lucide:pin-off" class="w-4 h-4 mr-2" />
                Unpin channel
              </DropdownMenuItem>
              <DropdownMenuItem v-if="!isArchived" :disabled="archiving" @click="setArchived(true)">
                <Icon name="lucide:archive" class="w-4 h-4 mr-2" />
                Archive channel
              </DropdownMenuItem>
              <DropdownMenuItem v-else :disabled="archiving" @click="setArchived(false)">
                <Icon name="lucide:archive-restore" class="w-4 h-4 mr-2" />
                Unarchive channel
              </DropdownMenuItem>
              <DropdownMenuItem class="text-red-600" @click="showDeleteConfirm = true">
                <Icon name="lucide:trash-2" class="w-4 h-4 mr-2" />
                Delete channel
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Badge
            :variant="isConnected ? 'default' : 'destructive'"
            class="text-xs"
          >
            <Icon
              :name="isConnected ? 'lucide:wifi' : 'lucide:wifi-off'"
              class="w-3 h-3 mr-1"
            />
            {{ isConnected ? "Connected" : "Disconnected" }}
          </Badge>
        </div>
      </header>

      <!-- Connection Error -->
      <Alert v-if="messagesError" variant="destructive" class="m-4">
        <AlertTitle>Connection Error</AlertTitle>
        <AlertDescription class="flex items-center justify-between">
          <span>{{ messagesError }}</span>
          <Button
            variant="outline"
            size="sm"
            @click="refreshMessages"
            :disabled="messagesLoading"
          >
            <Icon name="lucide:refresh-cw" class="w-4 h-4 mr-1" />
            Retry
          </Button>
        </AlertDescription>
      </Alert>

      <!-- Messages Area -->
      <div
        ref="messagesContainer"
        class="flex-1 overflow-y-auto px-4 py-4 space-y-4"
      >
        <!-- Loading State -->
        <div v-if="messagesLoading && !messages?.length" class="space-y-4">
          <div v-for="n in 5" :key="n" class="flex items-start gap-3 p-2">
            <div
              class="w-8 h-8 rounded-full bg-stone-200 dark:bg-stone-700 animate-pulse"
            />
            <div class="flex-1 space-y-2">
              <div
                class="h-4 w-24 bg-stone-200 dark:bg-stone-700 rounded animate-pulse"
              />
              <div
                class="h-4 w-full bg-stone-200 dark:bg-stone-700 rounded animate-pulse"
              />
              <div
                class="h-4 w-2/3 bg-stone-200 dark:bg-stone-700 rounded animate-pulse"
              />
            </div>
          </div>
        </div>

        <!-- Messages List -->
        <template v-else-if="messages?.length">
          <ChannelsChannelMessage
            v-for="message in messages"
            :key="message.id"
            :message="message"
            :channel-id="currentChannel?.id"
            :organization-id="orgId || undefined"
          />
        </template>

        <!-- Empty State -->
        <div
          v-else-if="!messagesLoading && currentChannel"
          class="flex flex-col items-center justify-center h-full text-stone-500"
        >
          <div
            class="w-16 h-16 rounded-full bg-stone-100 dark:bg-stone-800 flex items-center justify-center mb-4"
          >
            <Icon name="lucide:message-square" class="w-8 h-8" />
          </div>
          <p class="font-medium mb-1">No messages yet</p>
          <p class="text-sm">
            Be the first to send a message in #{{ currentChannel.name }}!
          </p>
        </div>

        <!-- Channel Not Found -->
        <div
          v-else-if="!channelLoading && !currentChannel"
          class="flex flex-col items-center justify-center h-full text-stone-500"
        >
          <Icon name="lucide:search-x" class="w-12 h-12 mb-4" />
          <p class="font-medium mb-1">Channel not found</p>
          <p class="text-sm mb-4">
            This channel may have been deleted or you don't have access.
          </p>
          <Button variant="outline" @click="router.push(buildOrgPath('/admin/channels'))">
            <Icon name="lucide:arrow-left" class="w-4 h-4 mr-2" />
            Back to Channels
          </Button>
        </div>
      </div>

      <!-- Message Input -->
      <div
        v-if="currentChannel"
        class="border-t border-stone-200 dark:border-stone-800 p-4 bg-stone-50 dark:bg-stone-900"
      >
        <div class="max-w-4xl mx-auto">
          <div class="flex gap-3">
            <div class="flex-1">
              <ChannelsChannelEditor
                ref="editorRef"
                v-model="newMessage"
                :placeholder="`Message #${currentChannel.name}`"
                :disabled="!currentChannel"
                :organization-id="orgId || undefined"
                :channel-id="currentChannel.id"
                @submit="sendMessage"
                @mention="handleMention"
              />
            </div>
            <Button
              class="shrink-0 self-end"
              :disabled="
                !newMessage?.replace(/<[^>]*>/g, '').trim() || !currentChannel
              "
              @click="sendMessage"
            >
              <Icon name="lucide:send" class="w-4 h-4" />
              <span class="sr-only">Send</span>
            </Button>
          </div>
          <p class="text-xs text-stone-500 mt-2">
            Press
            <kbd
              class="px-1 py-0.5 bg-stone-200 dark:bg-stone-700 rounded text-xs"
              >Enter</kbd
            >
            to send,
            <kbd
              class="px-1 py-0.5 bg-stone-200 dark:bg-stone-700 rounded text-xs"
              >Shift+Enter</kbd
            >
            for new line,
            <kbd
              class="px-1 py-0.5 bg-stone-200 dark:bg-stone-700 rounded text-xs"
              >@</kbd
            >
            to mention
          </p>
        </div>
      </div>
    </main>

    <!-- Create Channel Modal -->
    <ChannelsCreateChannelModal
      v-if="orgId"
      v-model:open="showCreateModal"
      :organization-id="orgId"
      @created="handleChannelCreated"
    />

    <!-- Channel Members Panel -->
    <ChannelsChannelMembersPanel
      v-if="orgId && currentChannel"
      v-model:open="showMembers"
      :channel-id="currentChannel.id"
      :organization-id="orgId"
      :is-private="!!currentChannel.is_private"
      :can-manage="canManageMembers"
    />

    <!-- Delete confirmation -->
    <Dialog v-model:open="showDeleteConfirm">
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete channel?</DialogTitle>
          <DialogDescription>
            This hides #{{ currentChannel?.name }} from everyone. Its messages and
            comments are preserved (not erased) and can be restored by an operator.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter class="gap-2">
          <Button variant="outline" :disabled="deleting" @click="showDeleteConfirm = false">
            Cancel
          </Button>
          <Button variant="destructive" :disabled="deleting" @click="deleteChannel">
            <Icon v-if="deleting" name="lucide:loader-2" class="w-4 h-4 mr-1 animate-spin" />
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
    </ClientOnly>
  </div>
</template>

<style scoped>
@reference "@/assets/css/tailwind.css";
/* Smooth scrolling for messages container */
.overflow-y-auto {
  scroll-behavior: smooth;
}

/* Custom scrollbar */
.overflow-y-auto::-webkit-scrollbar {
  width: 6px;
}

.overflow-y-auto::-webkit-scrollbar-track {
  background: transparent;
}

.overflow-y-auto::-webkit-scrollbar-thumb {
  @apply bg-stone-200 dark:bg-stone-700 rounded;
}

.overflow-y-auto:hover::-webkit-scrollbar-thumb {
  @apply bg-stone-300 dark:bg-stone-600;
}
</style>
