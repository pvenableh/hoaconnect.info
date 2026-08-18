<script setup lang="ts">
import type { HoaChannel } from "#core/types/directus";

// Slide-over Channels panel — chat as an overlay over the current page, not a
// full-page destination. Opened from the dock's "Channels" button. Single-column:
// a channel list that swaps to the thread when you pick one.
const { isOpen, activeChannelSlug, close, setChannel } = useChannelsPanel();
const { buildOrgPath } = useOrgNavigation();

// The panel is the quick-peek surface; the full /admin/channels workspace is the
// expanded view. "Open full view" routes there (deep-linking the active channel)
// and closes the overlay so the two Channels entry points stay consistent.
const openFullView = () => {
  const target = activeChannelSlug.value
    ? `/admin/channels/${activeChannelSlug.value}`
    : "/admin/channels";
  close();
  navigateTo(buildOrgPath(target));
};

// Read the shared selected-org state directly (synchronous; same source the
// dashboard/email pages use) so the panel works without an async org load.
const selectedOrgId = useState<string | null>("selectedOrgId", () => null);
const orgId = computed(() => selectedOrgId.value);
const { isAdminOfCurrentDomain, isBoardMemberOfCurrentDomain } = useCurrentDomainAccess();
const isAdmin = computed(() => isAdminOfCurrentDomain.value);
const canManage = computed(() => isAdmin.value || isBoardMemberOfCurrentDomain.value);

const showCreate = ref(false);
const onSelect = (channel: HoaChannel) => setChannel(channel.slug);
const onCreated = (channel: any) => {
  showCreate.value = false;
  setChannel(channel.slug);
};

// Esc closes the panel
const onKey = (e: KeyboardEvent) => {
  if (e.key === "Escape" && isOpen.value) close();
};
onMounted(() => window.addEventListener("keydown", onKey));
onBeforeUnmount(() => window.removeEventListener("keydown", onKey));
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-opacity duration-200"
      leave-active-class="transition-opacity duration-150"
      enter-from-class="opacity-0"
      leave-to-class="opacity-0"
    >
      <div v-if="isOpen" class="fixed inset-0 z-[60]" role="dialog" aria-label="Channels">
        <!-- Backdrop -->
        <div class="absolute inset-0 bg-black/25 backdrop-blur-[1px]" @click="close" />

        <!-- Drawer -->
        <Transition
          enter-active-class="transition-transform duration-250 ease-out"
          leave-active-class="transition-transform duration-200 ease-in"
          enter-from-class="translate-x-full"
          leave-to-class="translate-x-full"
          appear
        >
          <aside
            v-if="isOpen"
            class="absolute top-0 right-0 h-full w-full sm:w-[440px] md:w-[640px] t-bg-elevated shadow-2xl flex flex-col"
          >
            <!-- Panel header -->
            <div class="flex items-center justify-between px-4 h-14 border-b t-border shrink-0">
              <div class="flex items-center gap-2 min-w-0">
                <button
                  v-if="activeChannelSlug"
                  class="inline-flex items-center justify-center w-8 h-8 rounded-full t-bg-subtle hover:opacity-80"
                  title="All channels"
                  @click="setChannel(null)"
                >
                  <Icon name="lucide:chevron-left" class="w-4 h-4" />
                </button>
                <Icon name="lucide:messages-square" class="w-5 h-5 t-text-muted shrink-0" />
                <span class="font-semibold truncate">Channels</span>
              </div>
              <div class="flex items-center gap-1.5">
                <button
                  class="inline-flex items-center gap-1.5 h-8 px-3 rounded-full t-bg-subtle hover:opacity-80 text-xs font-medium"
                  title="Open the full Channels workspace"
                  @click="openFullView"
                >
                  <Icon name="lucide:maximize-2" class="w-3.5 h-3.5" />
                  <span class="hidden sm:inline">Open full view</span>
                </button>
                <button
                  class="inline-flex items-center justify-center w-8 h-8 rounded-full t-bg-subtle hover:opacity-80"
                  title="Close"
                  @click="close"
                >
                  <Icon name="lucide:x" class="w-4 h-4" />
                </button>
              </div>
            </div>

            <!-- Body -->
            <div class="flex-1 min-h-0 flex flex-col">
              <ClientOnly>
                <template #fallback>
                  <div class="h-full flex items-center justify-center"><div class="spinner-ios" /></div>
                </template>

                <!-- List mode -->
                <div v-if="!activeChannelSlug" class="flex-1 min-h-0 overflow-y-auto">
                  <ChannelsList
                    v-if="orgId"
                    :organization-id="orgId"
                    :is-admin="isAdmin"
                    @select="onSelect"
                    @create="showCreate = true"
                  />
                  <div v-else class="h-full flex items-center justify-center t-text-muted text-sm">
                    No organization selected.
                  </div>
                </div>

                <!-- Thread mode -->
                <ChannelsChannelThread
                  v-else-if="orgId"
                  :organization-id="orgId"
                  :channel-slug="activeChannelSlug"
                  :is-admin="isAdmin"
                  :can-manage="canManage"
                  embedded
                  @back="setChannel(null)"
                  @archived="setChannel(null)"
                  @deleted="setChannel(null)"
                />
              </ClientOnly>
            </div>

            <!-- Create Channel Modal -->
            <ChannelsCreateChannelModal
              v-if="orgId"
              v-model:open="showCreate"
              :organization-id="orgId"
              @created="onCreated"
            />
          </aside>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>
