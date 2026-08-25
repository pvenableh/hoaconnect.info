<script setup lang="ts">
import { toast } from "vue-sonner";
import { Switch } from "@/components/ui/switch";

const props = defineProps<{
  channelId: string;
  organizationId: string;
  isPrivate?: boolean;
  canManage?: boolean;
}>();

const isOpen = defineModel<boolean>("open", { default: false });

const { list: listChannelMembers } = useDirectusItems("hoa_channel_members");
const { list: listMembers } = useDirectusItems("hoa_members");
const { user } = useDirectusAuth();

const members = ref<any[]>([]);
const orgMembers = ref<any[]>([]);
const loading = ref(false);
const query = ref("");
const busyUser = ref<string | null>(null);

/**
 * The caller's own notification setting for this channel.
 *
 * `notifications_enabled` has been honoured by `channel-unread.ts` since Phase 3
 * — a muted channel reports its own count but is left out of the total — and
 * until now nothing in the app could set it.
 *
 * Defaults to unmuted when there is no membership row, which is the honest
 * reading: an admin who sees this channel org-wide has no row until they
 * interact with it, and no row has never meant "muted". The endpoint creates
 * the row on the first toggle.
 */
const muted = ref(false);
const muteBusy = ref(false);

const loadMembers = async () => {
  loading.value = true;
  try {
    members.value = (await listChannelMembers({
      fields: [
        "id",
        "role",
        "hoa_member",
        "notifications_enabled",
        "user.id",
        "user.first_name",
        "user.last_name",
        "user.email",
        "user.avatar",
      ],
      filter: { channel: { _eq: props.channelId } },
      sort: ["role", "date_created"],
      limit: -1,
    })) as any[];
    const mine = members.value.find((m) => m.user?.id && m.user.id === user.value?.id);
    // `!== false` rather than a truthy test: the column is nullable, and a null
    // there means "never set", which is not muted.
    muted.value = mine ? mine.notifications_enabled === false : false;
  } catch (e) {
    console.error("Error loading channel members:", e);
  } finally {
    loading.value = false;
  }
};

const loadOrgMembers = async () => {
  if (!props.canManage) return;
  try {
    orgMembers.value = (await listMembers({
      fields: [
        "id",
        "user.id",
        "user.first_name",
        "user.last_name",
        "user.email",
        "user.avatar",
      ],
      filter: {
        _and: [
          { organization: { _eq: props.organizationId } },
          { status: { _eq: "active" } },
        ],
      },
      sort: ["user.first_name"],
      limit: -1,
    })) as any[];
  } catch (e) {
    console.error("Error loading org members:", e);
  }
};

const memberUserIds = computed(
  () => new Set(members.value.map((m) => m.user?.id).filter(Boolean))
);

// Org members not already in the channel, filtered by the search query.
const invitable = computed(() => {
  const q = query.value.trim().toLowerCase();
  return orgMembers.value
    .filter((m) => m.user && !memberUserIds.value.has(m.user.id))
    .filter((m) => {
      if (!q) return true;
      const name = `${m.user.first_name || ""} ${m.user.last_name || ""} ${m.user.email || ""}`.toLowerCase();
      return name.includes(q);
    })
    .slice(0, 25);
});

const displayName = (u: any) =>
  u ? `${u.first_name || ""} ${u.last_name || ""}`.trim() || u.email || "Unknown" : "Unknown";

const invite = async (orgMember: any) => {
  if (!orgMember.user?.id) return;
  busyUser.value = orgMember.user.id;
  try {
    await $fetch("/api/hoa/channels/invite", {
      method: "POST",
      body: {
        channel: props.channelId,
        user: orgMember.user.id,
        hoa_member: orgMember.id,
      },
    });
    toast.success(`Added ${displayName(orgMember.user)}`);
    await loadMembers();
  } catch (e: any) {
    toast.error(e?.data?.message || "Failed to add member");
  } finally {
    busyUser.value = null;
  }
};

const toggleMute = async (next: boolean) => {
  const previous = muted.value;
  muted.value = next; // optimistic — the switch should not lag the tap
  muteBusy.value = true;
  try {
    await $fetch(`/api/hoa/channels/${props.channelId}/mute`, {
      method: "POST",
      body: { muted: next },
    });
    toast.success(next ? "Notifications muted" : "Notifications on");
    await loadMembers();
  } catch (e: any) {
    muted.value = previous;
    toast.error(e?.data?.message || "Couldn't change notifications");
  } finally {
    muteBusy.value = false;
  }
};

const removeMember = async (member: any) => {
  busyUser.value = member.user?.id || member.id;
  try {
    await $fetch("/api/hoa/channels/remove-member", {
      method: "POST",
      body: { id: member.id },
    });
    toast.success("Removed from channel");
    await loadMembers();
  } catch (e: any) {
    toast.error(e?.data?.message || "Failed to remove member");
  } finally {
    busyUser.value = null;
  }
};

watch(isOpen, (open) => {
  if (open) {
    query.value = "";
    loadMembers();
    loadOrgMembers();
  }
});
</script>

<template>
  <Dialog v-model:open="isOpen">
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2">
          Channel members
          <span
            v-if="isPrivate"
            class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium t-bg-subtle t-text-muted"
          >
            <Icon name="lucide:lock" class="w-3 h-3" /> Private
          </span>
        </DialogTitle>
        <DialogDescription>
          {{
            canManage
              ? "Add or remove people who can see this channel."
              : "People who can see this channel."
          }}
        </DialogDescription>
      </DialogHeader>

      <!-- Your own notification setting for this channel. Above the roster on
           purpose: this row is about you, everything below it is about other
           people, and a personal setting filed under a list of names is one
           nobody finds. -->
      <div class="ios-card flex items-center justify-between gap-3 rounded-xl px-3 py-2.5">
        <div class="flex items-center gap-2.5 min-w-0">
          <Icon
            :name="muted ? 'lucide:bell-off' : 'lucide:bell'"
            class="w-4 h-4 shrink-0 t-text-muted"
          />
          <div class="min-w-0">
            <p class="text-sm t-text">Notifications</p>
            <p class="text-xs t-text-muted">
              {{
                muted
                  ? "Muted — new messages still show a count here, but never in your badge."
                  : "New messages count towards your unread badge."
              }}
            </p>
          </div>
        </div>
        <Switch
          :model-value="!muted"
          :disabled="muteBusy"
          aria-label="Channel notifications"
          @update:model-value="toggleMute(!$event)"
        />
      </div>

      <!-- Current members -->
      <div class="space-y-1 max-h-60 overflow-y-auto">
        <div v-if="loading" class="py-6 flex justify-center">
          <div class="spinner-ios" />
        </div>
        <div
          v-for="m in members"
          :key="m.id"
          class="flex items-center justify-between gap-2 py-1.5"
        >
          <div class="flex items-center gap-2 min-w-0">
            <div
              class="w-8 h-8 rounded-full t-bg-subtle flex items-center justify-center text-xs font-medium shrink-0"
            >
              {{ (m.user?.first_name?.[0] || "?").toUpperCase() }}
            </div>
            <div class="min-w-0">
              <p class="text-sm t-text truncate">{{ displayName(m.user) }}</p>
              <p class="text-xs t-text-muted truncate">{{ m.user?.email }}</p>
            </div>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <span
              class="text-xs font-medium px-2 py-0.5 rounded-full t-bg-subtle t-text-muted capitalize"
              >{{ m.role || "member" }}</span
            >
            <button
              v-if="canManage"
              class="inline-flex items-center justify-center w-8 h-8 rounded-full t-bg-subtle hover:opacity-80 disabled:opacity-40"
              :disabled="busyUser === (m.user?.id || m.id)"
              title="Remove from channel"
              @click="removeMember(m)"
            >
              <Icon name="lucide:x" class="w-4 h-4" />
            </button>
          </div>
        </div>
        <p v-if="!loading && !members.length" class="text-sm t-text-muted py-4 text-center">
          No members yet.
        </p>
      </div>

      <!-- Invite picker -->
      <div v-if="canManage" class="border-t t-border pt-3 space-y-2">
        <Input v-model="query" placeholder="Search members to add…" />
        <div class="space-y-1 max-h-48 overflow-y-auto">
          <button
            v-for="om in invitable"
            :key="om.id"
            class="w-full flex items-center justify-between gap-2 py-1.5 px-2 rounded-lg hover:t-bg-subtle text-left disabled:opacity-40"
            :disabled="busyUser === om.user?.id"
            @click="invite(om)"
          >
            <div class="flex items-center gap-2 min-w-0">
              <div
                class="w-8 h-8 rounded-full t-bg-subtle flex items-center justify-center text-xs font-medium shrink-0"
              >
                {{ (om.user?.first_name?.[0] || "?").toUpperCase() }}
              </div>
              <div class="min-w-0">
                <p class="text-sm t-text truncate">{{ displayName(om.user) }}</p>
                <p class="text-xs t-text-muted truncate">{{ om.user?.email }}</p>
              </div>
            </div>
            <Icon name="lucide:plus" class="w-4 h-4 t-text-muted shrink-0" />
          </button>
          <p
            v-if="!invitable.length"
            class="text-sm t-text-muted py-3 text-center"
          >
            No members to add.
          </p>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>
