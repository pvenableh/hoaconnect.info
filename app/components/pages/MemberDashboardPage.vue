<script setup lang="ts">
import type { HoaDocument, HoaOrganization, HoaAnnouncement } from "#core/types/directus";

const config = useRuntimeConfig();
const { user } = useDirectusAuth();
const { list: listDocuments } = useDirectusItems("hoa_documents");
const { list: listMembers } = useDirectusItems("hoa_members");
const { list: listAnnouncements } = useDirectusItems("hoa_announcements");
const { getUrl } = useDirectusFiles();
const { buildOrgPath, navigateToOrg } = useOrgNavigation();
const { fetchHousehold } = useChangeRequests();
const { rise } = useMotionPresets();

// Get organization context including member type and board member status
const {
  selectedOrgId,
  currentOrg,
  isAdmin,
  isMember,
  memberType,
  isOwner,
  isTenant,
  isBoardMember,
  boardTitleDisplay,
  activeBoardTerms,
} = await useSelectedOrg();

const orgId = computed(() => selectedOrgId.value);
const organization = computed<HoaOrganization | null>(() => currentOrg.value?.organization || null);

// ---- Tabbed dashboard: Overview + Building feed (Phase 9) ----
const { isEnabled } = useModules();
const feedEnabled = computed(() => isEnabled("feed"));
const isBoard = computed(() => isAdmin.value || isBoardMember.value);

// Same tab contract as the rest of the app: linkable via `?tab=`, replace not
// push, so Back leaves the portal rather than stepping through its tabs.
const activeTab = useTabQuery({
  values: ["overview", "building"],
  fallback: "overview",
});

// "Building" only exists when the feed module is on; a stale link to it should
// land on Overview rather than an empty panel.
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

// Get org logo URL
const orgLogoUrl = computed(() => {
  const settings = organization.value?.settings;
  const logoId =
    typeof settings === "object" && settings ? settings.logo : null;
  if (!logoId) return null;
  const fileId = typeof logoId === "string" ? logoId : logoId?.id;
  if (!fileId) return null;
  return `${config.public.directus.url}/assets/${fileId}?key=medium-contain`;
});

// ── Portal sections — the resident hub. One card per member-facing area, gated
// by the org's module toggles (and show_board). This is the "everything in one
// place" map: communications, documents, money, meetings, and the resident's own
// household record, all a tap away. Mirrors the member dock/nav set.
const showBoard = computed(() => organization.value?.show_board !== false);
// Every section is shown so the resident sees the full shape of their portal;
// modules the community hasn't enabled render greyed + non-navigating (a disabled
// card mustn't link — module.global.ts would just bounce it back to the dashboard).
// `available` drives the enabled/disabled treatment in the template.
const portalSections = computed(() => [
  {
    key: "household",
    label: "My Household",
    description: "Your contact info, vehicles, pets & parking",
    icon: "i-lucide-home",
    path: "/profile",
    available: true,
  },
  {
    key: "payments",
    label: "Payments",
    description: "Dues, assessments & statements",
    icon: "i-lucide-credit-card",
    path: "/payments",
    available: isEnabled("payments"),
  },
  {
    key: "requests",
    label: "Requests",
    description: "Submit & track your requests",
    icon: "i-lucide-clipboard-list",
    path: "/requests",
    available: isEnabled("requests"),
  },
  {
    key: "documents",
    label: "Documents",
    description: "Bylaws, minutes, notices & forms",
    icon: "i-lucide-file-text",
    path: "/documents",
    available: isEnabled("documents"),
  },
  {
    key: "meetings",
    label: "Meetings",
    description: "Agendas, schedules & minutes",
    icon: "i-lucide-calendar-days",
    path: "/meetings",
    available: isEnabled("meetings"),
  },
  // No Announcements tile: community news is the Building tab, one control away
  // at the top of this very page. A tile that only switched the tab beside it
  // would be a second door into the same room.
  {
    key: "projects",
    label: "Projects",
    description: "Capital improvements & initiatives",
    icon: "i-lucide-kanban-square",
    path: "/projects",
    available: isEnabled("projects"),
  },
  {
    key: "rules",
    label: "Rules & Bylaws",
    description: "Community rules & governing docs",
    icon: "i-lucide-scale",
    path: "/rules",
    available: isEnabled("rules"),
  },
  {
    key: "board",
    label: "Board",
    description: "Meet your board members",
    icon: "i-lucide-award",
    path: "/board",
    available: isEnabled("board") && showBoard.value,
  },
]);

// Primary resident tasks lifted to the top of the portal (≤2 taps). Only the
// ones the community actually enabled appear.
const primaryActions = computed(() =>
  [
    {
      key: "pay",
      label: "Pay dues",
      icon: "i-lucide-credit-card",
      path: "/payments",
      available: isEnabled("payments"),
    },
    {
      key: "request",
      label: "Submit a request",
      icon: "i-lucide-plus",
      path: "/requests",
      available: isEnabled("requests"),
    },
  ].filter((a) => a.available),
);

// Fetch recent documents (last 5 published)
const { data: recentDocuments, pending: docsPending } = await useAsyncData(
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

// Fetch announcements (audience-aware)
const { data: announcements, pending: annPending } = await useAsyncData(
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
        limit: 4,
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

// Fetch the resident's own household summary (vehicles, pets, pending changes).
// The full editor lives at /profile; here we just surface counts as a teaser.
const { data: household } = await useAsyncData(
  `my-household-summary-${orgId.value}`,
  async () => {
    if (!orgId.value) return null;
    try {
      return await fetchHousehold();
    } catch (e) {
      return null;
    }
  },
  { watch: [orgId], server: false }
);
const vehiclesEnabled = computed(() => isEnabled("vehicles"));
const petsEnabled = computed(() => isEnabled("pets"));
const householdStats = computed(() => ({
  vehicles: household.value?.vehicles?.length || 0,
  pets: household.value?.pets?.length || 0,
  pending: household.value?.pendingRequests?.length || 0,
  parkingSpots:
    household.value?.vehicles?.filter((v: any) => v?.parking_spot)?.length || 0,
}));

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

// Strip HTML from announcement content for a one-line preview.
function plainText(html: string | null | undefined, max = 140): string {
  if (!html) return "";
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
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
    <PageContainer class="space-y-10">
        <!-- Editorial hero — left-aligned, type-led. Eyebrow + greeting carry it;
             member status and the primary tasks ride below as pills. -->
        <header class="pt-2">
          <img
            v-if="orgLogoUrl"
            :src="orgLogoUrl"
            :alt="organization?.name || 'Organization'"
            class="h-10 mb-5 object-contain"
          />
          <p class="t-eyebrow mb-3">Resident portal</p>
          <h1 class="t-heading text-3xl sm:text-4xl font-medium tracking-tight t-text">
            {{ welcomeMessage }}, {{ userName }}
          </h1>

          <div class="flex items-center flex-wrap gap-2 mt-4">
            <span class="inline-flex items-center gap-1.5 px-3 py-1 text-sm font-medium rounded-full t-bg-subtle t-text-secondary">
              <Icon :name="isOwner ? 'i-lucide-home' : 'i-lucide-user'" class="w-3.5 h-3.5" />
              {{ memberTypeDisplay }}
            </span>
            <span
              v-if="isBoardMember && boardTitleDisplay"
              class="inline-flex items-center gap-1.5 px-3 py-1 text-sm font-medium rounded-full t-bg-accent/15 t-text-accent"
            >
              <Icon name="i-lucide-star" class="w-3.5 h-3.5" />
              Board {{ boardTitleDisplay }}
            </span>
          </div>

          <!-- Primary tasks — the highest-frequency resident actions, as pills. -->
          <div v-if="primaryActions.length" class="flex flex-wrap gap-2.5 mt-6">
            <Button
              v-for="(action, i) in primaryActions"
              :key="action.key"
              v-motion
              v-bind="rise(i, { stagger: 35 })"
              :variant="i === 0 ? 'default' : 'outline'"
              @click="navigateToOrg(action.path)"
            >
              <Icon :name="action.icon" class="w-4 h-4" />
              {{ action.label }}
            </Button>
          </div>
        </header>

        <AppSegmentedControl v-model="activeTab" :items="tabItems" label="Portal views" />

        <AppTabPanels :value="activeTab" :items="tabItems" class="mt-8">
          <div v-if="activeTab === 'overview'" class="space-y-10">
        <!-- Portal sections — the resident hub. All sections are shown; ones the
             community hasn't enabled render greyed + non-navigating. Classic /
             luxury render as full-width hairline rows; modern as soft cards. -->
        <section>
          <p class="t-eyebrow mb-4">Your portal</p>
          <div class="portal-grid">
            <component
              :is="section.available ? 'button' : 'div'"
              v-for="(section, i) in portalSections"
              :key="section.key"
              v-motion
              v-bind="rise(i, { stagger: 35 })"
              :type="section.available ? 'button' : undefined"
              class="portal-item group"
              :class="section.available ? 'portal-item--on' : 'portal-item--off'"
              :aria-disabled="section.available ? undefined : 'true'"
              @click="section.available && navigateToOrg(section.path)"
            >
              <span class="t-icon-chip portal-item__icon">
                <Icon :name="section.icon" class="h-5 w-5" />
              </span>
              <span class="portal-item__body">
                <span class="portal-item__label t-heading t-text">{{ section.label }}</span>
                <span class="portal-item__desc t-text-muted">
                  {{ section.available ? section.description : "Not available for your community" }}
                </span>
              </span>
              <Icon name="i-lucide-chevron-right" class="portal-item__chev" />
            </component>
          </div>
        </section>

        <!-- Board Member Stats (only for board members) -->
        <div v-if="isBoardMember" class="grid grid-cols-2 md:grid-cols-3 gap-4">
          <DashboardStatsCard
            title="Total Members"
            :value="memberStats?.total || 0"
            description="Active community members"
            icon="i-lucide-users"
          />
          <DashboardStatsCard
            title="Owners"
            :value="memberStats?.owners || 0"
            description="Property owners"
            icon="i-lucide-home"
          />
          <DashboardStatsCard
            title="Residents"
            :value="memberStats?.tenants || 0"
            description="Tenants"
            icon="i-lucide-users-round"
          />
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <!-- Recent Announcements -->
          <Card>
            <CardHeader>
              <div class="flex items-center justify-between">
                <div>
                  <CardTitle>Announcements</CardTitle>
                  <CardDescription>Latest community news</CardDescription>
                </div>
                <Button
                  v-if="feedEnabled"
                  variant="outline"
                  size="sm"
                  @click="activeTab = 'building'"
                >
                  Building feed
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <WidgetRowSkeleton v-if="annPending" :rows="4" avatar-shape="square" :trailing="false" />
              <div v-else-if="announcements && announcements.length > 0" class="space-y-3">
                <!-- A row opens the Building tab, which is on this same page —
                     so it's a tab switch, not a navigation. With the feed module
                     off there is no tab to open, and the rows render inert
                     rather than as buttons that do nothing. -->
                <component
                  :is="feedEnabled ? 'button' : 'div'"
                  v-for="(a, i) in announcements"
                  :key="a.id"
                  v-motion
                  v-bind="rise(i, { stagger: 35 })"
                  :type="feedEnabled ? 'button' : undefined"
                  class="w-full flex items-start gap-3 p-3 rounded-lg text-left"
                  :class="feedEnabled ? 'hover:t-bg-subtle transition-colors' : ''"
                  @click="feedEnabled && (activeTab = 'building')"
                >
                  <div class="t-icon-chip w-9 h-9 flex-shrink-0">
                    <Icon
                      :name="a.is_pinned ? 'i-lucide-pin' : 'i-lucide-megaphone'"
                      class="h-4 w-4"
                    />
                  </div>
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2">
                      <h4 class="font-medium t-text truncate">{{ a.title }}</h4>
                      <span
                        v-if="a.is_pinned"
                        class="text-[10px] uppercase tracking-wide t-text-accent font-semibold"
                        >Pinned</span
                      >
                    </div>
                    <p class="text-sm t-text-muted truncate">{{ plainText(a.content, 90) }}</p>
                    <p class="text-xs t-text-muted mt-0.5">
                      {{ formatDate(a.publish_date || a.date_created) }}
                    </p>
                  </div>
                </component>
              </div>
              <div v-else class="py-8 text-center t-text-muted">
                <Icon name="i-lucide-megaphone" class="h-10 w-10 mx-auto mb-2 opacity-40" />
                <p class="text-sm">No announcements yet.</p>
              </div>
            </CardContent>
          </Card>

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
              <WidgetRowSkeleton v-if="docsPending" :rows="4" avatar-shape="square" :trailing="false" />
              <div v-else-if="recentDocuments && recentDocuments.length > 0" class="space-y-3">
                <button
                  v-for="(doc, i) in recentDocuments"
                  :key="doc.id"
                  v-motion
                  v-bind="rise(i, { stagger: 35 })"
                  @click="downloadDocument(doc)"
                  class="w-full flex items-center gap-4 p-3 rounded-lg hover:t-bg-subtle transition-colors text-left group"
                >
                  <div class="t-icon-chip w-9 h-9 flex-shrink-0">
                    <Icon name="i-lucide-file-text" class="h-4 w-4" />
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
                    name="i-lucide-download"
                    class="h-4 w-4 t-text-muted group-hover:t-text-accent transition-colors"
                  />
                </button>
              </div>
              <div v-else class="py-8 text-center t-text-muted">
                <Icon name="i-lucide-file" class="h-10 w-10 mx-auto mb-2 opacity-40" />
                <p class="text-sm">No documents published yet.</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <!-- My Household summary -->
        <Card>
          <CardHeader>
            <div class="flex items-center justify-between">
              <div>
                <CardTitle>My Household</CardTitle>
                <CardDescription>Your unit record on file</CardDescription>
              </div>
              <Button variant="outline" size="sm" @click="navigateToOrg('/profile')">
                Manage
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div class="rounded-lg t-bg-subtle p-4 text-center">
                <p class="text-2xl font-semibold t-text">{{ householdStats.parkingSpots }}</p>
                <p class="text-xs t-text-muted mt-0.5">Parking spots</p>
              </div>
              <div v-if="vehiclesEnabled" class="rounded-lg t-bg-subtle p-4 text-center">
                <p class="text-2xl font-semibold t-text">{{ householdStats.vehicles }}</p>
                <p class="text-xs t-text-muted mt-0.5">Vehicles</p>
              </div>
              <div v-if="petsEnabled" class="rounded-lg t-bg-subtle p-4 text-center">
                <p class="text-2xl font-semibold t-text">{{ householdStats.pets }}</p>
                <p class="text-xs t-text-muted mt-0.5">Pets</p>
              </div>
              <div class="rounded-lg t-bg-subtle p-4 text-center">
                <p class="text-2xl font-semibold t-text">{{ householdStats.pending }}</p>
                <p class="text-xs t-text-muted mt-0.5">Pending changes</p>
              </div>
            </div>
            <p class="text-sm t-text-muted mt-4">
              Keep your contact info, mailing address, vehicles and pets up to date —
              changes are sent to your community manager for review.
            </p>
          </CardContent>
        </Card>

        <!-- Board Member Status (only shown if user is a board member) -->
        <Card v-if="isBoardMember && activeBoardTerms.length > 0">
          <CardHeader>
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-full t-bg-accent/20 flex items-center justify-center">
                <Icon name="i-lucide-star" class="h-5 w-5 t-text-accent" />
              </div>
              <div>
                <CardTitle>Board Member Status</CardTitle>
                <CardDescription>Your current board position(s)</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div class="space-y-3">
              <div
                v-for="term in activeBoardTerms"
                :key="term.id"
                class="flex items-center justify-between p-3 t-bg-subtle rounded-lg t-border"
              >
                <div class="flex items-center gap-3">
                  <Icon name="i-lucide-badge-check" class="h-5 w-5 t-text-accent" />
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
                <span class="px-2.5 py-1 text-xs font-medium rounded-full t-bg-accent/15 t-text-accent">
                  Active
                </span>
              </div>
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
                <div class="w-10 h-10 rounded-full t-bg-accent/15 flex items-center justify-center">
                  <Icon name="i-lucide-phone" class="h-5 w-5 t-text-accent" />
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
                <div class="w-10 h-10 rounded-full t-bg-accent/15 flex items-center justify-center">
                  <Icon name="i-lucide-mail" class="h-5 w-5 t-text-accent" />
                </div>
                <div>
                  <p class="text-sm t-text-muted">Email</p>
                  <p class="font-medium t-text">{{ organization.email }}</p>
                </div>
              </a>
            </div>
          </CardContent>
        </Card>

        <!-- Admin Link (only for admins previewing the member view) -->
        <div v-if="isAdmin" class="text-center">
          <Button variant="outline" @click="navigateToOrg('/')">
            <Icon name="i-lucide-layout-dashboard" class="h-4 w-4 mr-2" />
            Go to Admin Dashboard
          </Button>
        </div>
          </div>

          <!-- Building feed tab -->
          <div v-else-if="activeTab === 'building' && feedEnabled" class="space-y-6">
            <div class="flex items-start justify-between gap-2">
              <div>
                <h2 class="text-xl font-semibold t-text">Building</h2>
                <p class="text-sm t-text-muted mt-0.5">
                  Everything happening in your community — react and join the conversation.
                </p>
              </div>
              <NuxtLink :to="buildOrgPath('/polls')">
                <Button variant="outline" class="rounded-full">
                  <Icon name="i-lucide-bar-chart-3" class="w-4 h-4 mr-1.5" />
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
