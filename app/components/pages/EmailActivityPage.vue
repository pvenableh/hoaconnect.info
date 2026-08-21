<script setup lang="ts">
import { toast } from "vue-sonner";
import type { HoaEmailActivity, HoaEmail } from "#core/types/directus";

const { navigateToOrg } = useOrgNavigation();
const { isAdmin, isHoaAdmin } = useRoles();

// Await to ensure org is loaded during SSR
const { currentOrg, selectedOrgId, isLoading } = await useSelectedOrg();

// Access control
const hasAccess = computed(() => isAdmin.value || isHoaAdmin.value);

// Computed organization from the composable
const organization = computed(() => currentOrg.value?.organization || null);
const orgId = computed(() => selectedOrgId.value);

// State
const activities = ref<HoaEmailActivity[]>([]);
const emails = ref<HoaEmail[]>([]);
const loading = ref(true);
const loadingMore = ref(false);
const searchQuery = ref("");
const eventFilter = ref<string>("all");
const emailFilter = ref<string>("all");

// Pagination state for infinite scroll
const pageSize = 100;
const currentPage = ref(0);
const hasMore = ref(true);

// Total counts from database (for accurate stats)
const totalCounts = ref({
  total: 0,
  delivered: 0,
  open: 0,
  click: 0,
  bounce: 0,
});

// Computed stats from loaded data
const loadedStats = computed(() => {
  const total = activities.value.length;
  const opens = activities.value.filter((a) => a.event === "open").length;
  const clicks = activities.value.filter((a) => a.event === "click").length;
  const bounces = activities.value.filter((a) => a.event === "bounce").length;
  const delivered = activities.value.filter((a) => a.event === "delivered").length;

  return { total, opens, clicks, bounces, delivered };
});

// Event options
const eventOptions = [
  { label: "All Events", value: "all" },
  { label: "Delivered", value: "delivered", color: "green", icon: "lucide:check-circle" },
  { label: "Opened", value: "open", color: "blue", icon: "lucide:mail-open" },
  { label: "Clicked", value: "click", color: "purple", icon: "lucide:mouse-pointer-click" },
  { label: "Bounced", value: "bounce", color: "red", icon: "lucide:alert-triangle" },
  { label: "Processed", value: "processed", color: "gray", icon: "lucide:loader" },
  { label: "Deferred", value: "deferred", color: "yellow", icon: "lucide:clock" },
  { label: "Dropped", value: "dropped", color: "orange", icon: "lucide:x-circle" },
  { label: "Spam Report", value: "spam_report", color: "red", icon: "lucide:flag" },
  { label: "Unsubscribe", value: "unsubscribe", color: "gray", icon: "lucide:user-minus" },
];

// Computed
const filteredActivities = computed(() => {
  let result = activities.value;

  if (eventFilter.value !== "all") {
    result = result.filter((a) => a.event === eventFilter.value);
  }

  if (emailFilter.value !== "all") {
    result = result.filter((a) => {
      const recipient = a.email_recipient;
      if (typeof recipient === "object" && recipient) {
        const email = recipient.email;
        if (typeof email === "object" && email) {
          return String(email.id) === emailFilter.value;
        }
        return String(recipient.email) === emailFilter.value;
      }
      return false;
    });
  }

  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase();
    result = result.filter(
      (a) =>
        a.email?.toLowerCase().includes(query) ||
        (typeof a.member === "object" &&
          a.member?.first_name?.toLowerCase().includes(query)) ||
        (typeof a.member === "object" &&
          a.member?.last_name?.toLowerCase().includes(query))
    );
  }

  return result;
});

const emailOptions = computed(() => {
  return [
    { label: "All Emails", value: "all" },
    ...emails.value.map((e) => ({
      label: e.subject || `Email ${e.id}`,
      value: String(e.id),
    })),
  ];
});

// Calculate percentage for visual indicator
const getPercentage = (loaded: number, total: number): number => {
  if (total === 0) return 0;
  return Math.round((loaded / total) * 100);
};

// Methods
async function fetchTotalCounts() {
  if (!orgId.value) return;

  try {
    const items = useDirectusItems<{ count: number }[]>("hoa_email_activity");

    // Filter by organization
    const orgFilter = { organization: { _eq: orgId.value } };

    // Fetch aggregate counts for each event type in parallel
    const [totalResult, deliveredResult, openResult, clickResult, bounceResult] =
      await Promise.all([
        items.aggregate({
          aggregate: { count: ["*"] },
          filter: orgFilter,
        }),
        items.aggregate({
          aggregate: { count: ["*"] },
          filter: { ...orgFilter, event: { _eq: "delivered" } },
        }),
        items.aggregate({
          aggregate: { count: ["*"] },
          filter: { ...orgFilter, event: { _eq: "open" } },
        }),
        items.aggregate({
          aggregate: { count: ["*"] },
          filter: { ...orgFilter, event: { _eq: "click" } },
        }),
        items.aggregate({
          aggregate: { count: ["*"] },
          filter: { ...orgFilter, event: { _eq: "bounce" } },
        }),
      ]);

    totalCounts.value = {
      total: (totalResult as any)?.[0]?.count || 0,
      delivered: (deliveredResult as any)?.[0]?.count || 0,
      open: (openResult as any)?.[0]?.count || 0,
      click: (clickResult as any)?.[0]?.count || 0,
      bounce: (bounceResult as any)?.[0]?.count || 0,
    };
  } catch (error: any) {
    console.error("Failed to fetch counts:", error);
  }
}

async function fetchActivities(reset = false) {
  if (reset) {
    currentPage.value = 0;
    activities.value = [];
    hasMore.value = true;
  }

  if (!hasMore.value && !reset) return;
  if (!orgId.value) return;

  loading.value = reset || activities.value.length === 0;
  loadingMore.value = !reset && activities.value.length > 0;

  try {
    const items = useDirectusItems<HoaEmailActivity>("hoa_email_activity");

    const response = await items.list({
      fields: [
        "*",
        "member.first_name",
        "member.last_name",
        "member.email",
        "email_recipient.id",
        "email_recipient.recipient_email",
        "email_recipient.email.id",
        "email_recipient.email.subject",
      ],
      filter: {
        organization: { _eq: orgId.value },
      },
      sort: ["-date_created"],
      limit: pageSize,
      offset: currentPage.value * pageSize,
    });

    const newActivities = response || [];

    if (reset) {
      activities.value = newActivities;
    } else {
      activities.value = [...activities.value, ...newActivities];
    }

    hasMore.value = newActivities.length === pageSize;
    currentPage.value++;
  } catch (error: any) {
    console.error("Failed to fetch activities:", error);
    toast.error("Failed to load email activity");
  } finally {
    loading.value = false;
    loadingMore.value = false;
  }
}

async function fetchEmails() {
  if (!orgId.value) return;

  try {
    const items = useDirectusItems<HoaEmail>("hoa_emails");

    const response = await items.list({
      fields: ["id", "subject", "status", "sent_at"],
      filter: {
        status: { _eq: "sent" },
        organization: { _eq: orgId.value },
      },
      sort: ["-sent_at"],
      limit: 50,
    });

    emails.value = response || [];
  } catch (error: any) {
    console.error("Failed to fetch emails:", error);
  }
}

// This used to return a bare hue that the template interpolated into
// `text-${hue}-500`. Tailwind never sees a class assembled at runtime, so every
// one of those icons had been rendering uncoloured — found by looking at the
// generated CSS, not by reading the code. Whole class names, and status
// meanings instead of hues, so both modes are handled for free.
function getEventColorClass(event?: string): string {
  const colorMap: Record<string, string> = {
    delivered: "text-success",
    open: "text-info",
    click: "text-info",
    bounce: "text-destructive",
    processed: "t-text-muted",
    deferred: "text-warning",
    dropped: "text-warning",
    spam_report: "text-destructive",
    unsubscribe: "t-text-muted",
    group_unsubscribe: "t-text-muted",
    group_resubscribe: "text-success",
  };
  return colorMap[event || ""] || "t-text-muted";
}

function getEventIcon(event?: string): string {
  const iconMap: Record<string, string> = {
    delivered: "lucide:check-circle",
    open: "lucide:mail-open",
    click: "lucide:mouse-pointer-click",
    bounce: "lucide:alert-triangle",
    processed: "lucide:loader",
    deferred: "lucide:clock",
    dropped: "lucide:x-circle",
    spam_report: "lucide:flag",
    unsubscribe: "lucide:user-minus",
    group_unsubscribe: "lucide:users-minus",
    group_resubscribe: "lucide:user-plus",
  };
  return iconMap[event || ""] || "lucide:mail";
}

function formatDate(date?: string | null): string {
  if (!date) return "-";
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getMemberName(activity: HoaEmailActivity): string {
  if (typeof activity.member === "object" && activity.member) {
    return `${activity.member.first_name || ""} ${activity.member.last_name || ""}`.trim();
  }
  return activity.email || "Unknown";
}

// The event and who it happened to are the identity of a row; the rest is
// detail that folds away on a phone.
const activityColumns = [
  { key: "event", label: "Event", sortable: true },
  { key: "recipient", label: "Recipient", sortable: true, value: (a: HoaEmailActivity) => getMemberName(a) },
  { key: "subject", label: "Email", hideOnMobile: true, value: (a: HoaEmailActivity) => getEmailSubject(a) },
  { key: "clicked_url", label: "Clicked URL", hideOnMobile: true },
  { key: "date_created", label: "Time", sortable: true, hideOnMobile: true },
];

function getEmailSubject(activity: HoaEmailActivity): string {
  if (typeof activity.email_recipient === "object" && activity.email_recipient) {
    const email = activity.email_recipient.email;
    if (typeof email === "object" && email) {
      return email.subject || `Email #${email.id}`;
    }
  }
  return "-";
}

async function refreshData() {
  await Promise.all([fetchActivities(true), fetchEmails(), fetchTotalCounts()]);
}

// Infinite scroll handler
const scrollContainer = ref<HTMLElement | null>(null);

function handleScroll() {
  if (!scrollContainer.value || loadingMore.value || !hasMore.value) return;

  const { scrollTop, scrollHeight, clientHeight } = scrollContainer.value;
  const scrollPercentage = (scrollTop + clientHeight) / scrollHeight;

  // Load more when scrolled 80% down
  if (scrollPercentage > 0.8) {
    fetchActivities(false);
  }
}

// Navigation
const goToEmails = () => {
  navigateToOrg("/admin/communications");
};

// Initialize
onMounted(() => {
  if (hasAccess.value) {
    refreshData();
  }
});

useSeoMeta({
  title: "Email Activity",
  description: "Track email opens, clicks, bounces, and delivery status",
});
</script>

<template>
  <div class="min-h-screen t-bg">
    <PageContainer>
        <CommunicationsTabs />
        <!-- Header -->
        <div class="flex flex-col md:flex-row md:items-center md:justify-between mb-8">
          <div>
            <h1 class="text-3xl font-bold mb-2">Email Activity</h1>
            <p class="t-text-secondary">
              Track email opens, clicks, bounces, and delivery status
            </p>
          </div>
          <div class="mt-4 md:mt-0 flex gap-3">
            <Button variant="outline" :disabled="loading" @click="refreshData">
              <Icon
                name="lucide:refresh-cw"
                class="w-4 h-4 mr-2"
                :class="{ 'animate-spin': loading }"
              />
              Refresh
            </Button>
            <Button variant="outline" @click="goToEmails">
              <Icon name="lucide:mail" class="w-4 h-4 mr-2" />
              Emails
            </Button>
          </div>
        </div>

        <!-- Loading State -->
        <div v-if="isLoading" class="text-center py-12">
          <Icon name="lucide:loader-2" class="w-8 h-8 animate-spin mx-auto mb-4" />
          <p class="text-sm t-text-secondary">Loading your organization...</p>
        </div>

        <!-- No Organization State -->
        <div v-else-if="!organization" class="text-center py-12">
          <Alert variant="destructive" class="max-w-md mx-auto">
            <Icon name="lucide:alert-circle" class="w-4 h-4" />
            <AlertTitle>No Organization Found</AlertTitle>
            <AlertDescription>
              You are not associated with any HOA organization.
            </AlertDescription>
          </Alert>
        </div>

        <!-- Access Denied -->
        <div v-else-if="!hasAccess" class="text-center py-12">
          <Icon name="lucide:shield-x" class="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 class="text-xl font-semibold mb-2">Access Denied</h2>
          <p class="t-text-secondary">
            You don't have permission to view email activity.
          </p>
        </div>

        <!-- Main Content -->
        <template v-else>
          <!-- Stats Cards with Total Counts -->
          <div class="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
            <Card class="text-center relative overflow-hidden">
              <CardContent class="pt-6 relative z-10">
                <div class="text-2xl font-bold">
                  {{ totalCounts.total.toLocaleString() }}
                </div>
                <div class="text-xs t-text-secondary uppercase tracking-wide">
                  Total Events
                </div>
                <div
                  v-if="activities.length < totalCounts.total"
                  class="text-[10px] t-text-muted mt-1"
                >
                  {{ activities.length.toLocaleString() }} loaded
                </div>
              </CardContent>
              <div
                v-if="totalCounts.total > 0"
                class="absolute bottom-0 left-0 h-1 bg-gray-300 dark:bg-gray-700 transition-all duration-500"
                :style="{ width: `${getPercentage(activities.length, totalCounts.total)}%` }"
              ></div>
            </Card>

            <Card class="text-center relative overflow-hidden">
              <CardContent class="pt-6 relative z-10">
                <div class="text-2xl font-bold text-green-600">
                  {{ totalCounts.delivered.toLocaleString() }}
                </div>
                <div class="text-xs t-text-secondary uppercase tracking-wide">
                  Delivered
                </div>
                <div
                  v-if="loadedStats.delivered < totalCounts.delivered && totalCounts.delivered > 0"
                  class="text-[10px] t-text-muted mt-1"
                >
                  {{ loadedStats.delivered.toLocaleString() }} in view
                </div>
              </CardContent>
              <div
                v-if="totalCounts.total > 0"
                class="absolute bottom-0 left-0 h-1 bg-green-500 transition-all duration-500"
                :style="{ width: `${getPercentage(totalCounts.delivered, totalCounts.total)}%` }"
              ></div>
            </Card>

            <Card class="text-center relative overflow-hidden">
              <CardContent class="pt-6 relative z-10">
                <div class="text-2xl font-bold text-blue-600">
                  {{ totalCounts.open.toLocaleString() }}
                </div>
                <div class="text-xs t-text-secondary uppercase tracking-wide">Opens</div>
                <div v-if="totalCounts.delivered > 0" class="text-[10px] t-text-muted mt-1">
                  {{ Math.round((totalCounts.open / totalCounts.delivered) * 100) }}% open rate
                </div>
              </CardContent>
              <div
                v-if="totalCounts.total > 0"
                class="absolute bottom-0 left-0 h-1 bg-blue-500 transition-all duration-500"
                :style="{ width: `${getPercentage(totalCounts.open, totalCounts.total)}%` }"
              ></div>
            </Card>

            <Card class="text-center relative overflow-hidden">
              <CardContent class="pt-6 relative z-10">
                <div class="text-2xl font-bold text-purple-600">
                  {{ totalCounts.click.toLocaleString() }}
                </div>
                <div class="text-xs t-text-secondary uppercase tracking-wide">Clicks</div>
                <div v-if="totalCounts.open > 0" class="text-[10px] t-text-muted mt-1">
                  {{ Math.round((totalCounts.click / totalCounts.open) * 100) }}% click rate
                </div>
              </CardContent>
              <div
                v-if="totalCounts.total > 0"
                class="absolute bottom-0 left-0 h-1 bg-purple-500 transition-all duration-500"
                :style="{ width: `${getPercentage(totalCounts.click, totalCounts.total)}%` }"
              ></div>
            </Card>

            <Card class="text-center relative overflow-hidden">
              <CardContent class="pt-6 relative z-10">
                <div class="text-2xl font-bold text-red-600">
                  {{ totalCounts.bounce.toLocaleString() }}
                </div>
                <div class="text-xs t-text-secondary uppercase tracking-wide">Bounces</div>
                <div v-if="totalCounts.delivered > 0" class="text-[10px] t-text-muted mt-1">
                  {{
                    Math.round(
                      (totalCounts.bounce / (totalCounts.delivered + totalCounts.bounce)) * 100
                    )
                  }}% bounce rate
                </div>
              </CardContent>
              <div
                v-if="totalCounts.total > 0"
                class="absolute bottom-0 left-0 h-1 bg-red-500 transition-all duration-500"
                :style="{ width: `${getPercentage(totalCounts.bounce, totalCounts.total)}%` }"
              ></div>
            </Card>
          </div>

          <!-- Filters -->
          <div class="flex flex-col sm:flex-row gap-4 mb-6">
            <Input
              v-model="searchQuery"
              placeholder="Search by email or name..."
              class="flex-1 max-w-md"
            >
              <template #leading>
                <Icon name="lucide:search" class="w-4 h-4 t-text-muted" />
              </template>
            </Input>
            <Select v-model="eventFilter">
              <SelectTrigger class="w-40">
                <SelectValue placeholder="Filter by event" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem
                  v-for="option in eventOptions"
                  :key="option.value"
                  :value="option.value"
                >
                  {{ option.label }}
                </SelectItem>
              </SelectContent>
            </Select>
            <Select v-model="emailFilter">
              <SelectTrigger class="w-60">
                <SelectValue placeholder="Filter by email" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem
                  v-for="option in emailOptions"
                  :key="option.value"
                  :value="option.value"
                >
                  {{ option.label }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <!-- Activity Table with Infinite Scroll -->
          <Card>
            <CardContent class="p-0">
              <div
                ref="scrollContainer"
                class="max-h-[60vh] overflow-y-auto"
                @scroll="handleScroll"
              >
                <AppDataTable
                  class="px-2 pb-2"
                  :columns="activityColumns"
                  :rows="filteredActivities"
                  :loading="loading"
                  :filtered="eventFilter !== 'all' || emailFilter !== 'all' || !!searchQuery"
                  sticky-header
                  empty-title="No activity yet"
                  empty-description="Email activity appears here once emails are sent and tracked."
                  empty-icon="lucide:inbox"
                >
                  <template #cell-event="{ row }">
                    <div class="flex items-center gap-2">
                      <Icon
                        :name="getEventIcon(row.event)"
                        :class="getEventColorClass(row.event)"
                        class="w-5 h-5"
                      />
                      <Badge
                        :variant="row.event === 'bounce' ? 'destructive' : 'secondary'"
                        class="capitalize"
                      >
                        {{ row.event }}
                      </Badge>
                    </div>
                  </template>
                  <template #cell-recipient="{ row }">
                    <p class="font-medium text-sm">{{ getMemberName(row) }}</p>
                    <p class="text-xs t-text-muted">{{ row.email }}</p>
                  </template>
                  <template #cell-clicked_url="{ value }">
                    <a
                      v-if="value"
                      :href="value as string"
                      target="_blank"
                      rel="noopener"
                      class="text-xs t-text-accent hover:underline truncate block max-w-[200px]"
                    >
                      {{ value }}
                    </a>
                    <span v-else class="t-text-muted">—</span>
                  </template>
                  <template #cell-date_created="{ value }">
                    <span class="text-sm t-text-secondary">{{ formatDate(value as string) }}</span>
                  </template>
                </AppDataTable>

                <!-- Load More Indicator -->
                <div v-if="loadingMore" class="flex items-center justify-center py-4">
                  <Icon
                    name="lucide:loader-2"
                    class="w-5 h-5 animate-spin t-text-muted mr-2"
                  />
                  <span class="text-sm t-text-muted">Loading more...</span>
                </div>

                <!-- End of Data -->
                <div
                  v-else-if="!hasMore && activities.length > 0"
                  class="text-center py-4 text-sm t-text-muted"
                >
                  All {{ activities.length.toLocaleString() }} events loaded
                </div>
              </div>
            </CardContent>
          </Card>

          <!-- Pagination Info -->
          <div class="mt-4 flex items-center justify-between text-sm t-text-muted">
            <div>
              Showing {{ filteredActivities.length.toLocaleString() }} of
              {{ activities.length.toLocaleString() }} loaded events
            </div>
            <div v-if="hasMore" class="flex items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                :disabled="loadingMore"
                @click="fetchActivities(false)"
              >
                <Icon name="lucide:arrow-down" class="w-4 h-4 mr-1" />
                Load More
              </Button>
            </div>
          </div>

          <!-- Data freshness note -->
          <p
            v-if="totalCounts.total > activities.length"
            class="mt-2 text-xs t-text-muted text-center"
          >
            Showing the most recent {{ activities.length.toLocaleString() }} of
            {{ totalCounts.total.toLocaleString() }} total events. Scroll down or click "Load
            More" to see older events.
          </p>
        </template>
      </PageContainer>
  </div>
</template>
