<script setup lang="ts">
import type { HoaEmail, HoaAnnouncement, HoaChannel } from "~~/types/directus"

const { list: listDocuments } = useDirectusItems("hoa_documents");
const { list: listMembers } = useDirectusItems("hoa_members");
const { list: listUnits } = useDirectusItems("hoa_units");
const { list: listEmails } = useDirectusItems("hoa_emails");
const { list: listChannels } = useDirectusItems("hoa_channels");
const { list: listChannelMessages } = useDirectusItems("hoa_channel_messages");
const { list: listAnnouncements } = useDirectusItems("hoa_announcements");
const { buildOrgPath, navigateToOrg } = useOrgNavigation();

// Await to ensure org is loaded during SSR
const { selectedOrgId, currentOrg, currentRole } = await useSelectedOrg();

// Watch for org changes and refresh data
const orgId = computed(() => selectedOrgId.value);

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

// Channel activity data
const channelData = computed(() => {
  return (channels.value || []).slice(0, 5).map((channel: HoaChannel) => ({
    name: channel.name,
    messages: Math.floor(Math.random() * 50) + 5, // TODO: Replace with real message counts
    members: Math.floor(Math.random() * 20) + 3,  // TODO: Replace with real member counts
  }));
});
</script>

<template>
  <div class="min-h-screen t-bg">
    <div class="p-6">
      <div class="max-w-7xl mx-auto space-y-6">
        <!-- Header -->
        <div>
          <h1 class="text-3xl font-bold t-text">Dashboard</h1>
          <p class="t-text-secondary">{{ stats.organization }}</p>
        </div>

        <!-- Stats Row -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
          <DashboardStatsCard
            title="Documents"
            :value="stats.documents"
            description="Published documents"
            icon="heroicons:document-text"
          />
          <DashboardStatsCard
            title="Units"
            :value="stats.units"
            description="Total units"
            icon="heroicons:building-office"
          />
          <DashboardStatsCard
            title="Members"
            :value="stats.members"
            description="Owners & Tenants"
            icon="heroicons:users"
          />
          <DashboardStatsCard
            title="Emails Sent"
            :value="emailStats.sent"
            description="Communications sent"
            icon="heroicons:envelope"
          />
        </div>

        <!-- Charts Row -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <!-- Owners vs Tenants Chart -->
          <DashboardMembershipDonutChart
            :owners="memberBreakdown.owners"
            :tenants="memberBreakdown.tenants"
          />

          <!-- Activity Timeline -->
          <DashboardActivityTimelineChart :data="activityData" />

          <!-- Email Activity -->
          <DashboardEmailActivityChart :data="emailActivityData" />
        </div>

        <!-- Email Engagement Stats (from real-time Directus data) -->
        <div v-if="emailEngagementStats.totalSent > 0" class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <Card class="p-4 t-bg-elevated">
            <div class="text-center">
              <p class="text-2xl font-bold t-text-accent">{{ emailEngagementStats.totalSent }}</p>
              <p class="text-xs t-text-muted">Total Sent</p>
            </div>
          </Card>
          <Card class="p-4 t-bg-elevated">
            <div class="text-center">
              <p class="text-2xl font-bold text-green-600">{{ emailEngagementStats.totalDelivered }}</p>
              <p class="text-xs t-text-muted">Delivered</p>
            </div>
          </Card>
          <Card class="p-4 t-bg-elevated">
            <div class="text-center">
              <p class="text-2xl font-bold t-text-accent">{{ emailEngagementStats.uniqueOpens }}</p>
              <p class="text-xs t-text-muted">Unique Opens</p>
            </div>
          </Card>
          <Card class="p-4 t-bg-elevated">
            <div class="text-center">
              <p class="text-2xl font-bold t-text-accent">{{ emailEngagementStats.uniqueClicks }}</p>
              <p class="text-xs t-text-muted">Unique Clicks</p>
            </div>
          </Card>
          <Card class="p-4 t-bg-elevated">
            <div class="text-center">
              <p class="text-2xl font-bold t-text-accent">{{ emailEngagementStats.openRate }}%</p>
              <p class="text-xs t-text-muted">Open Rate</p>
            </div>
          </Card>
          <Card class="p-4 t-bg-elevated">
            <div class="text-center">
              <p class="text-2xl font-bold t-text-accent">{{ emailEngagementStats.clickRate }}%</p>
              <p class="text-xs t-text-muted">Click Rate</p>
            </div>
          </Card>
        </div>

        <!-- Content Row -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <!-- Recent Documents -->
          <Card class="t-bg-elevated">
            <CardHeader>
              <CardTitle class="t-text">Recent Documents</CardTitle>
            </CardHeader>
            <CardContent>
              <div v-if="documents?.length" class="space-y-2">
                <NuxtLink
                  v-for="doc in documents"
                  :key="doc.id"
                  :to="buildOrgPath(`/documents/${doc.id}`)"
                  class="block p-3 hover:t-bg-subtle rounded transition-colors"
                >
                  <p class="font-medium t-text">{{ doc.title }}</p>
                  <p class="text-sm t-text-muted">{{ doc.document_category?.name }}</p>
                </NuxtLink>
              </div>
              <p v-else class="t-text-muted py-4 text-center">No documents yet</p>
            </CardContent>
            <CardFooter>
              <Button
                @click="navigateToOrg('/documents')"
                variant="outline"
                class="w-full"
              >
                View All Documents
              </Button>
            </CardFooter>
          </Card>

          <!-- Announcements -->
          <DashboardAnnouncementsList :announcements="announcements || []" />

          <!-- Recent Emails -->
          <DashboardRecentEmailsList :emails="emails || []" />
        </div>

        <!-- Channel Activity (if channels exist) -->
        <div v-if="channelData.length > 0" class="grid grid-cols-1 gap-4">
          <DashboardChannelActivityChart :data="channelData" />
        </div>

        <!-- Quick Actions -->
        <Card class="t-bg-elevated">
          <CardHeader>
            <CardTitle class="t-text">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent class="flex flex-wrap gap-2">
            <Button @click="navigateToOrg('/admin/documents/upload')">
              <Icon name="heroicons:arrow-up-tray" class="h-4 w-4 mr-2" />
              Upload Document
            </Button>
            <Button @click="navigateToOrg('/admin/units')" variant="outline">
              <Icon name="heroicons:building-office" class="h-4 w-4 mr-2" />
              Manage Units
            </Button>
            <Button @click="navigateToOrg('/admin/members')" variant="outline">
              <Icon name="heroicons:user-plus" class="h-4 w-4 mr-2" />
              Invite Member
            </Button>
            <Button @click="navigateToOrg('/admin/members')" variant="outline">
              <Icon name="heroicons:users" class="h-4 w-4 mr-2" />
              Manage Members
            </Button>
            <Button @click="navigateToOrg('/admin/email/compose')" variant="outline">
              <Icon name="heroicons:envelope" class="h-4 w-4 mr-2" />
              Send Email
            </Button>
            <Button @click="navigateToOrg('/admin/settings/organization')" variant="outline">
              <Icon name="heroicons:cog-6-tooth" class="h-4 w-4 mr-2" />
              Settings
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  </div>
</template>
