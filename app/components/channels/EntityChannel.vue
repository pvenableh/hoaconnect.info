<script setup lang="ts">
// The channel behind a record, inline (Parity Round 3, Phase 7.5): when the
// record has a linked channel its thread renders right here; when it doesn't,
// "Start a channel" makes one (admins + active board are enrolled by the server)
// and links it. Used by the project page; the request detail has its own copy of
// the verb because it also invites the ticket's author.
//
// Mounted lazily by its parent (a tab / toggle), so a record nobody is
// discussing holds no realtime subscription or presence heartbeat.
import { toast } from "vue-sonner";

const props = defineProps<{
  organizationId: string;
  /** The `hoa_channels` column that links the record: request | project | vendor. */
  link: "request" | "project" | "vendor";
  entityId: string;
  entityTitle: string;
  canManage?: boolean;
}>();

const { list: listChannels } = useDirectusItems("hoa_channels");
const channel = ref<{ id: string; name: string; slug: string } | null>(null);
const loading = ref(true);
const starting = ref(false);

const load = async () => {
  loading.value = true;
  try {
    const rows = (await listChannels({
      fields: ["id", "name", "slug"],
      filter: { [props.link]: { _eq: props.entityId }, status: { _eq: "published" } },
      limit: 1,
    })) as any[];
    channel.value = rows?.[0] || null;
  } catch {
    // The link column may not exist yet on an unmigrated database.
    channel.value = null;
  } finally {
    loading.value = false;
  }
};
onMounted(load);
watch(() => props.entityId, load);

const start = async () => {
  starting.value = true;
  try {
    const slug = `${props.link}-${props.entityId.slice(0, 8)}`;
    const res = await $fetch<{ channel: { id: string; name: string; slug: string } }>(
      "/api/hoa/channels/create",
      {
        method: "POST",
        body: {
          organization: props.organizationId,
          name: `${props.link === "project" ? "Project" : props.link === "vendor" ? "Vendor" : "Ticket"}: ${props.entityTitle}`.slice(0, 80),
          slug,
          description: `Internal discussion for “${props.entityTitle}”.`,
          is_private: false,
          [props.link]: props.entityId,
        },
      }
    );
    channel.value = res.channel;
    toast.success("Channel started");
  } catch (e: any) {
    toast.error(e?.data?.message || "Couldn't start the channel");
  } finally {
    starting.value = false;
  }
};
</script>

<template>
  <div data-testid="entity-channel">
    <div v-if="loading" class="ios-card p-6 text-center text-sm t-text-muted">Loading…</div>

    <div
      v-else-if="channel"
      class="h-[34rem] rounded-2xl overflow-hidden glass-surface flex flex-col"
      data-testid="entity-channel-thread"
    >
      <ClientOnly>
        <ChannelsChannelThread
          :organization-id="organizationId"
          :channel-slug="channel.slug"
          :is-admin="!!canManage"
          :can-manage="!!canManage"
          embedded
          @archived="channel = null"
          @deleted="channel = null"
        />
      </ClientOnly>
    </div>

    <div v-else class="ios-card p-6">
      <AppEmptyState
        icon="lucide:message-square-plus"
        title="No channel for this yet"
        description="Start one to discuss it with the board in one place."
        size="sm"
      >
        <template v-if="canManage" #actions>
          <Button :disabled="starting" data-testid="start-channel" @click="start">
            <Icon
              :name="starting ? 'lucide:loader-2' : 'lucide:message-square-plus'"
              :class="['w-4 h-4 mr-1', starting ? 'animate-spin' : '']"
            />
            Start a channel
          </Button>
        </template>
      </AppEmptyState>
    </div>
  </div>
</template>
