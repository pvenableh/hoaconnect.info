<script setup lang="ts">
import type { HoaEmail, HoaAnnouncement, HoaChannel } from "#core/types/directus"

const { list: listDocuments } = useDirectusItems("hoa_documents");
const { list: listMembers } = useDirectusItems("hoa_members");
const { list: listUnits } = useDirectusItems("hoa_units");
const { list: listEmails } = useDirectusItems("hoa_emails");
const { list: listChannels } = useDirectusItems("hoa_channels");
const { list: listChannelMessages } = useDirectusItems("hoa_channel_messages");
const { list: listAnnouncements } = useDirectusItems("hoa_announcements");
const { buildOrgPath, navigateToOrg } = useOrgNavigation();

// Await to ensure org is loaded during SSR
const { selectedOrgId, currentOrg, currentRole, isAdmin, isBoardMember, isMember } = await useSelectedOrg();

// Watch for org changes and refresh data
const orgId = computed(() => selectedOrgId.value);

// ---- Tabbed dashboard: Overview + Building feed (Phase 9) ----
const { isEnabled } = useModules();
const feedEnabled = computed(() => isEnabled("feed"));
const isBoard = computed(() => isAdmin.value || isBoardMember.value);

// Deep-linkable tab state. useTabQuery replaces the two hand-rolled watchers
// that used to keep this in sync with `?tab=`, and applies the same rule the
// rest of the app follows: replace, not push, so Back leaves the dashboard.
const activeTab = useTabQuery({
  values: ["overview", "building"],
  fallback: "overview",
});

// "Building" only exists when the feed module is on; if it is off, a stale
// `?tab=building` link should land on Overview rather than an empty panel.
watchEffect(() => {
  if (activeTab.value === "building" && !feedEnabled.value) {
    activeTab.value = "overview";
  }
});

const tabItems = computed(() => [
  { value: "overview", label: "Overview", icon: "lucide:layout-dashboard" },
  ...(feedEnabled.value
    ? [{ value: "building", label: "Building", icon: "lucide:building-2" }]
    : []),
]);

// Fetch recent documents
const { data: documents } = await useAsyncData(
  `dashboard-docs-${orgId.value}`,
  async () => {
    if (!orgId.value) return [];
    const result = await listDocuments({
      fields: ["id", "title", "document_category.name", "date_published"],
      filter: {
        organization: { _eq: orgId.value },
        status: { _eq: "published" },
      },
      sort: ["sort", "-date_published"],
      limit: 5,
    });
    return result || [];
  },
  {
    watch: [orgId],
  }
);

// Fetch members with type breakdown
const { data: members } = await useAsyncData(
  `dashboard-members-${orgId.value}`,
  async () => {
    if (!orgId.value) return [];
    const result = await listMembers({
      fields: ["id", "member_type", "date_created"],
      filter: {
        organization: { _eq: orgId.value },
        status: { _in: ["active", "inactive"] },
      },
    });
    return result || [];
  },
  {
    watch: [orgId],
  }
);

// Fetch units count
const { data: units } = await useAsyncData(
  `dashboard-units-${orgId.value}`,
  async () => {
    if (!orgId.value) return [];
    const result = await listUnits({
      fields: ["id"],
      filter: {
        organization: { _eq: orgId.value },
        status: { _in: ["active", "inactive"] },
      },
    });
    return result || [];
  },
  {
    watch: [orgId],
  }
);

// Fetch recent emails
const { data: emails } = await useAsyncData(
  `dashboard-emails-${orgId.value}`,
  async () => {
    if (!orgId.value) return [];
    try {
      const result = await listEmails({
        fields: ["id", "subject", "status", "email_type", "recipient_count", "delivered_count", "failed_count", "sent_at", "date_created"],
        filter: {
          organization: { _eq: orgId.value },
        },
        sort: ["-date_created"],
        limit: 10,
      });
      return (result || []) as HoaEmail[];
    } catch (e) {
      return [];
    }
  },
  {
    watch: [orgId],
    server: false,
  }
);

// Fetch channels with message counts
const { data: channels } = await useAsyncData(
  `dashboard-channels-${orgId.value}`,
  async () => {
    if (!orgId.value) return [];
    try {
      const result = await listChannels({
        fields: ["id", "name", "slug"],
        filter: {
          organization: { _eq: orgId.value },
          status: { _eq: "published" },
        },
      });
      return (result || []) as HoaChannel[];
    } catch (e) {
      return [];
    }
  },
  {
    watch: [orgId],
    server: false,
  }
);

// Fetch announcements
const { data: announcements } = await useAsyncData(
  `dashboard-announcements-${orgId.value}`,
  async () => {
    if (!orgId.value) return [];
    try {
      const now = new Date().toISOString();
      const result = await listAnnouncements({
        fields: ["id", "title", "content", "announcement_type", "is_pinned", "publish_date", "date_created"],
        filter: {
          organization: { _eq: orgId.value },
          status: { _eq: "published" },
          _or: [
            { expiry_date: { _null: true } },
            { expiry_date: { _gte: now } },
          ],
        },
        sort: ["-is_pinned", "-publish_date", "-date_created"],
        limit: 5,
      });
      return (result || []) as HoaAnnouncement[];
    } catch (e) {
      return [];
    }
  },
  {
    watch: [orgId],
    server: false,
  }
);

// Computed stats
const stats = computed(() => ({
  documents: documents.value?.length || 0,
  members: members.value?.length || 0,
  units: units.value?.length || 0,
  organization:
    (typeof currentOrg.value?.organization === "object"
      ? currentOrg.value?.organization?.name
      : null) || "N/A",
  role: currentRole.value,
}));

// Member type breakdown
const memberBreakdown = computed(() => {
  const membersList = members.value || [];
  const owners = membersList.filter((m: any) => m.member_type === "owner").length;
  const tenants = membersList.filter((m: any) => m.member_type === "tenant").length;
  return { owners, tenants };
});

// Email stats
const emailStats = computed(() => {
  const emailsList = emails.value || [];
  const sent = emailsList.filter((e: HoaEmail) => e.status === "sent").length;
  const totalDelivered = emailsList.reduce((acc: number, e: HoaEmail) => acc + (e.delivered_count || 0), 0);
  const totalFailed = emailsList.reduce((acc: number, e: HoaEmail) => acc + (e.failed_count || 0), 0);
  return { sent, totalDelivered, totalFailed };
});

// Fetch real email activity data from Directus
const { data: emailActivityResponse } = await useAsyncData(
  `dashboard-email-activity-${orgId.value}`,
  async () => {
    if (!orgId.value) return null;
    try {
      const headers = useRequestHeaders(["cookie"]);
      const result = await $fetch(`/api/email/dashboard-activity`, {
        headers,
        query: { organizationId: orgId.value },
      });
      return result as {
        chartData: Array<{ date: string; sent: number; delivered: number; opened: number }>;
        stats: {
          totalSent: number;
          totalDelivered: number;
          totalOpens: number;
          uniqueOpens: number;
          totalClicks: number;
          uniqueClicks: number;
          totalBounces: number;
          openRate: number;
          clickRate: number;
        };
      };
    } catch (e) {
      console.error("Failed to fetch email activity:", e);
      return null;
    }
  },
  {
    watch: [orgId],
    server: false,
  }
);

// Email activity chart data (real data from API)
const emailActivityData = computed(() => {
  if (emailActivityResponse.value?.chartData) {
    return emailActivityResponse.value.chartData;
  }
  // Fallback to empty data if not available
  const days = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    days.push({
      date: date.toISOString().split("T")[0],
      sent: 0,
      delivered: 0,
      opened: 0,
    });
  }
  return days;
});

// Email engagement stats (real data from API)
const emailEngagementStats = computed(() => {
  return emailActivityResponse.value?.stats || {
    totalSent: 0,
    totalDelivered: 0,
    totalOpens: 0,
    uniqueOpens: 0,
    totalClicks: 0,
    uniqueClicks: 0,
    totalBounces: 0,
    openRate: 0,
    clickRate: 0,
  };
});

// Activity timeline data (combining real email data with document/member counts)
const activityData = computed(() => {
  // Use email activity data as the base
  return emailActivityData.value.map(day => ({
    date: day.date,
    documents: 0, // Could be enhanced with real document activity
    emails: day.sent,
    members: 0, // Could be enhanced with real member activity
  }));
});

// Channels for the (optional) Channels widget — real list, no synthetic counts.
const topChannels = computed(() => (channels.value || []).slice(0, 6));
const channelsPanel = useChannelsPanel();

// Launcher shortcuts (the "Shortcuts" widget) — fast lanes into nested routes so
// the lean dock doesn't bury anything. Gated by each area's module toggle.
const shortcuts = computed(() =>
  [
    { label: "Approvals", icon: "clipboard-check", to: "/admin/approvals", show: true },
    { label: "Requests", icon: "clipboard-list", to: "/admin/requests", show: isEnabled("requests") },
    { label: "Moderation", icon: "shield-alert", to: "/admin/moderation", show: isEnabled("moderation") },
    { label: "Meetings", icon: "calendar-days", to: "/admin/meetings", show: isEnabled("meetings") },
    { label: "Documents", icon: "file-text", to: "/admin/documents", show: isEnabled("documents") },
    { label: "Storage", icon: "folder", to: "/admin/files", show: isEnabled("files") },
    { label: "Members", icon: "users-round", to: "/admin/members", show: isEnabled("directory") },
    { label: "Expenses", icon: "receipt", to: "/admin/expenses", show: isEnabled("expenses") },
    { label: "Teams", icon: "users", to: "/admin/teams", show: true },
  ].filter((s) => s.show)
);

// Live count of pending resident change requests, shown as a badge on the
// Approvals shortcut so reviewers notice waiting work without opening it.
const { listRequests: listChangeRequests } = useChangeRequests();
const pendingApprovals = ref(0);
onMounted(async () => {
  try {
    const r = await listChangeRequests("pending");
    pendingApprovals.value = r.requests?.length || 0;
  } catch {
    /* non-reviewer or no org — leave at 0 */
  }
});

// ---- Customizable widget grid (iOS-home-screen style) ----
// This page is admin-only (admin middleware), so admins see admin+board widgets.
const {
  visible: visibleWidgets,
  hidden: hiddenWidgets,
  isEditing,
  toggleEdit,
  hide: hideWidget,
  show: showWidget,
  move: moveWidget,
  reorder: reorderWidget,
  reset: resetWidgets,
} = useDashboardWidgets({ roles: ["admin", "board"] });
</script>

<template>
  <div class="min-h-screen t-bg">
    <PageContainer class="space-y-6">
        <AppPageHeader
          :eyebrow="stats.organization"
          title="Dashboard"
          description="Here's how your community is doing."
        />

        <AppSegmentedControl v-model="activeTab" :items="tabItems" label="Dashboard views" />

        <AppTabPanels :value="activeTab" :items="tabItems">
          <div v-if="activeTab === 'overview'" class="space-y-4">
            <!-- Edit toolbar — toggle the iOS-home-screen-style customization -->
            <div class="flex items-center justify-between">
              <p class="text-sm t-text-muted">
                {{ isEditing ? "Drag cards to rearrange, or use the arrows. Tap × to remove." : "Your dashboard, your way." }}
              </p>
              <Button variant="outline" size="sm" class="rounded-full" @click="toggleEdit">
                <Icon :name="isEditing ? 'lucide:check' : 'lucide:layout-grid'" class="w-4 h-4 mr-1.5" />
                {{ isEditing ? "Done" : "Customize" }}
              </Button>
            </div>

            <ClientOnly>
              <template #fallback>
                <div class="flex items-center justify-center min-h-[300px]">
                  <div class="spinner-ios" />
                </div>
              </template>

              <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <DashboardWidgetCard
                  v-for="(w, i) in visibleWidgets"
                  :key="w.key"
                  v-motion
                  :initial="{ opacity: 0, y: 16 }"
                  :enter="{
                    opacity: 1,
                    y: 0,
                    transition: { type: 'spring', stiffness: 220, damping: 28, delay: i * 40 },
                  }"
                  :widget="w"
                  :editing="isEditing"
                  :is-first="i === 0"
                  :is-last="i === visibleWidgets.length - 1"
                  @hide="hideWidget"
                  @move="moveWidget"
                  @reorder="reorderWidget"
                >
                  <!-- Quick Actions -->
                  <div v-if="w.key === 'quick-actions'" class="ios-card p-5">
                    <h3 class="font-semibold t-text mb-3">Quick Actions</h3>
                    <div class="flex flex-wrap gap-2">
                      <Button @click="navigateToOrg('/admin/documents/upload')" class="rounded-full">
                        <Icon name="heroicons:arrow-up-tray" class="h-4 w-4 mr-2" />
                        Upload Document
                      </Button>
                      <Button @click="navigateToOrg('/admin/members')" variant="outline" class="rounded-full">
                        <Icon name="heroicons:user-plus" class="h-4 w-4 mr-2" />
                        Invite Member
                      </Button>
                      <Button @click="navigateToOrg('/admin/communications/compose')" variant="outline" class="rounded-full">
                        <Icon name="heroicons:envelope" class="h-4 w-4 mr-2" />
                        Send Email
                      </Button>
                      <Button @click="navigateToOrg('/admin/units')" variant="outline" class="rounded-full">
                        <Icon name="heroicons:building-office" class="h-4 w-4 mr-2" />
                        Manage Units
                      </Button>
                      <Button @click="navigateToOrg('/admin/settings')" variant="outline" class="rounded-full">
                        <Icon name="heroicons:cog-6-tooth" class="h-4 w-4 mr-2" />
                        Settings
                      </Button>
                    </div>
                  </div>

                  <!-- Shortcuts launcher -->
                  <div v-else-if="w.key === 'shortcuts'" class="ios-card p-5">
                    <h3 class="font-semibold t-text mb-3">Shortcuts</h3>
                    <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                      <NuxtLink
                        v-for="s in shortcuts"
                        :key="s.to"
                        :to="buildOrgPath(s.to)"
                        class="flex items-center gap-2 px-3 py-2.5 rounded-xl t-bg-subtle hover:opacity-80 transition-opacity"
                      >
                        <Icon :name="'i-lucide-' + s.icon" class="w-4 h-4 t-text-secondary shrink-0" />
                        <span class="text-sm font-medium t-text truncate">{{ s.label }}</span>
                        <span
                          v-if="s.to === '/admin/approvals' && pendingApprovals > 0"
                          class="ml-auto inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-amber-500 text-white text-[11px] font-semibold"
                          >{{ pendingApprovals }}</span
                        >
                      </NuxtLink>
                    </div>
                  </div>

                  <!-- Key Stats -->
                  <div v-else-if="w.key === 'stats'" class="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <DashboardStatsCard title="Documents" :value="stats.documents" description="Published documents" icon="heroicons:document-text" accent="blue" />
                    <DashboardStatsCard title="Units" :value="stats.units" description="Total units" icon="heroicons:building-office" accent="violet" />
                    <DashboardStatsCard title="Members" :value="stats.members" description="Owners & Tenants" icon="heroicons:users" accent="emerald" />
                    <DashboardStatsCard title="Emails Sent" :value="emailStats.sent" description="Communications sent" icon="heroicons:envelope" accent="amber" />
                  </div>

                  <!-- Owners vs Tenants -->
                  <DashboardMembershipDonutChart
                    v-else-if="w.key === 'members-donut'"
                    :owners="memberBreakdown.owners"
                    :tenants="memberBreakdown.tenants"
                  />

                  <!-- Activity Timeline -->
                  <DashboardActivityTimelineChart v-else-if="w.key === 'activity-timeline'" :data="activityData" />

                  <!-- Email Activity -->
                  <DashboardEmailActivityChart v-else-if="w.key === 'email-activity'" :data="emailActivityData" />

                  <!-- Email Engagement -->
                  <div v-else-if="w.key === 'email-engagement'">
                    <div v-if="emailEngagementStats.totalSent > 0" class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                      <div class="ios-card p-4 text-center">
                        <p class="text-2xl font-semibold tabular-nums t-text">{{ emailEngagementStats.totalSent }}</p>
                        <p class="text-xs t-text-muted mt-0.5">Total Sent</p>
                      </div>
                      <div class="ios-card p-4 text-center">
                        <p class="text-2xl font-semibold tabular-nums text-emerald-600">{{ emailEngagementStats.totalDelivered }}</p>
                        <p class="text-xs t-text-muted mt-0.5">Delivered</p>
                      </div>
                      <div class="ios-card p-4 text-center">
                        <p class="text-2xl font-semibold tabular-nums t-text">{{ emailEngagementStats.uniqueOpens }}</p>
                        <p class="text-xs t-text-muted mt-0.5">Unique Opens</p>
                      </div>
                      <div class="ios-card p-4 text-center">
                        <p class="text-2xl font-semibold tabular-nums t-text">{{ emailEngagementStats.uniqueClicks }}</p>
                        <p class="text-xs t-text-muted mt-0.5">Unique Clicks</p>
                      </div>
                      <div class="ios-card p-4 text-center">
                        <p class="text-2xl font-semibold tabular-nums t-text">{{ emailEngagementStats.openRate }}%</p>
                        <p class="text-xs t-text-muted mt-0.5">Open Rate</p>
                      </div>
                      <div class="ios-card p-4 text-center">
                        <p class="text-2xl font-semibold tabular-nums t-text">{{ emailEngagementStats.clickRate }}%</p>
                        <p class="text-xs t-text-muted mt-0.5">Click Rate</p>
                      </div>
                    </div>
                    <div v-else class="ios-card p-5 text-center t-text-muted">
                      No email engagement data yet — send a campaign to see opens and clicks here.
                    </div>
                  </div>

                  <!-- Recent Documents -->
                  <div v-else-if="w.key === 'recent-documents'" class="ios-card p-5 flex flex-col h-full">
                    <h3 class="font-semibold t-text mb-3">Recent Documents</h3>
                    <div v-if="documents?.length" class="space-y-1 flex-1">
                      <NuxtLink
                        v-for="doc in documents"
                        :key="doc.id"
                        :to="buildOrgPath(`/documents/${doc.id}`)"
                        class="block px-3 py-2.5 rounded-xl hover:bg-black/[0.03] dark:hover:bg-white/[0.04] transition-colors"
                      >
                        <p class="font-medium t-text truncate">{{ doc.title }}</p>
                        <p class="text-sm t-text-muted truncate">{{ doc.document_category?.name }}</p>
                      </NuxtLink>
                    </div>
                    <p v-else class="t-text-muted py-4 text-center flex-1">No documents yet</p>
                    <Button @click="navigateToOrg('/documents')" variant="outline" class="w-full mt-3 rounded-full">
                      View All Documents
                    </Button>
                  </div>

                  <!-- Recent Emails -->
                  <DashboardRecentEmailsList v-else-if="w.key === 'recent-emails'" :emails="emails || []" />

                  <!-- Channels -->
                  <div v-else-if="w.key === 'channels'" class="ios-card p-5 flex flex-col">
                    <div class="flex items-center justify-between mb-3">
                      <h3 class="font-semibold t-text">Channels</h3>
                      <Button variant="ghost" size="sm" class="rounded-full" @click="channelsPanel.open()">
                        <Icon name="lucide:messages-square" class="w-4 h-4 mr-1.5" />
                        Open chat
                      </Button>
                    </div>
                    <div v-if="topChannels.length" class="space-y-1 flex-1">
                      <NuxtLink
                        v-for="ch in topChannels"
                        :key="ch.id"
                        :to="buildOrgPath(`/admin/channels/${ch.slug}`)"
                        class="flex items-center gap-2 px-3 py-2.5 rounded-xl hover:bg-black/[0.03] dark:hover:bg-white/[0.04] transition-colors"
                      >
                        <Icon name="lucide:hash" class="w-4 h-4 t-text-muted shrink-0" />
                        <span class="font-medium t-text truncate">{{ ch.name }}</span>
                      </NuxtLink>
                    </div>
                    <p v-else class="t-text-muted py-4 text-center flex-1">No channels yet</p>
                  </div>
                </DashboardWidgetCard>
              </div>

              <!-- Add-widget tray (edit mode) -->
              <DashboardWidgetGallery
                v-if="isEditing"
                :hidden="hiddenWidgets"
                class="mt-4"
                @add="showWidget"
                @reset="resetWidgets"
              />
            </ClientOnly>
          </div>

          <!-- Building feed tab -->
          <div v-else-if="activeTab === 'building' && feedEnabled" class="space-y-6">
            <div class="flex items-start justify-between gap-2">
              <div>
                <h2 class="type-section type-flush">Building</h2>
                <p class="type-meta">
                  Everything happening in your community — react and join the conversation.
                </p>
              </div>
              <NuxtLink :to="buildOrgPath('/polls')">
                <Button variant="outline" class="rounded-full">
                  <Icon name="lucide:bar-chart-3" class="w-4 h-4 mr-1.5" />
                  Polls
                </Button>
              </NuxtLink>
            </div>
            <FeedActivityFeed
              :organization-id="selectedOrgId"
              :is-board="isBoard"
              :is-member="isMember"
            />
          </div>
        </AppTabPanels>
      </PageContainer>
  </div>
</template>
