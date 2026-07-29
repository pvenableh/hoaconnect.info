<script setup lang="ts">
import type { HoaChannelMessage } from "#core/types/directus";
import { toast } from "vue-sonner";

const props = defineProps<{
  message: HoaChannelMessage & {
    user_created?: {
      id: string;
      first_name?: string;
      last_name?: string;
      avatar?: string;
    };
  };
  isReply?: boolean;
  channelId?: string;
  organizationId?: string;
  /** Manager (admin / board / channel admin) — can hide/remove others' messages. */
  canModerate?: boolean;
}>();

const config = useRuntimeConfig();
const { user: currentUser } = useDirectusAuth();
const { create: createMessage, remove: deleteMessage } = useDirectusItems(
  "hoa_channel_messages"
);
const filesComposable = useDirectusFiles();

const showReplyInput = ref(false);
const replyContent = ref("");
const replyAttachments = ref<string[]>([]);
const showReplies = ref(false);
const isDeleting = ref(false);

// External URLs in the message body → rendered as link-preview cards (max 3;
// internal/localhost links are skipped so we don't preview our own app).
const messageUrls = computed(() => {
  const html = String(props.message.content || "");
  const mainDomain = String((config.public as any)?.mainDomain || "hoaconnect.info");
  const urls: string[] = [];
  const re = /href=["'](https?:\/\/[^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const u = m[1]!;
    try {
      const host = new URL(u).hostname.toLowerCase();
      if (host === "localhost" || host === mainDomain || host.endsWith(`.${mainDomain}`)) continue;
    } catch {
      continue;
    }
    if (!urls.includes(u)) urls.push(u);
    if (urls.length >= 3) break;
  }
  return urls;
});

// Get message replies using realtime subscription
const { data: replies, isLoading: repliesLoading } = useRealtimeSubscription(
  "hoa_channel_messages",
  [
    "id",
    "status",
    "content",
    "attachments",
    "date_created",
    "is_edited",
    "user_created.id",
    "user_created.first_name",
    "user_created.last_name",
    "user_created.avatar",
  ],
  {
    parent_message: { _eq: props.message.id },
    status: { _eq: "published" },
  },
  "-date_created"
);

const replyCount = computed(() => replies.value?.length || 0);

const toggleReplyInput = () => {
  showReplyInput.value = !showReplyInput.value;
  if (showReplyInput.value) {
    showReplies.value = true;
  }
};

const toggleReplies = () => {
  showReplies.value = !showReplies.value;
};

const sendReply = async () => {
  const content = replyContent.value?.replace(/<[^>]*>/g, "").trim();
  const hasAttachments = replyAttachments.value.length > 0;
  if ((!content && !hasAttachments) || !props.channelId) return;

  try {
    await createMessage({
      content: replyContent.value,
      channel: props.channelId,
      parent_message: props.message.id,
      attachments: hasAttachments ? [...replyAttachments.value] : [],
      status: "published",
    });

    replyContent.value = "";
    replyAttachments.value = [];
    showReplyInput.value = false;
    showReplies.value = true;
  } catch (error) {
    console.error("Error sending reply:", error);
    toast.error("Failed to send reply");
  }
};

const handleDelete = async () => {
  if (!confirm("Are you sure you want to delete this message?")) return;

  isDeleting.value = true;
  try {
    await deleteMessage(props.message.id);
    toast.success("Message deleted");
  } catch (error) {
    console.error("Error deleting message:", error);
    toast.error("Failed to delete message");
  } finally {
    isDeleting.value = false;
  }
};

// ── Moderation (non-author) ──────────────────────────────────────────────────
const isModerating = ref(false);
const channelRef = computed(
  () => props.channelId || (typeof (props.message as any).channel === "object" ? (props.message as any).channel?.id : (props.message as any).channel)
);

async function moderate(action: "hide" | "remove") {
  const q = action === "remove"
    ? "Permanently remove this message? This can't be undone."
    : "Hide this message from the channel?";
  if (!confirm(q)) return;
  isModerating.value = true;
  try {
    await $fetch("/api/hoa/channels/moderate", {
      method: "POST",
      body: { channel: channelRef.value, messageId: props.message.id, action },
    });
    toast.success(action === "hide" ? "Message hidden" : "Message removed");
  } catch (err: any) {
    toast.error(err?.data?.message || "Moderation failed");
  } finally {
    isModerating.value = false;
  }
}

async function report() {
  const reason = window.prompt("Report this message to moderators — a short reason (optional):") ?? "";
  try {
    await $fetch("/api/hoa/channels/report", {
      method: "POST",
      body: { channel: channelRef.value, messageId: props.message.id, reason },
    });
    toast.success("Reported to moderators");
  } catch (err: any) {
    toast.error(err?.data?.message || "Report failed");
  }
};

// Format relative time
const getRelativeTime = (dateString?: string): string => {
  if (!dateString) return "";

  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString();
};

// Get user avatar URL
const getAvatarUrl = (avatarId?: string): string | undefined => {
  if (!avatarId) return undefined;
  return filesComposable.getUrl(avatarId, {
    width: 40,
    height: 40,
    fit: "cover",
  });
};

// Check if current user is the author
const isAuthor = computed(() => {
  const authorId =
    typeof props.message.user_created === "object"
      ? props.message.user_created?.id
      : props.message.user_created;
  return authorId === currentUser.value?.id;
});

// Get author display name
const authorName = computed(() => {
  if (
    !props.message.user_created ||
    typeof props.message.user_created === "string"
  ) {
    return "Unknown User";
  }
  const { first_name, last_name } = props.message.user_created;
  return `${first_name || ""} ${last_name || ""}`.trim() || "Unknown User";
});
</script>

<template>
  <div
    :id="`msg-${message.id}`"
    :class="[
      'group flex flex-col gap-2 scroll-mt-20 rounded-lg transition-colors',
      isReply ? 'pl-8 border-l-2 t-border' : '',
    ]"
  >
    <!-- Message Content -->
    <div
      class="flex items-start gap-3 p-2 rounded-lg hover:t-bg-subtle transition-colors"
    >
      <!-- Avatar -->
      <Avatar class="h-8 w-8 shrink-0">
        <AvatarImage
          v-if="
            message.user_created && typeof message.user_created === 'object'
          "
          :src="getAvatarUrl(message.user_created.avatar)"
          :alt="authorName"
        />
        <AvatarFallback class="text-xs">
          {{ authorName.charAt(0).toUpperCase() }}
        </AvatarFallback>
      </Avatar>

      <div class="flex-1 min-w-0">
        <!-- Author & Time -->
        <div class="flex items-center gap-2 mb-0.5">
          <span class="font-medium text-sm">{{ authorName }}</span>
          <span class="text-xs t-text-muted">
            {{ getRelativeTime(message.date_created) }}
          </span>
          <Badge
            v-if="message.is_edited"
            variant="outline"
            class="text-xs py-0"
          >
            edited
          </Badge>
        </div>

        <!-- Message Content -->
        <div
          class="prose prose-sm dark:prose-invert max-w-none t-text-secondary"
          v-html="message.content"
        />

        <!-- Link previews for external URLs in the body -->
        <ChannelsChannelLinkPreview v-for="u in messageUrls" :key="u" :url="u" />

        <!-- Attachments -->
        <ChannelsChannelAttachments
          v-if="(message as any).attachments?.length"
          :ids="(message as any).attachments"
        />

        <!-- Reactions (universal reaction system) -->
        <div class="mt-1.5">
          <CommentsReactionBar
            target-collection="hoa_channel_messages"
            :target-id="message.id"
          />
        </div>

        <!-- Message Actions -->
        <div
          v-if="!isReply"
          class="flex items-center gap-4 mt-2 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <!-- Reply Count -->
          <Button
            variant="ghost"
            size="sm"
            class="h-7 px-2 text-xs"
            :class="showReplies ? 'text-primary' : 't-text-muted'"
            @click="toggleReplies"
          >
            <Icon name="lucide:message-square" class="w-3.5 h-3.5 mr-1" />
            {{ replyCount }} {{ replyCount === 1 ? "reply" : "replies" }}
          </Button>

          <!-- Reply Button -->
          <Button
            variant="ghost"
            size="sm"
            class="h-7 px-2 text-xs t-text-muted"
            @click="toggleReplyInput"
          >
            <Icon name="lucide:corner-down-right" class="w-3.5 h-3.5 mr-1" />
            Reply
          </Button>

          <!-- Delete Button (only for author) -->
          <Button
            v-if="isAuthor"
            variant="ghost"
            size="sm"
            class="h-7 px-2 text-xs t-text-muted hover:text-red-500"
            :disabled="isDeleting"
            @click="handleDelete"
          >
            <Icon
              :name="isDeleting ? 'lucide:loader-2' : 'lucide:trash-2'"
              :class="['w-3.5 h-3.5', isDeleting ? 'animate-spin' : '']"
            />
          </Button>

          <!-- Moderation (non-author): managers hide/remove; anyone reports -->
          <Button
            v-if="!isAuthor && canModerate"
            variant="ghost"
            size="sm"
            class="h-7 px-2 text-xs t-text-muted hover:text-amber-600"
            :disabled="isModerating"
            title="Hide message"
            @click="moderate('hide')"
          >
            <Icon name="lucide:eye-off" class="w-3.5 h-3.5" />
          </Button>
          <Button
            v-if="!isAuthor && canModerate"
            variant="ghost"
            size="sm"
            class="h-7 px-2 text-xs t-text-muted hover:text-red-500"
            :disabled="isModerating"
            title="Remove message"
            @click="moderate('remove')"
          >
            <Icon name="lucide:trash-2" class="w-3.5 h-3.5" />
          </Button>
          <Button
            v-if="!isAuthor"
            variant="ghost"
            size="sm"
            class="h-7 px-2 text-xs t-text-muted hover:text-red-500"
            title="Report to moderators"
            @click="report()"
          >
            <Icon name="lucide:flag" class="w-3.5 h-3.5" />
          </Button>
        </div>

        <!-- Reply Actions for replies -->
        <div
          v-else
          class="flex items-center gap-4 mt-2 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <Button
            v-if="isAuthor"
            variant="ghost"
            size="sm"
            class="h-6 px-2 text-xs t-text-muted hover:text-red-500"
            :disabled="isDeleting"
            @click="handleDelete"
          >
            <Icon
              :name="isDeleting ? 'lucide:loader-2' : 'lucide:trash-2'"
              :class="['w-3 h-3', isDeleting ? 'animate-spin' : '']"
            />
          </Button>
          <Button
            v-if="!isAuthor && canModerate"
            variant="ghost"
            size="sm"
            class="h-6 px-2 text-xs t-text-muted hover:text-amber-600"
            :disabled="isModerating"
            title="Hide reply"
            @click="moderate('hide')"
          >
            <Icon name="lucide:eye-off" class="w-3 h-3" />
          </Button>
          <Button
            v-if="!isAuthor && canModerate"
            variant="ghost"
            size="sm"
            class="h-6 px-2 text-xs t-text-muted hover:text-red-500"
            :disabled="isModerating"
            title="Remove reply"
            @click="moderate('remove')"
          >
            <Icon name="lucide:trash-2" class="w-3 h-3" />
          </Button>
          <Button
            v-if="!isAuthor"
            variant="ghost"
            size="sm"
            class="h-6 px-2 text-xs t-text-muted hover:text-red-500"
            title="Report reply"
            @click="report()"
          >
            <Icon name="lucide:flag" class="w-3 h-3" />
          </Button>
        </div>
      </div>
    </div>

    <!-- Reply Input -->
    <div v-if="showReplyInput && !isReply" class="pl-11">
      <div class="space-y-2">
        <ChannelsChannelEditor
          v-model="replyContent"
          v-model:attachments="replyAttachments"
          placeholder="Write a reply..."
          :organization-id="organizationId"
          :channel-id="channelId"
          allow-file-attachments
          upload-source="message"
          @submit="sendReply"
        />
        <ChannelsChannelAttachments v-if="replyAttachments.length" :ids="replyAttachments" />
        <div class="flex items-center justify-between">
          <span class="text-xs t-text-muted">Press Enter to send</span>
          <div class="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              class="h-7"
              @click="showReplyInput = false"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              class="h-7"
              :disabled="!replyContent?.replace(/<[^>]*>/g, '').trim() && !replyAttachments.length"
              @click="sendReply"
            >
              Reply
            </Button>
          </div>
        </div>
      </div>
    </div>

    <!-- Replies List -->
    <Transition name="expand">
      <div v-if="showReplies && !isReply" class="space-y-1">
        <div v-if="repliesLoading" class="pl-11 space-y-2">
          <div v-for="n in 2" :key="n" class="flex items-start gap-3 p-2">
            <div
              class="w-8 h-8 rounded-full t-bg-subtle animate-pulse"
            />
            <div class="flex-1 space-y-2">
              <div
                class="h-4 w-24 t-bg-subtle rounded animate-pulse"
              />
              <div
                class="h-4 w-full t-bg-subtle rounded animate-pulse"
              />
            </div>
          </div>
        </div>

        <template v-else-if="replies?.length">
          <ChannelsChannelMessage
            v-for="reply in replies"
            :key="reply.id"
            :message="reply"
            :is-reply="true"
            :channel-id="channelId"
            :organization-id="organizationId"
            :can-moderate="canModerate"
          />
        </template>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
@reference "#core/app/assets/css/tailwind.css";
.prose :deep(p) {
  @apply mb-1;
}

.prose :deep(p:last-child) {
  @apply mb-0;
}

.prose :deep(ul) {
  @apply my-1;
}

.prose :deep(.mention) {
  @apply bg-primary/10 text-primary font-medium px-1 py-0.5 rounded;
}

.expand-enter-active,
.expand-leave-active {
  transition: all 0.2s ease-out;
  overflow: hidden;
}

.expand-enter-from,
.expand-leave-to {
  opacity: 0;
  max-height: 0;
}

.expand-enter-to,
.expand-leave-from {
  opacity: 1;
  max-height: 1000px;
}
</style>
