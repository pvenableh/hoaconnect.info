<script setup lang="ts">
import type { HoaDocument, HoaOrganization, HoaAnnouncement } from "~~/types/directus";

const config = useRuntimeConfig();
const { user } = useDirectusAuth();
const { list: listDocuments } = useDirectusItems("hoa_documents");
const { list: listMembers } = useDirectusItems("hoa_members");
const { list: listAnnouncements } = useDirectusItems("hoa_announcements");
const { getUrl } = useDirectusFiles();
const { buildOrgPath, navigateToOrg } = useOrgNavigation();

// Get organization context including member type and board member status
const {
  selectedOrgId,
  currentOrg,
  isAdmin,
  memberType,
  isOwner,
  isTenant,
  isBoardMember,
  boardTitleDisplay,
  activeBoardTerms,
} = await useSelectedOrg();

const orgId = computed(() => selectedOrgId.value);
const organization = computed<HoaOrganization | null>(() => currentOrg.value?.organization || null);
const memberInfo = computed(() => currentOrg.value);

// Get org logo URL
const orgLogoUrl = computed(() => {
  const logoId = organization.value?.settings?.logo;
  if (!logoId) return null;
  const fileId = typeof logoId === "string" ? logoId : logoId?.id;
  if (!fileId) return null;
  return `${config.public.directus.url}/assets/${fileId}?key=medium-contain`;
});

// Fetch recent documents (last 5 published)
const { data: recentDocuments } = await useAsyncData(
  `recent-documents-${orgId.value}`,
  async () => {
    if (!orgId.value) return [];

    const result = await listDocuments({
      fields: [
        "id",
        "title",
        "document_category.name",
        "date_published",
        "date_created",
        "file.id",
        "file.filename_download",
      ],
      filter: {
        organization: { _eq: orgId.value },
        status: { _eq: "published" },
      },
      sort: ["-date_published", "-date_created"],
      limit: 5,
    });

    return (result || []) as HoaDocument[];
  },
  {
    watch: [orgId],
    server: false,
  }
);

// Fetch member stats for community overview (board members see this)
const { data: memberStats } = await useAsyncData(
  `member-stats-${orgId.value}`,
  async () => {
    if (!orgId.value) return { total: 0, owners: 0, tenants: 0 };
    try {
      const result = await listMembers({
        fields: ["id", "member_type"],
        filter: {
          organization: { _eq: orgId.value },
          status: { _in: ["active", "inactive"] },
        },
      });
      const members = result || [];
      return {
        total: members.length,
        owners: members.filter((m: any) => m.member_type === "owner").length,
        tenants: members.filter((m: any) => m.member_type === "tenant").length,
      };
    } catch (e) {
      return { total: 0, owners: 0, tenants: 0 };
    }
  },
  {
    watch: [orgId],
    server: false,
  }
);

// Fetch announcements
const { data: announcements } = await useAsyncData(
  `member-announcements-${orgId.value}`,
  async () => {
    if (!orgId.value) return [];
    try {
      const now = new Date().toISOString();
      const targetFilters: any[] = [
        { target_audience: { _null: true } },
        { target_audience: { _eq: "all" } },
      ];

      // Add audience-specific filters
      if (isOwner.value) {
        targetFilters.push({ target_audience: { _eq: "owners" } });
      }
      if (isTenant.value) {
        targetFilters.push({ target_audience: { _eq: "tenants" } });
      }
      if (isBoardMember.value) {
        targetFilters.push({ target_audience: { _eq: "board_members" } });
      }

      const result = await listAnnouncements({
        fields: ["id", "title", "content", "announcement_type", "is_pinned", "publish_date", "date_created", "target_audience"],
        filter: {
          organization: { _eq: orgId.value },
          status: { _eq: "published" },
          _and: [
            {
              _or: [
                { expiry_date: { _null: true } },
                { expiry_date: { _gte: now } },
              ],
            },
            {
              _or: targetFilters,
            },
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

// Format date for display
function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return "";
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// Get category display name
function getCategoryName(doc: HoaDocument): string {
  if (doc.document_category) {
    return typeof doc.document_category === "string"
      ? doc.document_category
      : doc.document_category.name || "Document";
  }
  return "Document";
}

// Download document
const downloadDocument = async (doc: HoaDocument) => {
  try {
    const file = doc.file;
    if (!file) return;

    const fileId = typeof file === "string" ? file : file.id;
    const fileUrl = getUrl(fileId);
    const response = await fetch(fileUrl);

    if (!response.ok) throw new Error("Failed to fetch file");

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const filename = typeof file === "object" ? file.filename_download : doc.title || "document";
    link.download = filename || "document";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  } catch (error) {
    console.error("Failed to download document:", error);
  }
};

// Quick action cards for members
const quickActions = computed(() => [
  {
    title: "View Documents",
    description: "Access community bylaws, meeting minutes, and notices",
    icon: "heroicons:document-text",
    action: () => navigateToOrg("/documents"),
  },
]);

// Welcome message based on time of day
const welcomeMessage = computed(() => {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
});

const userName = computed(() => {
  return user.value?.firstName || "Member";
});

// Get member type display text
const memberTypeDisplay = computed(() => {
  if (memberType.value === "owner") return "Owner";
  if (memberType.value === "tenant") return "Resident";
  return "Member";
});

// Get member status description
const memberStatusDescription = computed(() => {
  const parts: string[] = [];
  parts.push(memberTypeDisplay.value);
  if (isBoardMember.value && boardTitleDisplay.value) {
    parts.push(`Board ${boardTitleDisplay.value}`);
  }
  return parts.join(" · ");
});

// Format date for board term display
function formatBoardTermDate(dateString: string | null | undefined): string {
  if (!dateString) return "";
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
  });
}
</script>

<template>
  <div class="min-h-screen t-bg">
    <div class="p-6">
      <div class="max-w-7xl mx-auto space-y-8">
        <!-- Welcome Header -->
        <div class="text-center py-8">
          <!-- Organization Logo -->
          <div v-if="orgLogoUrl" class="mb-6">
            <img
              :src="orgLogoUrl"
              :alt="organization?.name || 'Organization'"
              class="h-20 mx-auto object-contain"
            />
          </div>

          <h1 class="text-3xl font-bold t-text">
            {{ welcomeMessage }}, {{ userName }}
          </h1>
          <p class="t-text-secondary mt-2">
            Welcome to the {{ organization?.name }} resident portal
          </p>

          <!-- Member Status Badge -->
          <div class="flex items-center justify-center gap-2 mt-4">
            <span
              class="inline-flex items-center px-3 py-1 text-sm font-medium rounded-full"
              :class="{
                'bg-emerald-100 text-emerald-800': isOwner,
                't-bg-accent/20 t-text-accent': isTenant,
                't-bg-subtle t-text-secondary': !isOwner && !isTenant,
              }"
            >
              <Icon
                :name="isOwner ? 'heroicons:home' : 'heroicons:user'"
                class="w-4 h-4 mr-1.5"
              />
              {{ memberTypeDisplay }}
            </span>
            <span
              v-if="isBoardMember && boardTitleDisplay"
              class="inline-flex items-center px-3 py-1 text-sm font-medium rounded-full t-bg-accent/20 t-text-accent"
            >
              <Icon name="heroicons:star" class="w-4 h-4 mr-1.5" />
              Board {{ boardTitleDisplay }}
            </span>
          </div>
        </div>

        <!-- Board Member Stats (only for board members) -->
        <div v-if="isBoardMember" class="grid grid-cols-2 md:grid-cols-3 gap-4">
          <DashboardStatsCard
            title="Total Members"
            :value="memberStats?.total || 0"
            description="Active community members"
            icon="heroicons:users"
          />
          <DashboardStatsCard
            title="Owners"
            :value="memberStats?.owners || 0"
            description="Property owners"
            icon="heroicons:home"
          />
          <DashboardStatsCard
            title="Tenants"
            :value="memberStats?.tenants || 0"
            description="Residents"
            icon="heroicons:user-group"
          />
        </div>

        <!-- Board Member Charts (only for board members) -->
        <div v-if="isBoardMember && memberStats" class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <DashboardMembershipDonutChart
            :owners="memberStats.owners || 0"
            :tenants="memberStats.tenants || 0"
          />
          <Card>
            <CardHeader class="pb-2">
              <CardTitle class="text-base">Board Member Resources</CardTitle>
              <CardDescription>Tools and information for board members</CardDescription>
            </CardHeader>
            <CardContent class="space-y-3">
              <Button @click="navigateToOrg('/documents')" variant="outline" class="w-full justify-start">
                <Icon name="heroicons:document-text" class="h-4 w-4 mr-2" />
                View All Documents
              </Button>
              <Button v-if="isAdmin" @click="navigateToOrg('/dashboard')" variant="outline" class="w-full justify-start">
                <Icon name="heroicons:chart-bar" class="h-4 w-4 mr-2" />
                Admin Dashboard
              </Button>
              <div class="p-3 t-bg-subtle rounded-lg t-border">
                <p class="text-sm t-text-secondary">
                  <Icon name="heroicons:light-bulb" class="h-4 w-4 inline mr-1" />
                  As a board member, you have access to community statistics and additional resources.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        <!-- Quick Actions -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card
            v-for="action in quickActions"
            :key="action.title"
            class="cursor-pointer hover:shadow-lg transition-shadow"
            @click="action.action"
          >
            <CardContent class="p-6 flex items-center gap-4">
              <div class="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Icon :name="action.icon" class="h-7 w-7 text-primary" />
              </div>
              <div>
                <h3 class="font-semibold t-text">{{ action.title }}</h3>
                <p class="text-sm t-text-muted">{{ action.description }}</p>
              </div>
              <Icon name="heroicons:chevron-right" class="h-5 w-5 t-text-muted ml-auto" />
            </CardContent>
          </Card>
        </div>

        <!-- Board Member Status (only shown if user is a board member) -->
        <Card v-if="isBoardMember && activeBoardTerms.length > 0" class="t-border t-bg-subtle">
          <CardHeader>
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-full t-bg-accent/20 flex items-center justify-center">
                <Icon name="heroicons:star" class="h-5 w-5 t-text-accent" />
              </div>
              <div>
                <CardTitle class="t-text">Board Member Status</CardTitle>
                <CardDescription class="t-text-secondary">Your current board position(s)</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div class="space-y-3">
              <div
                v-for="term in activeBoardTerms"
                :key="term.id"
                class="flex items-center justify-between p-3 t-bg-elevated rounded-lg t-border"
              >
                <div class="flex items-center gap-3">
                  <Icon name="heroicons:identification" class="h-5 w-5 t-text-accent" />
                  <div>
                    <p class="font-medium t-text capitalize">
                      {{ term.title?.replace('_', ' ') || 'Board Member' }}
                    </p>
                    <p class="text-sm t-text-muted">
                      <span v-if="term.term_start">{{ formatBoardTermDate(term.term_start) }}</span>
                      <span v-if="term.term_start && term.term_end"> - </span>
                      <span v-if="term.term_end">{{ formatBoardTermDate(term.term_end) }}</span>
                      <span v-if="!term.term_end && term.term_start">- Present</span>
                    </p>
                  </div>
                </div>
                <span class="px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded-full">
                  Active
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <!-- Announcements -->
        <DashboardAnnouncementsList :announcements="announcements || []" />

        <!-- Recent Documents -->
        <Card>
          <CardHeader>
            <div class="flex items-center justify-between">
              <div>
                <CardTitle>Recent Documents</CardTitle>
                <CardDescription>Latest community documents</CardDescription>
              </div>
              <Button variant="outline" size="sm" @click="navigateToOrg('/documents')">
                View All
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div v-if="recentDocuments && recentDocuments.length > 0" class="space-y-3">
              <button
                v-for="doc in recentDocuments"
                :key="doc.id"
                @click="downloadDocument(doc)"
                class="w-full flex items-center gap-4 p-3 rounded-lg hover:t-bg-subtle transition-colors text-left group"
              >
                <div class="w-10 h-10 rounded-lg t-bg-subtle group-hover:t-bg transition-colors flex items-center justify-center flex-shrink-0">
                  <Icon name="heroicons:document-text" class="h-5 w-5 t-text-secondary" />
                </div>
                <div class="flex-1 min-w-0">
                  <h4 class="font-medium t-text truncate">{{ doc.title }}</h4>
                  <div class="flex items-center gap-2 text-sm t-text-muted">
                    <span>{{ getCategoryName(doc) }}</span>
                    <span v-if="doc.date_published || doc.date_created">
                      &middot; {{ formatDate(doc.date_published || doc.date_created) }}
                    </span>
                  </div>
                </div>
                <Icon
                  name="heroicons:arrow-down-tray"
                  class="h-5 w-5 t-text-muted group-hover:text-primary transition-colors"
                />
              </button>
            </div>
            <div v-else class="py-8 text-center t-text-muted">
              <Icon name="heroicons:document" class="h-12 w-12 mx-auto mb-3 t-text-muted opacity-50" />
              <p>No documents have been published yet.</p>
            </div>
          </CardContent>
        </Card>

        <!-- Contact Information -->
        <Card v-if="organization?.phone || organization?.email">
          <CardHeader>
            <CardTitle>Contact Management</CardTitle>
            <CardDescription>Get in touch with your HOA management team</CardDescription>
          </CardHeader>
          <CardContent>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <a
                v-if="organization?.phone"
                :href="`tel:${organization.phone}`"
                class="flex items-center gap-3 p-4 rounded-lg t-bg-subtle hover:t-bg transition-colors"
              >
                <div class="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Icon name="heroicons:phone" class="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p class="text-sm t-text-muted">Phone</p>
                  <p class="font-medium t-text">{{ organization.phone }}</p>
                </div>
              </a>
              <a
                v-if="organization?.email"
                :href="`mailto:${organization.email}`"
                class="flex items-center gap-3 p-4 rounded-lg t-bg-subtle hover:t-bg transition-colors"
              >
                <div class="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Icon name="heroicons:envelope" class="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p class="text-sm t-text-muted">Email</p>
                  <p class="font-medium t-text">{{ organization.email }}</p>
                </div>
              </a>
            </div>
          </CardContent>
        </Card>

        <!-- Admin Link (only for admins) -->
        <div v-if="isAdmin" class="text-center">
          <Button variant="outline" @click="navigateToOrg('/dashboard')">
            <Icon name="heroicons:cog-6-tooth" class="h-4 w-4 mr-2" />
            Go to Admin Dashboard
          </Button>
        </div>
      </div>
    </div>
  </div>
</template>
