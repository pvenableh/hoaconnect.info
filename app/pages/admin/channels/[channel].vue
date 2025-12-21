<script setup lang="ts">
import type { HoaChannel, HoaChannelMessage } from "~~/types/directus";

definePageMeta({
  middleware: ["auth", "admin"],
  layout: "default",
});

const route = useRoute();
const router = useRouter();
const { selectedOrgId, isAdmin, currentOrg } = await useSelectedOrg();
const { user: currentUser } = useDirectusAuth();
const { create: createMessage } = useDirectusItems("hoa_channel_messages");
const { create: createMention } = useDirectusItems("hoa_channel_mentions");

// Redirect if no organization selected
if (!selectedOrgId.value) {
  navigateTo("/organizations");
}

const channelSlug = computed(() => route.params.channel as string);
const showCreateModal = ref(false);
const newMessage = ref("");
const messagesContainer = ref<HTMLElement | null>(null);
const editorRef = ref<any>(null);

// Fetch channel data
const { data: channels, isLoading: channelLoading } = useRealtimeSubscription<HoaChannel>(
  "hoa_channels",
  ["id", "name", "slug", "description", "is_private", "organization"],
  {
    slug: { _eq: channelSlug.value },
    organization: { _eq: selectedOrgId.value },
    status: { _eq: "published" },
  }
);

const currentChannel = computed(() => channels.value?.[0] || null);

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
    channel: { slug: { _eq: channelSlug.value } },
    status: { _eq: "published" },
    parent_message: { _null: true },
  })),
  "-date_created"
);

// Handle channel selection from sidebar
const handleChannelSelect = (channel: HoaChannel) => {
  router.push(`/admin/channels/${channel.slug}`);
};

// Handle channel creation
const handleChannelCreated = (channel: any) => {
  router.push(`/admin/channels/${channel.slug}`);
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
      messagesContainer.value!.scrollTop = messagesContainer.value!.scrollHeight;
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
});
</script>

<template>
  <div class="flex h-[calc(100vh-4rem)]">
    <!-- Sidebar with Channels List -->
    <aside
      class="w-64 border-r border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900 overflow-y-auto hidden md:block"
    >
      <div class="p-4 border-b border-stone-200 dark:border-stone-800">
        <h1 class="font-semibold text-lg truncate">
          {{ currentOrg?.organization?.name || "Channels" }}
        </h1>
      </div>

      <ChannelsChannelsList
        v-if="selectedOrgId"
        :organization-id="selectedOrgId"
        :selected-channel-slug="channelSlug"
        @select="handleChannelSelect"
        @create="showCreateModal = true"
      />
    </aside>

    <!-- Main Chat Area -->
    <main class="flex-1 flex flex-col bg-white dark:bg-stone-900">
      <!-- Channel Header -->
      <header
        class="flex items-center justify-between px-4 py-3 border-b border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900"
      >
        <div class="flex items-center gap-3">
          <!-- Mobile back button -->
          <NuxtLink
            to="/admin/channels"
            class="md:hidden text-stone-500 hover:text-stone-700"
          >
            <Icon name="lucide:chevron-left" class="w-5 h-5" />
          </NuxtLink>

          <div v-if="channelLoading" class="space-y-1">
            <div class="h-5 w-32 bg-stone-200 dark:bg-stone-700 rounded animate-pulse" />
            <div class="h-4 w-48 bg-stone-200 dark:bg-stone-700 rounded animate-pulse" />
          </div>

          <div v-else-if="currentChannel">
            <div class="flex items-center gap-2">
              <Icon
                :name="currentChannel.is_private ? 'lucide:lock' : 'lucide:hash'"
                class="w-5 h-5 text-stone-500"
              />
              <h1 class="font-semibold text-lg">{{ currentChannel.name }}</h1>
            </div>
            <p v-if="currentChannel.description" class="text-sm text-stone-500 truncate max-w-md">
              {{ currentChannel.description }}
            </p>
          </div>

          <div v-else>
            <h1 class="font-semibold text-lg text-red-500">Channel not found</h1>
          </div>
        </div>

        <div class="flex items-center gap-2">
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
          <div
            v-for="n in 5"
            :key="n"
            class="flex items-start gap-3 p-2"
          >
            <div class="w-8 h-8 rounded-full bg-stone-200 dark:bg-stone-700 animate-pulse" />
            <div class="flex-1 space-y-2">
              <div class="h-4 w-24 bg-stone-200 dark:bg-stone-700 rounded animate-pulse" />
              <div class="h-4 w-full bg-stone-200 dark:bg-stone-700 rounded animate-pulse" />
              <div class="h-4 w-2/3 bg-stone-200 dark:bg-stone-700 rounded animate-pulse" />
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
            :organization-id="selectedOrgId || undefined"
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
          <p class="text-sm">Be the first to send a message in #{{ currentChannel.name }}!</p>
        </div>

        <!-- Channel Not Found -->
        <div
          v-else-if="!channelLoading && !currentChannel"
          class="flex flex-col items-center justify-center h-full text-stone-500"
        >
          <Icon name="lucide:search-x" class="w-12 h-12 mb-4" />
          <p class="font-medium mb-1">Channel not found</p>
          <p class="text-sm mb-4">This channel may have been deleted or you don't have access.</p>
          <Button variant="outline" @click="router.push('/admin/channels')">
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
                :organization-id="selectedOrgId || undefined"
                :channel-id="currentChannel.id"
                @submit="sendMessage"
                @mention="handleMention"
              />
            </div>
            <Button
              class="shrink-0 self-end"
              :disabled="!newMessage?.replace(/<[^>]*>/g, '').trim() || !currentChannel"
              @click="sendMessage"
            >
              <Icon name="lucide:send" class="w-4 h-4" />
              <span class="sr-only">Send</span>
            </Button>
          </div>
          <p class="text-xs text-stone-500 mt-2">
            Press <kbd class="px-1 py-0.5 bg-stone-200 dark:bg-stone-700 rounded text-xs">Enter</kbd> to send,
            <kbd class="px-1 py-0.5 bg-stone-200 dark:bg-stone-700 rounded text-xs">Shift+Enter</kbd> for new line,
            <kbd class="px-1 py-0.5 bg-stone-200 dark:bg-stone-700 rounded text-xs">@</kbd> to mention
          </p>
        </div>
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

<style scoped>
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
