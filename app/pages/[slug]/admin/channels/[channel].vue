<script setup lang="ts">
definePageMeta({
  middleware: ["channel-access", "subscription"],
  layout: "auth",
  // Full height inside the workspace shell: the footer hides, the dock stays.
  immersive: true,
  // No route animation when switching channels — just swap the content.
  pageTransition: false,
});

const route = useRoute();
const { selectedOrgId, currentOrg } = await useSelectedOrg();
const { isAdminOfCurrentDomain, isBoardMemberOfCurrentDomain } = useCurrentDomainAccess();

const orgId = computed(() => selectedOrgId.value);
const orgName = computed(() => currentOrg.value?.organization?.name || "Channels");
const isAdmin = computed(() => isAdminOfCurrentDomain.value);
const canManage = computed(() => isAdmin.value || isBoardMemberOfCurrentDomain.value);

const channelSlug = computed(() => route.params.channel as string);
const highlightMessageId = computed(() => route.query.message as string | undefined);

// Anchor the AI assistant to the open channel. The route carries the slug, so we
// resolve the channel id (the dossier keys on id) client-side and set focus.
const { setContext: setAiFocus, clearContext: clearAiFocus } = useAiContext();
const { list: listChannelsForFocus } = useDirectusItems("hoa_channels");
async function syncChannelFocus() {
  const slug = channelSlug.value;
  if (!slug || !orgId.value) return clearAiFocus();
  try {
    const rows = await listChannelsForFocus({
      filter: { slug: { _eq: slug }, organization: { _eq: orgId.value } },
      fields: ["id", "name"],
      limit: 1,
    });
    const ch = rows?.[0] as any;
    if (ch?.id) setAiFocus({ entityType: "channel", entityId: String(ch.id), label: `#${ch.name || slug}` });
    else clearAiFocus();
  } catch {
    clearAiFocus();
  }
}
onMounted(syncChannelFocus);
watch(channelSlug, syncChannelFocus);
onBeforeUnmount(clearAiFocus);

</script>

<template>
  <div class="h-full min-h-0">
    <ClientOnly>
      <template #fallback>
        <div class="h-full flex items-center justify-center"><div class="spinner-ios" /></div>
      </template>
      <ChannelsWorkspace
        v-if="orgId"
        :organization-id="orgId"
        :org-name="orgName"
        :is-admin="isAdmin"
        :can-manage="canManage"
        :channel-slug="channelSlug"
        :highlight-message-id="highlightMessageId"
      />
    </ClientOnly>
  </div>
</template>
