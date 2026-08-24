<script setup lang="ts">
// The chat thread for a single channel — header, realtime messages, composer,
// search, members, pin/archive/delete. Extracted from the channels [channel].vue
// page so it can be reused both on the full-page route (fallback / deep links)
// and inside the slide-over Channels panel. Driven by props, not the route.
import type { HoaChannel, HoaChannelMessage } from "#core/types/directus";
import { toast } from "vue-sonner";

const props = withDefaults(
  defineProps<{
    organizationId: string;
    channelSlug: string;
    isAdmin?: boolean;
    canManage?: boolean;
    embedded?: boolean;
    highlightMessageId?: string;
  }>(),
  { isAdmin: false, canManage: false, embedded: false }
);

const emit = defineEmits<{
  (e: "archived"): void;
  (e: "deleted"): void;
  (e: "back"): void;
}>();

const { buildOrgPath } = useOrgNavigation();
const { user: currentUser } = useDirectusAuth();
const { create: createMessage } = useDirectusItems("hoa_channel_messages");
const { create: createMention } = useDirectusItems("hoa_channel_mentions");
const { announce } = useNotifyEvent();

const orgId = computed(() => props.organizationId);
const channelSlug = computed(() => props.channelSlug);
const isAdmin = computed(() => props.isAdmin);
const canManageMembers = computed(() => props.canManage);

const showMembers = ref(false);

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
    searchResults.value = await searchInChannel(currentChannel.value.id, searchQuery.value);
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

// Jump-to-message. The target is usually mid-history rather than on screen, and
// on a fresh channel open it may not be rendered yet at all, so this is driven
// by a reactive id + a watcher on the rendered list (below) rather than a
// one-shot scroll — the same reason Earnest waits for the element instead of
// firing on a timer.
const highlightId = ref<string | null>(null);
let highlightClearTimer: ReturnType<typeof setTimeout> | null = null;

const highlightMessage = (id: string) => {
  highlightId.value = id;
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
      emit("archived");
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
    emit("deleted");
  } catch (e: any) {
    toast.error(e?.data?.message || "Failed to delete channel");
  } finally {
    deleting.value = false;
  }
};

const newMessage = ref("");
const messageAttachments = ref<string[]>([]);
const messagesContainer = ref<HTMLElement | null>(null);
const editorRef = ref<any>(null);

// Fetch channel data - use computed filter for reactivity
const { data: channels, isLoading: channelLoading } = useRealtimeSubscription<HoaChannel>(
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

const messageFields = [
  "id",
  "status",
  "content",
  "attachments",
  "date_created",
  "is_edited",
  "parent_message",
  "user_created.id",
  "user_created.first_name",
  "user_created.last_name",
  "user_created.avatar",
];

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

type ThreadMessage = HoaChannelMessage & {
  user_created?: {
    id: string;
    first_name?: string;
    last_name?: string;
    avatar?: string;
  };
};

// The subscription sorts newest-first (so a realtime create prepends); the pane
// reads oldest-at-top, newest-at-bottom, which is also what makes scrollToBottom
// and the "New" divider mean what they say. Before this it rendered the
// descending array verbatim, so the newest message sat at the TOP while the
// pane scrolled to the bottom — i.e. to the oldest thing in the channel.
const orderedMessages = computed<ThreadMessage[]>(() =>
  [...(((messages.value || []) as unknown) as ThreadMessage[])].sort(
    (a, b) =>
      new Date(a.date_created || 0).getTime() - new Date(b.date_created || 0).getTime()
  )
);

// ── Enter/leave reconciler ───────────────────────────────────────────────────
// The pane renders from `visibleMessages`, reconciled against the live source,
// so a delta can play a transition while a backlog snaps into place. Two things
// this buys, both of which the thread lacked:
//   · `moderatedIds` evicts a hidden/removed message immediately. A filtered
//     realtime subscription reports rows entering the filter, not rows leaving
//     it, so a moderated message used to sit on screen looking published.
//   · `_settled` gates the enter animation, so first load and channel switches
//     never stagger-animate an entire history.
// Compositor-driven: a reactive class plus a CSS transition, not <Transition>.
const moderatedIds = ref<Set<string>>(new Set());
const sourceMessages = computed<ThreadMessage[]>(() =>
  orderedMessages.value.filter(
    (m) => m.status === "published" && !moderatedIds.value.has(m.id)
  )
);
const newestMessageId = computed(
  () => sourceMessages.value[sourceMessages.value.length - 1]?.id || null
);
const newestMessageAt = computed(
  () => sourceMessages.value[sourceMessages.value.length - 1]?.date_created || null
);

const visibleMessages = ref<ThreadMessage[]>([]);
const enteringIds = ref<Set<string>>(new Set());
const leavingIds = ref<Set<string>>(new Set());
const snapshots = new Map<string, ThreadMessage>();
const leaveTimers = new Map<string, ReturnType<typeof setTimeout>>();
let settled = false;
const LEAVE_MS = 200;

const byDate = (list: ThreadMessage[]): ThreadMessage[] =>
  [...list].sort(
    (a, b) =>
      new Date(a.date_created || 0).getTime() - new Date(b.date_created || 0).getTime()
  );

/** Snap the pane to the current source with no animation. */
const resetVisible = () => {
  for (const t of leaveTimers.values()) clearTimeout(t);
  leaveTimers.clear();
  enteringIds.value = new Set();
  leavingIds.value = new Set();
  snapshots.clear();
  for (const m of sourceMessages.value) snapshots.set(m.id, m);
  visibleMessages.value = byDate(sourceMessages.value);
};

const reconcile = () => {
  const src = sourceMessages.value;
  const bySrc = new Map(src.map((m) => [m.id, m]));
  const visIds = new Set(visibleMessages.value.map((m) => m.id));

  for (const m of src) {
    snapshots.set(m.id, m);
    if (!visIds.has(m.id) && !leavingIds.value.has(m.id) && settled) {
      const s = new Set(enteringIds.value);
      s.add(m.id);
      enteringIds.value = s;
      // A macrotask, not rAF: rAF is throttled in headless browsers, and the
      // from-pose has to paint before it flips.
      setTimeout(() => {
        const s2 = new Set(enteringIds.value);
        s2.delete(m.id);
        enteringIds.value = s2;
      }, 16);
    }
  }

  for (const m of visibleMessages.value) {
    if (!bySrc.has(m.id) && !leavingIds.value.has(m.id)) {
      const l = new Set(leavingIds.value);
      l.add(m.id);
      leavingIds.value = l;
      leaveTimers.set(
        m.id,
        setTimeout(() => {
          const l2 = new Set(leavingIds.value);
          l2.delete(m.id);
          leavingIds.value = l2;
          leaveTimers.delete(m.id);
          snapshots.delete(m.id);
          visibleMessages.value = visibleMessages.value.filter((x) => x.id !== m.id);
        }, LEAVE_MS + 20)
      );
    }
  }

  // Rebuild from source (fresh objects carry content edits) plus the rows still
  // playing their leave.
  const merged: ThreadMessage[] = [];
  for (const m of visibleMessages.value) {
    const live = bySrc.get(m.id);
    if (live) merged.push(live);
    else if (leavingIds.value.has(m.id)) merged.push(snapshots.get(m.id) || m);
  }
  for (const m of src) if (!merged.some((x) => x.id === m.id)) merged.push(m);
  visibleMessages.value = byDate(merged);
};

watch(sourceMessages, () => {
  if (settled) reconcile();
  else resetVisible();
});

watch(
  messagesLoading,
  (loading) => {
    if (loading) return;
    resetVisible();
    // A backlog opens at its live end, always — that is where the conversation
    // is. The divider is what marks where you left off; the scroll position is
    // not asked to do that job as well.
    scrollToBottom();
    setTimeout(() => {
      settled = true;
    }, 60);
  },
  { immediate: true }
);

/** Locally evict a message the moment it is deleted / hidden / removed. */
const onModerated = (id: string) => {
  if (!id) return;
  const s = new Set(moderatedIds.value);
  s.add(id);
  moderatedIds.value = s;
};

// ── Unread cursor + "New" divider ────────────────────────────────────────────
// The divider is anchored to the cursor as it stood when the channel OPENED,
// captured before marking it read. Reading the cursor after markRead would
// always yield "now", so the line would either never appear or jump to the
// bottom while you were still reading — which is exactly the failure that makes
// unread dividers untrustworthy elsewhere.
const unread = useChannelUnread();
unread.watchLive();

const dividerAt = ref<string | null>(null);
const firstUnreadId = computed(() => {
  if (!dividerAt.value) return null;
  const cut = new Date(dividerAt.value).getTime();
  return (
    sourceMessages.value.find((m) => new Date(m.date_created || 0).getTime() > cut)?.id ||
    null
  );
});

const openChannel = async (channelId?: string | null) => {
  if (!channelId) {
    dividerAt.value = null;
    return;
  }
  await unread.refresh();
  dividerAt.value = unread.lastReadAtFor(channelId);
  await unread.markRead(channelId, newestMessageAt.value);
};

watch(() => currentChannel.value?.id, (id) => openChannel(id), { immediate: true });

// Keep the open channel read as messages land in it, without touching the
// divider — the line marks where you were when you arrived, not where you are.
watch(newestMessageAt, (at) => {
  const id = currentChannel.value?.id;
  if (id && at) void unread.markRead(id, at);
});

// Pending mentions to be saved after message creation
const pendingMentions = ref<Array<{ id: string; label: string }>>([]);
const handleMention = (user: { id: string; label: string }) => {
  pendingMentions.value.push(user);
};

const sendMessage = async () => {
  const messageText = newMessage.value?.replace(/<[^>]*>/g, "").trim();
  const hasAttachments = messageAttachments.value.length > 0;
  if ((!messageText && !hasAttachments) || !currentChannel.value?.id || messagesLoading.value) return;

  try {
    const createdMessage = await createMessage({
      content: newMessage.value,
      channel: currentChannel.value.id,
      attachments: hasAttachments ? [...messageAttachments.value] : [],
      status: "published",
    });

    if (pendingMentions.value.length > 0 && createdMessage) {
      for (const mention of pendingMentions.value) {
        try {
          const createdMention = await createMention({
            message: (createdMessage as any).id,
            mentioned_user: mention.id,
            mentioned_by: currentUser.value?.id,
            channel: currentChannel.value.id,
            is_read: false,
          });
          // The mention row is written from the browser, so nothing server-side
          // would otherwise notice it. This is what turns "@you" into a bell row
          // and a push on the mentioned member's phone; the server re-reads the
          // row and derives everything, so the ping carries no copy of its own.
          announce("hoa_channel_mentions", (createdMention as any)?.id);
        } catch (error) {
          console.error("Error creating mention record:", error);
        }
      }
    }

    newMessage.value = "";
    messageAttachments.value = [];
    pendingMentions.value = [];
    editorRef.value?.clear();
    scrollToBottom();
  } catch (error) {
    console.error("Error sending message:", error);
    toast.error("Failed to send message");
  }
};

/** Is the reader at the live end of the conversation, or back in history? */
const isNearBottom = (): boolean => {
  const el = messagesContainer.value;
  if (!el) return true;
  return el.scrollHeight - el.scrollTop - el.clientHeight < 120;
};

// The pane has `scroll-behavior: smooth`, which is right for a user scrolling
// and wrong for us: a smooth jump to the bottom can still be in flight when the
// next layout pass changes the height, and it lands mid-history. So these jumps
// are explicitly instant, and they run twice — once after Vue patches the DOM,
// once after avatars and link previews have settled the row heights.
const scrollToBottom = () => {
  // The element is resolved INSIDE nextTick, not before it: the first call
  // comes from the loading watcher, which flushes before the DOM patch that
  // creates the pane, so reading the ref up front bails on exactly the call
  // that matters — the one that opens a channel at its live end.
  nextTick(() => {
    const jump = () => {
      const el = messagesContainer.value;
      if (el) el.scrollTop = el.scrollHeight;
    };
    jump();
    // Again once avatars and link previews have settled the row heights; a
    // jump that lands mid-history is worse than no jump at all.
    setTimeout(jump, 80);
  });
};

// Watchers flush BEFORE the DOM patch, so this reads where the reader was
// standing when the message arrived, not where the new row pushed them. Someone
// scrolled back through history stays there; someone at the live end follows.
watch(
  () => visibleMessages.value.length,
  (now, before) => {
    if (now > (before || 0) && isNearBottom()) scrollToBottom();
  }
);

// Reset transient state when switching channels. `settled` goes back off so the
// next channel's backlog snaps in rather than stagger-animating, and the local
// moderation evictions are dropped — they belong to the channel we just left.
watch(channelSlug, () => {
  newMessage.value = "";
  messageAttachments.value = [];
  pendingMentions.value = [];
  searchQuery.value = "";
  searchResults.value = [];
  showSearch.value = false;
  settled = false;
  moderatedIds.value = new Set();
  dividerAt.value = null;
  highlightId.value = null;
});

// Deep-link highlight (?message=<id> from search or a notification).
watch(
  () => props.highlightMessageId,
  (id) => {
    if (id) highlightId.value = String(id);
  },
  { immediate: true }
);

// Scroll to whatever is highlighted once it is actually on the page — a fresh
// channel open loads messages async, so firing on a timer would miss.
watch(
  [highlightId, visibleMessages],
  () => {
    const id = highlightId.value;
    if (!id || !visibleMessages.value.some((m) => m.id === id)) return;
    nextTick(() => {
      // Instant, not smooth. A smooth scroll is easing, and easing is the first
      // thing an environment drops — it is a no-op under reduced motion and in
      // headless Chrome — which would leave the jump silently doing nothing.
      // The ring below is what says "here it is"; the scroll only has to land.
      document.getElementById(`msg-${id}`)?.scrollIntoView({ behavior: "auto", block: "center" });
    });
    if (highlightClearTimer) clearTimeout(highlightClearTimer);
    highlightClearTimer = setTimeout(() => {
      if (highlightId.value === id) highlightId.value = null;
    }, 2800);
  },
  { immediate: true }
);

onBeforeUnmount(() => {
  if (highlightClearTimer) clearTimeout(highlightClearTimer);
  for (const t of leaveTimers.values()) clearTimeout(t);
});
</script>

<template>
  <main class="flex-1 flex flex-col min-h-0 t-bg-elevated">
    <!-- Channel Header -->
    <header
      class="flex items-center justify-between px-4 py-3 border-b t-border t-bg-elevated"
    >
      <div class="flex items-center gap-3 min-w-0">
        <!-- Back button (always in the panel; mobile-only on the full page) -->
        <button
          :class="embedded ? '' : 'md:hidden'"
          class="t-text-muted hover:t-text shrink-0"
          title="Back to channels"
          @click="emit('back')"
        >
          <Icon name="lucide:chevron-left" class="w-5 h-5" />
        </button>

        <div v-if="channelLoading" class="space-y-1">
          <div class="h-5 w-32 t-bg-subtle rounded animate-pulse" />
          <div class="h-4 w-48 t-bg-subtle rounded animate-pulse" />
        </div>

        <div v-else-if="currentChannel" class="min-w-0">
          <div class="flex items-center gap-2">
            <Icon :name="currentChannel.is_private ? 'lucide:lock' : 'lucide:hash'" class="w-5 h-5 t-text-muted shrink-0" />
            <h1 class="font-semibold text-lg truncate">{{ currentChannel.name }}</h1>
            <span
              v-if="currentChannel.is_private"
              class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium t-bg-subtle t-text-muted shrink-0"
            >
              <Icon name="lucide:lock" class="w-3 h-3" /> Private
            </span>
            <span
              v-if="isArchived"
              class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 shrink-0"
            >
              <Icon name="lucide:archive" class="w-3 h-3" /> Archived
            </span>
            <Icon v-if="isPinned" name="lucide:pin" class="w-4 h-4 t-text-muted shrink-0" title="Pinned" />
          </div>
          <p v-if="currentChannel.description" class="text-sm t-text-muted truncate max-w-md">
            {{ currentChannel.description }}
          </p>
        </div>

        <div v-else>
          <h1 class="font-semibold text-lg text-red-500">Channel not found</h1>
        </div>
      </div>

      <div class="flex items-center gap-2 shrink-0">
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
            class="absolute right-0 top-11 z-20 w-80 rounded-xl border t-border t-bg-elevated shadow-lg p-3"
          >
            <Input v-model="searchQuery" placeholder="Search messages…" autofocus />
            <div class="mt-2 max-h-72 overflow-y-auto">
              <div v-if="searching" class="py-4 flex justify-center"><div class="spinner-ios" /></div>
              <template v-else-if="searchResults.length">
                <button
                  v-for="r in searchResults"
                  :key="r.id"
                  class="w-full text-left px-2 py-2 rounded-lg hover:t-bg-subtle"
                  @click="goToResult(r.id)"
                >
                  <p class="text-sm t-text line-clamp-2">{{ r.snippet }}</p>
                  <p class="text-[11px] t-text-muted mt-0.5">
                    {{ [r.author?.first_name, r.author?.last_name].filter(Boolean).join(" ") }}
                    <span v-if="r.date_created">· {{ new Date(r.date_created).toLocaleDateString() }}</span>
                  </p>
                </button>
              </template>
              <p v-else-if="searchQuery.trim()" class="text-sm t-text-muted py-3 text-center">No matches.</p>
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
              <Icon name="lucide:pin" class="w-4 h-4 mr-2" /> Pin channel
            </DropdownMenuItem>
            <DropdownMenuItem v-else :disabled="pinning" @click="setPinned(false)">
              <Icon name="lucide:pin-off" class="w-4 h-4 mr-2" /> Unpin channel
            </DropdownMenuItem>
            <DropdownMenuItem v-if="!isArchived" :disabled="archiving" @click="setArchived(true)">
              <Icon name="lucide:archive" class="w-4 h-4 mr-2" /> Archive channel
            </DropdownMenuItem>
            <DropdownMenuItem v-else :disabled="archiving" @click="setArchived(false)">
              <Icon name="lucide:archive-restore" class="w-4 h-4 mr-2" /> Unarchive channel
            </DropdownMenuItem>
            <DropdownMenuItem class="text-red-600" @click="showDeleteConfirm = true">
              <Icon name="lucide:trash-2" class="w-4 h-4 mr-2" /> Delete channel
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Badge :variant="isConnected ? 'default' : 'destructive'" class="text-xs hidden sm:inline-flex">
          <Icon :name="isConnected ? 'lucide:wifi' : 'lucide:wifi-off'" class="w-3 h-3 mr-1" />
          {{ isConnected ? "Connected" : "Disconnected" }}
        </Badge>
      </div>
    </header>

    <!-- Connection Error -->
    <Alert v-if="messagesError" variant="destructive" class="m-4">
      <AlertTitle>Connection Error</AlertTitle>
      <AlertDescription class="flex items-center justify-between">
        <span>{{ messagesError }}</span>
        <Button variant="outline" size="sm" :disabled="messagesLoading" @click="refreshMessages">
          <Icon name="lucide:refresh-cw" class="w-4 h-4 mr-1" /> Retry
        </Button>
      </AlertDescription>
    </Alert>

    <!-- Messages Area -->
    <div ref="messagesContainer" class="flex-1 overflow-y-auto px-4 py-4 space-y-4">
      <div v-if="messagesLoading && !messages?.length" class="space-y-4">
        <div v-for="n in 5" :key="n" class="flex items-start gap-3 p-2">
          <div class="w-8 h-8 rounded-full t-bg-subtle animate-pulse" />
          <div class="flex-1 space-y-2">
            <div class="h-4 w-24 t-bg-subtle rounded animate-pulse" />
            <div class="h-4 w-full t-bg-subtle rounded animate-pulse" />
            <div class="h-4 w-2/3 t-bg-subtle rounded animate-pulse" />
          </div>
        </div>
      </div>

      <template v-else-if="visibleMessages.length">
        <template v-for="message in visibleMessages" :key="message.id">
          <!-- Where you were when you opened the channel. Anchored to the
               pre-read cursor, so it stays put while you read. -->
          <div v-if="message.id === firstUnreadId" class="flex items-center gap-2 py-1">
            <div class="flex-1 h-px bg-destructive/40" />
            <span class="text-[10px] font-semibold uppercase tracking-wider text-destructive shrink-0">
              New
            </span>
            <div class="flex-1 h-px bg-destructive/40" />
          </div>
          <div
            class="msg-slot"
            :class="{ entering: enteringIds.has(message.id), leaving: leavingIds.has(message.id) }"
          >
            <div class="msg-slot-inner">
              <!-- No id here: ChannelMessage's own root already carries
                   `msg-<id>`, and a second element with the same id is invalid
                   HTML that getElementById resolves by luck. -->
              <div
                class="rounded-lg transition-shadow"
                :class="highlightId === message.id ? 'ring-2 ring-primary/50 bg-primary/5' : ''"
              >
                <ChannelsChannelMessage
                  :message="message"
                  :channel-id="currentChannel?.id"
                  :organization-id="orgId || undefined"
                  :can-moderate="canManageMembers"
                  @moderated="onModerated"
                />
              </div>
            </div>
          </div>
        </template>
      </template>

      <div v-else-if="!messagesLoading && currentChannel" class="flex flex-col items-center justify-center h-full t-text-muted">
        <div class="w-16 h-16 rounded-full t-bg-subtle flex items-center justify-center mb-4">
          <Icon name="lucide:message-square" class="w-8 h-8" />
        </div>
        <p class="font-medium mb-1">No messages yet</p>
        <p class="text-sm">Be the first to send a message in #{{ currentChannel.name }}!</p>
      </div>

      <div v-else-if="!channelLoading && !currentChannel" class="flex flex-col items-center justify-center h-full t-text-muted">
        <Icon name="lucide:search-x" class="w-12 h-12 mb-4" />
        <p class="font-medium mb-1">Channel not found</p>
        <p class="text-sm mb-4">This channel may have been deleted or you don't have access.</p>
        <Button variant="outline" @click="emit('back')">
          <Icon name="lucide:arrow-left" class="w-4 h-4 mr-2" /> Back to channels
        </Button>
      </div>
    </div>

    <!-- Message Input -->
    <div v-if="currentChannel" class="border-t t-border p-4 t-bg-subtle">
      <div class="max-w-4xl mx-auto">
        <div class="flex gap-3">
          <div class="flex-1">
            <ChannelsChannelEditor
              ref="editorRef"
              v-model="newMessage"
              v-model:attachments="messageAttachments"
              :placeholder="`Message #${currentChannel.name}`"
              :disabled="!currentChannel"
              :organization-id="orgId || undefined"
              :channel-id="currentChannel.id"
              allow-file-attachments
              upload-source="message"
              @submit="sendMessage"
              @mention="handleMention"
            />
            <!-- Pending attachments -->
            <div v-if="messageAttachments.length" class="mt-2">
              <ChannelsChannelAttachments :ids="messageAttachments" />
              <button
                class="mt-1 text-xs t-text-muted hover:t-text"
                @click="messageAttachments = []"
              >
                Clear {{ messageAttachments.length }} attachment{{ messageAttachments.length === 1 ? "" : "s" }}
              </button>
            </div>
          </div>
          <Button
            class="shrink-0 self-end"
            :disabled="(!newMessage?.replace(/<[^>]*>/g, '').trim() && !messageAttachments.length) || !currentChannel"
            @click="sendMessage"
          >
            <Icon name="lucide:send" class="w-4 h-4" />
            <span class="sr-only">Send</span>
          </Button>
        </div>
        <p class="text-xs t-text-muted mt-2">
          Press <kbd class="px-1 py-0.5 t-bg-subtle rounded text-xs">Enter</kbd> to send,
          <kbd class="px-1 py-0.5 t-bg-subtle rounded text-xs">Shift+Enter</kbd> for new line,
          <kbd class="px-1 py-0.5 t-bg-subtle rounded text-xs">@</kbd> to mention
        </p>
      </div>
    </div>

    <!-- Channel Members Panel -->
    <ChannelsChannelMembersPanel
      v-if="currentChannel"
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
            This hides #{{ currentChannel?.name }} from everyone. Its messages and comments are
            preserved (not erased) and can be restored by an operator.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter class="gap-2">
          <Button variant="outline" :disabled="deleting" @click="showDeleteConfirm = false">Cancel</Button>
          <Button variant="destructive" :disabled="deleting" @click="deleteChannel">
            <Icon v-if="deleting" name="lucide:loader-2" class="w-4 h-4 mr-1 animate-spin" /> Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </main>
</template>

<style scoped>
@reference "#core/app/assets/css/tailwind.css";

/* Message enter/leave — a reactive class plus a CSS transition, so the work
   stays on the compositor. Enter is a brief opacity + translate from-pose that
   flips to natural; height is untouched so it cannot fight scrollToBottom or
   the "New" divider. Leave fades and collapses the grid row, so a moderated
   message closes deliberately instead of popping out from under the cursor. */
.msg-slot {
  display: grid;
  grid-template-rows: 1fr;
  transition:
    grid-template-rows 200ms ease,
    opacity 200ms ease-out,
    transform 180ms ease-out;
}
.msg-slot-inner {
  min-height: 0;
  overflow: hidden;
}
.msg-slot.entering {
  opacity: 0;
  transform: translateY(6px);
}
.msg-slot.leaving {
  grid-template-rows: 0fr;
  opacity: 0;
  pointer-events: none;
}
@media (prefers-reduced-motion: reduce) {
  .msg-slot {
    transition: none;
  }
  .msg-slot.entering {
    opacity: 1;
    transform: none;
  }
}

/* No `scroll-behavior: smooth` here, deliberately. It applied to every scroll
   of this pane including ours, and a smooth jump issued right after a layout
   change is cancelled by the next one — which is why opening a channel used to
   land on the OLDEST message with the newest ones below the fold. Jump-to-
   message asks for smooth on the call itself, which is the only place it was
   ever wanted. */
.overflow-y-auto::-webkit-scrollbar {
  width: 6px;
}
.overflow-y-auto::-webkit-scrollbar-track {
  background: transparent;
}
.overflow-y-auto::-webkit-scrollbar-thumb {
  background: var(--theme-border-secondary);
  border-radius: 4px;
}
.overflow-y-auto:hover::-webkit-scrollbar-thumb {
  background: var(--theme-text-muted);
}
</style>
