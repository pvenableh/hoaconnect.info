<script setup lang="ts">
import { toast } from "vue-sonner";

const props = defineProps<{
  channelId: string;
  organizationId: string;
  isPrivate?: boolean;
  canManage?: boolean;
}>();

const isOpen = defineModel<boolean>("open", { default: false });

const { list: listChannelMembers } = useDirectusItems("hoa_channel_members");
const { list: listMembers } = useDirectusItems("hoa_members");

const members = ref<any[]>([]);
const orgMembers = ref<any[]>([]);
const loading = ref(false);
const query = ref("");
const busyUser = ref<string | null>(null);

const loadMembers = async () => {
  loading.value = true;
  try {
    members.value = (await listChannelMembers({
      fields: [
        "id",
        "role",
        "hoa_member",
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
      <div v-if="canManage" class="border-t border-black/[0.06] dark:border-white/[0.08] pt-3 space-y-2">
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
