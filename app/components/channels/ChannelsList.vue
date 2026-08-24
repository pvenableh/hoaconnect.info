<script setup lang="ts">
import type { HoaChannel } from "#core/types/directus";
import { toast } from "vue-sonner";

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
  "category",
  "date_created",
  // The entity a channel already points at doubles as its folder when no
  // explicit category is set — see entityFolder below.
  "request.id",
  "request.title",
  "project.id",
  "project.title",
  "vendor.id",
  "vendor.name",
];

// Fetch channels for the organization
const { data: channels, isLoading, error, refresh } = useRealtimeSubscription<HoaChannel>(
  "hoa_channels",
  CHANNEL_FIELDS,
  channelFilter,
  "name"
);

// Per-channel unread badges. Shared state with the thread and the dock, so the
// number on a row and the number on the app icon cannot disagree.
const unread = useChannelUnread();
unread.watchLive();
onMounted(() => unread.refresh());
const unreadFor = (c: HoaChannel) => unread.countFor(c.id);
const unreadLabel = (c: HoaChannel) => {
  const n = unreadFor(c);
  return n > 99 ? "99+" : String(n);
};

// Latest-activity ordering: most-recently-active channel first (Slack-like).
// We aggregate the max message timestamp per channel; channels with no messages
// fall back to their creation date.
const { aggregate } = useDirectusItems("hoa_channel_messages");
const { list: listArchivedChannels, update: updateChannel } = useDirectusItems("hoa_channels");
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

// ── Folders ──────────────────────────────────────────────────────────────────
// A channel's folder is either the `category` someone typed, or — failing that
// — the thing it is already about. HOA channels can be spawned from a request,
// attached to a project, or opened with a vendor, and those FKs are a better
// default grouping than none: a roster of twenty channels named after tickets
// is a roster nobody scans. An explicit category always wins, so any channel
// can be filed anywhere regardless of what it links to.
const nameOf = (v: any, key: "title" | "name"): string | null =>
  v && typeof v === "object" ? (v[key] ?? null) : null;

const entityFolder = (c: any): string | null =>
  nameOf(c.project, "title") ||
  nameOf(c.request, "title") ||
  nameOf(c.vendor, "name") ||
  null;

const folderOf = (c: any): string | null => {
  const explicit = typeof c.category === "string" ? c.category.trim() : "";
  return explicit || entityFolder(c);
};

interface FolderRow {
  type: "subheader" | "channel";
  name?: string;
  ch?: HoaChannel;
}

/**
 * Split a set of channels into ungrouped rows first, then folder sub-groups —
 * flattened into one list so the template renders in a single pass instead of
 * nesting two v-fors.
 */
const foldered = (list: HoaChannel[]): FolderRow[] => {
  const top: HoaChannel[] = [];
  const folders = new Map<string, { name: string; recency: string; channels: HoaChannel[] }>();

  for (const ch of list) {
    const folder = folderOf(ch);
    if (!folder) {
      top.push(ch);
      continue;
    }
    if (!folders.has(folder)) folders.set(folder, { name: folder, recency: "", channels: [] });
    const f = folders.get(folder)!;
    f.channels.push(ch);
    const act = lastActivity(ch);
    if (act > f.recency) f.recency = act;
  }

  top.sort(byActivityDesc);
  const cats = [...folders.values()].sort(
    (a, b) => b.recency.localeCompare(a.recency) || a.name.localeCompare(b.name)
  );
  for (const c of cats) c.channels.sort(byActivityDesc);

  return [
    ...top.map((ch) => ({ type: "channel" as const, ch })),
    ...cats.flatMap((c) => [
      { type: "subheader" as const, name: c.name },
      ...c.channels.map((ch) => ({ type: "channel" as const, ch })),
    ]),
  ];
};

// Pinned channels float to the top (sorted among themselves by latest activity,
// deliberately unfoldered — a pin is a "keep this one in reach" override).
const pinnedChannels = computed(() =>
  ((channels.value?.filter((c) => (c as any).is_pinned) || []) as HoaChannel[])
    .slice()
    .sort(byActivityDesc)
);

const publicRows = computed(() =>
  foldered(
    (channels.value?.filter((c) => !c.is_private && !(c as any).is_pinned) || []) as HoaChannel[]
  )
);

const privateRows = computed(() =>
  foldered(
    (channels.value?.filter((c) => c.is_private && !(c as any).is_pinned) || []) as HoaChannel[]
  )
);

const hasAnyChannel = computed(
  () => !!(pinnedChannels.value.length || publicRows.value.length || privateRows.value.length)
);

// ── Move to folder (admins) ──────────────────────────────────────────────────
const knownFolders = computed(() =>
  [
    ...new Set(
      (channels.value || [])
        .map((c: any) => (typeof c.category === "string" ? c.category.trim() : ""))
        .filter(Boolean)
    ),
  ].sort((a, b) => a.localeCompare(b))
);

const moveTarget = ref<HoaChannel | null>(null);
const moveValue = ref("");
const moving = ref(false);

const openMove = (ch: HoaChannel) => {
  moveTarget.value = ch;
  moveValue.value = ((ch as any).category || "").trim();
};

const saveMove = async () => {
  const ch = moveTarget.value;
  if (!ch) return;
  moving.value = true;
  try {
    await updateChannel(ch.id, { category: moveValue.value.trim() || null } as any);
    moveTarget.value = null;
    await refresh();
  } catch (e: any) {
    toast.error(e?.data?.message || "Couldn't move the channel");
  } finally {
    moving.value = false;
  }
};

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
          <div
            v-for="channel in pinnedChannels"
            :key="channel.id"
            class="channel-row group"
          >
            <button
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
              <span class="truncate text-sm" :class="unreadFor(channel) ? 'font-semibold t-text' : ''">
                {{ channel.name }}
              </span>
              <span v-if="unreadFor(channel)" class="channel-badge ml-auto">{{ unreadLabel(channel) }}</span>
              <Icon v-else name="lucide:pin" class="w-3 h-3 ml-auto shrink-0 opacity-40" />
            </button>
          </div>
        </div>
      </div>

      <!-- Public Channels (ungrouped first, then folders) -->
      <div v-if="publicRows.length" class="space-y-0.5">
        <template v-for="(row, i) in publicRows" :key="row.ch?.id || `h-${i}`">
          <div
            v-if="row.type === 'subheader'"
            class="flex items-center gap-1.5 px-3 pt-2 pb-1 text-[11px] font-medium t-text-muted"
          >
            <Icon name="lucide:folder" class="w-3 h-3 shrink-0" />
            <span class="truncate">{{ row.name }}</span>
          </div>
          <div v-else-if="row.ch" class="channel-row group">
            <button
              class="w-full flex items-center gap-2 px-3 py-1.5 text-left rounded-md transition-colors"
              :class="[
                selectedChannelSlug === row.ch.slug
                  ? 'bg-primary/10 text-primary font-medium'
                  : 't-text-secondary hover:t-bg-subtle',
              ]"
              @click="selectChannel(row.ch)"
            >
              <Icon name="lucide:hash" class="w-4 h-4 shrink-0 opacity-50" />
              <span class="truncate text-sm" :class="unreadFor(row.ch) ? 'font-semibold t-text' : ''">
                {{ row.ch.name }}
              </span>
              <span v-if="unreadFor(row.ch)" class="channel-badge ml-auto">{{ unreadLabel(row.ch) }}</span>
              <Badge
                v-else-if="row.ch.is_default"
                variant="secondary"
                class="ml-auto text-xs py-0"
              >
                default
              </Badge>
            </button>
            <button
              v-if="props.isAdmin"
              class="channel-row__action"
              title="Move to folder"
              @click.stop="openMove(row.ch)"
            >
              <Icon name="lucide:folder-input" class="w-3.5 h-3.5" />
            </button>
          </div>
        </template>
      </div>

      <!-- Private Channels -->
      <div v-if="privateRows.length">
        <div class="flex items-center gap-2 px-3 py-1 text-xs font-medium t-text-muted uppercase">
          <Icon name="lucide:lock" class="w-3 h-3" />
          Private
        </div>
        <div class="space-y-0.5">
          <template v-for="(row, i) in privateRows" :key="row.ch?.id || `ph-${i}`">
            <div
              v-if="row.type === 'subheader'"
              class="flex items-center gap-1.5 px-3 pt-2 pb-1 text-[11px] font-medium t-text-muted"
            >
              <Icon name="lucide:folder" class="w-3 h-3 shrink-0" />
              <span class="truncate">{{ row.name }}</span>
            </div>
            <div v-else-if="row.ch" class="channel-row group">
              <button
                class="w-full flex items-center gap-2 px-3 py-1.5 text-left rounded-md transition-colors"
                :class="[
                  selectedChannelSlug === row.ch.slug
                    ? 'bg-primary/10 text-primary font-medium'
                    : 't-text-secondary hover:t-bg-subtle',
                ]"
                @click="selectChannel(row.ch)"
              >
                <Icon name="lucide:lock" class="w-4 h-4 shrink-0 opacity-50" />
                <span class="truncate text-sm" :class="unreadFor(row.ch) ? 'font-semibold t-text' : ''">
                  {{ row.ch.name }}
                </span>
                <span v-if="unreadFor(row.ch)" class="channel-badge ml-auto">{{ unreadLabel(row.ch) }}</span>
              </button>
              <button
                v-if="props.isAdmin"
                class="channel-row__action"
                title="Move to folder"
                @click.stop="openMove(row.ch)"
              >
                <Icon name="lucide:folder-input" class="w-3.5 h-3.5" />
              </button>
            </div>
          </template>
        </div>
      </div>

      <!-- Empty State -->
      <div v-if="!hasAnyChannel" class="px-3 py-8 text-center">
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

    <!-- Move to folder -->
    <Dialog :open="!!moveTarget" @update:open="(v: boolean) => { if (!v) moveTarget = null; }">
      <DialogContent class="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Move #{{ moveTarget?.name }}</DialogTitle>
          <DialogDescription>
            Group this channel under a folder in the sidebar. Leave it empty to
            ungroup it.
          </DialogDescription>
        </DialogHeader>
        <Input v-model="moveValue" list="channel-folders" placeholder="Folder name" />
        <datalist id="channel-folders">
          <option v-for="f in knownFolders" :key="f" :value="f" />
        </datalist>
        <DialogFooter class="gap-2">
          <Button variant="outline" :disabled="moving" @click="moveTarget = null">Cancel</Button>
          <Button :disabled="moving" @click="saveMove">Move</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>

<style scoped>
@reference "#core/app/assets/css/tailwind.css";

.channel-row {
  position: relative;
}
/* The folder action sits over the row's trailing edge and only appears on
   hover/focus, so the roster stays a list of names rather than a list of
   controls. Hidden entirely on touch, where there is no hover to reveal it —
   the channel header's menu is the path there. */
.channel-row__action {
  position: absolute;
  top: 50%;
  right: 0.35rem;
  transform: translateY(-50%);
  display: none;
  align-items: center;
  justify-content: center;
  width: 1.5rem;
  height: 1.5rem;
  border-radius: 9999px;
  color: var(--theme-text-muted);
  background: var(--theme-bg-elevated, transparent);
}
@media (hover: hover) {
  .channel-row:hover .channel-row__action,
  .channel-row__action:focus-visible {
    display: inline-flex;
  }
  .channel-row__action:hover {
    color: var(--theme-text);
  }
}

.channel-badge {
  flex-shrink: 0;
  min-width: 1.25rem;
  padding: 0 0.3rem;
  border-radius: 9999px;
  background: hsl(var(--primary));
  color: hsl(var(--primary-foreground));
  font-size: 0.625rem;
  font-weight: 700;
  line-height: 1.25rem;
  text-align: center;
}
</style>
