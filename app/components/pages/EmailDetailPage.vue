<script setup lang="ts">
import { toast } from "vue-sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const props = defineProps<{
  emailId: string;
}>();

const { navigateToOrg } = useOrgNavigation();
const emailSystem = useEmailSystem();

// Tab state
const activeTab = ref("activity");

// Fetch email details
const {
  data: emailData,
  refresh,
  status: fetchStatus,
} = await useAsyncData(
  `email-detail-${props.emailId}`,
  async () => {
    try {
      return await emailSystem.getEmail(props.emailId);
    } catch (error) {
      console.error("Error fetching email:", error);
      return null;
    }
  },
  {
    immediate: true,
  }
);

const email = computed(() => emailData.value?.email || null);

// Activity data state - using manual fetch instead of useAsyncData for better control
const activityData = ref<{
  success: boolean;
  stats: {
    opens: number;
    uniqueOpens: number;
    clicks: number;
    uniqueClicks: number;
    bounces: number;
    delivered: number;
    dropped: number;
    spamReports: number;
    unsubscribes: number;
  };
  clickedUrls: Array<{ url: string; count: number }>;
  recentActivity: Array<{
    id: string;
    event: string;
    email: string;
    clickedUrl?: string;
    timestamp: string;
    recipientName?: string;
  }>;
} | null>(null);
const activityFetched = ref(false);

// Fetch activity when email is loaded and has 'sent' status
const fetchActivity = async () => {
  if (activityFetched.value) return;
  if (!email.value || email.value.status !== "sent") return;

  try {
    const headers = useRequestHeaders(["cookie"]);
    const result = await $fetch(`/api/email/${props.emailId}/activity`, { headers });
    activityData.value = result as typeof activityData.value;
    activityFetched.value = true;
  } catch (error) {
    console.error("Error fetching activity:", error);
  }
};

// Trigger activity fetch when email status becomes 'sent'
watch(
  () => email.value?.status,
  async (status) => {
    if (status === "sent" && !activityFetched.value) {
      await fetchActivity();
    }
  },
  { immediate: true }
);

const activityStats = computed(() => activityData.value?.stats || null);
const clickedUrls = computed(() => activityData.value?.clickedUrls || []);
const recentActivity = computed(() => activityData.value?.recentActivity || []);

// Chart data computed properties
const deliveryChartData = computed(() => {
  if (!email.value) return [];
  const delivered = email.value.delivered_count || 0;
  const failed = email.value.failed_count || 0;
  const total = email.value.recipient_count || 0;
  const pending = Math.max(0, total - delivered - failed);

  return [
    { label: "Delivered", value: delivered, color: "#22c55e" },
    { label: "Failed", value: failed, color: "#ef4444" },
    { label: "Pending", value: pending, color: "#a1a1aa" },
  ].filter(d => d.value > 0);
});

const engagementChartData = computed(() => {
  if (!activityStats.value) return [];

  return [
    { label: "Opens", value: activityStats.value.uniqueOpens, color: "#3b82f6" },
    { label: "Clicks", value: activityStats.value.uniqueClicks, color: "#8b5cf6" },
    { label: "Bounces", value: activityStats.value.bounces, color: "#f97316" },
    { label: "Spam Reports", value: activityStats.value.spamReports, color: "#ef4444" },
  ].filter(d => d.value > 0);
});

const eventTypeBreakdown = computed(() => {
  if (!recentActivity.value.length) return [];

  const counts: Record<string, number> = {};
  recentActivity.value.forEach(a => {
    counts[a.event] = (counts[a.event] || 0) + 1;
  });

  const colorMap: Record<string, string> = {
    open: "#3b82f6",
    click: "#8b5cf6",
    delivered: "#22c55e",
    bounce: "#f97316",
    dropped: "#ef4444",
    spam_report: "#dc2626",
    unsubscribe: "#d97706",
    processed: "#71717a",
    deferred: "#eab308",
  };

  return Object.entries(counts).map(([event, value]) => ({
    label: event.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
    value,
    color: colorMap[event] || "#71717a",
  })).sort((a, b) => b.value - a.value);
});

// Delete confirmation
const showDeleteDialog = ref(false);

const handleDelete = async () => {
  try {
    await emailSystem.deleteEmail(props.emailId);
    toast.success("Email draft deleted");
    navigateToOrg("/admin/email");
  } catch (error: any) {
    toast.error(error.message || "Failed to delete email");
  } finally {
    showDeleteDialog.value = false;
  }
};

// Edit draft
const handleEdit = () => {
  navigateToOrg(`/admin/email/compose?id=${props.emailId}`);
};

// Back to list
const handleBack = () => {
  navigateToOrg("/admin/email");
};

// Format helpers
const formatDate = (date: string | null | undefined) => {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatShortDate = (date: string | null | undefined) => {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const getStatusBadgeClass = (status: string) => {
  const classes: Record<string, string> = {
    draft: "bg-stone-100 text-stone-700",
    scheduled: "bg-blue-100 text-blue-700",
    sending: "bg-yellow-100 text-yellow-700",
    sent: "bg-green-100 text-green-700",
    failed: "bg-red-100 text-red-700",
  };
  return classes[status] || classes.draft;
};

const getRecipientStatusBadgeClass = (status: string) => {
  const classes: Record<string, string> = {
    pending: "bg-stone-100 text-stone-600",
    sent: "bg-green-100 text-green-700",
    delivered: "bg-green-100 text-green-700",
    failed: "bg-red-100 text-red-700",
    bounced: "bg-orange-100 text-orange-700",
  };
  return classes[status] || classes.pending;
};

const formatFileSize = (bytes: number) => {
  if (!bytes || bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
};

const getActivityEventInfo = (event: string) => {
  const events: Record<string, { icon: string; color: string; label: string }> = {
    open: { icon: "lucide:eye", color: "text-blue-600 bg-blue-100", label: "Opened" },
    click: { icon: "lucide:mouse-pointer-click", color: "text-purple-600 bg-purple-100", label: "Clicked" },
    delivered: { icon: "lucide:check-circle", color: "text-green-600 bg-green-100", label: "Delivered" },
    bounce: { icon: "lucide:alert-triangle", color: "text-orange-600 bg-orange-100", label: "Bounced" },
    dropped: { icon: "lucide:x-circle", color: "text-red-600 bg-red-100", label: "Dropped" },
    spam_report: { icon: "lucide:shield-alert", color: "text-red-600 bg-red-100", label: "Spam Report" },
    unsubscribe: { icon: "lucide:user-minus", color: "text-amber-600 bg-amber-100", label: "Unsubscribed" },
    processed: { icon: "lucide:send", color: "text-stone-600 bg-stone-100", label: "Processed" },
    deferred: { icon: "lucide:clock", color: "text-yellow-600 bg-yellow-100", label: "Deferred" },
  };
  return events[event] || { icon: "lucide:mail", color: "text-stone-600 bg-stone-100", label: event };
};

useSeoMeta({
  title: computed(() => email.value?.subject || "Email Details"),
  description: "View email details and delivery status",
});
</script>

<template>
  <div class="min-h-screen bg-stone-50">
    <div class="p-6">
      <div class="max-w-7xl mx-auto">
        <!-- Header -->
        <div class="mb-6">
          <Button variant="ghost" size="sm" @click="handleBack" class="mb-4">
            <Icon name="lucide:arrow-left" class="w-4 h-4 mr-2" />
            Back to Emails
          </Button>
        </div>

        <!-- Loading State -->
        <div v-if="fetchStatus === 'pending'" class="text-center py-12">
          <Icon
            name="lucide:loader-2"
            class="w-8 h-8 animate-spin mx-auto mb-4"
          />
          <p class="text-sm text-stone-600">Loading email...</p>
        </div>

        <!-- Not Found State -->
        <div v-else-if="!email" class="text-center py-12">
          <Alert variant="destructive" class="max-w-md mx-auto">
            <Icon name="lucide:alert-circle" class="w-4 h-4" />
            <AlertTitle>Email Not Found</AlertTitle>
            <AlertDescription>
              The email you're looking for doesn't exist or has been deleted.
            </AlertDescription>
          </Alert>
          <Button @click="handleBack" class="mt-4">
            Back to Emails
          </Button>
        </div>

        <!-- Email Details - Two Column Layout -->
        <div v-else class="flex flex-col lg:flex-row gap-6">
          <!-- Left Column - Email Preview (max 600px) -->
          <div class="w-full lg:w-[600px] lg:flex-shrink-0 space-y-6">
            <!-- Email Header -->
            <Card>
              <CardHeader class="pb-4">
                <div class="flex justify-between items-start">
                  <div class="space-y-2">
                    <div class="flex items-center gap-2 flex-wrap">
                      <span
                        class="inline-flex items-center px-2.5 py-0.5 text-xs font-medium rounded-full capitalize"
                        :class="getStatusBadgeClass(email.status || 'draft')"
                      >
                        {{ email.status || 'draft' }}
                      </span>
                      <span class="inline-flex items-center px-2.5 py-0.5 text-xs font-medium rounded-full bg-stone-100 text-stone-700 capitalize">
                        {{ email.email_type }}
                      </span>
                    </div>
                    <CardTitle class="text-xl">{{ email.subject }}</CardTitle>
                    <CardDescription class="text-xs">
                      {{ formatDate(email.date_created) }}
                      <span v-if="email.sent_at" class="block mt-0.5">
                        Sent {{ formatDate(email.sent_at) }}
                      </span>
                    </CardDescription>
                  </div>
                  <div class="flex gap-2">
                    <Button
                      v-if="email.status === 'draft'"
                      variant="outline"
                      size="sm"
                      @click="handleEdit"
                    >
                      <Icon name="lucide:edit" class="w-4 h-4" />
                    </Button>
                    <Button
                      v-if="email.status === 'draft'"
                      variant="destructive"
                      size="sm"
                      @click="showDeleteDialog = true"
                    >
                      <Icon name="lucide:trash-2" class="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
            </Card>

            <!-- Delivery Stats -->
            <div
              v-if="email.status === 'sent' || email.status === 'failed'"
              class="grid grid-cols-4 gap-2"
            >
              <Card class="p-3">
                <div class="text-center">
                  <p class="text-xl font-bold">{{ email.recipient_count || 0 }}</p>
                  <p class="text-xs text-stone-500">Recipients</p>
                </div>
              </Card>
              <Card class="p-3">
                <div class="text-center">
                  <p class="text-xl font-bold text-green-600">{{ email.delivered_count || 0 }}</p>
                  <p class="text-xs text-stone-500">Delivered</p>
                </div>
              </Card>
              <Card class="p-3">
                <div class="text-center">
                  <p class="text-xl font-bold text-red-600">{{ email.failed_count || 0 }}</p>
                  <p class="text-xs text-stone-500">Failed</p>
                </div>
              </Card>
              <Card class="p-3">
                <div class="text-center">
                  <p class="text-xl font-bold text-emerald-600">
                    {{ email.recipient_count ? Math.round(((email.delivered_count || 0) / email.recipient_count) * 100) : 0 }}%
                  </p>
                  <p class="text-xs text-stone-500">Rate</p>
                </div>
              </Card>
            </div>

            <!-- Email Content Preview -->
            <Card>
              <CardHeader class="pb-2">
                <CardTitle class="text-sm font-medium text-stone-600">Email Preview</CardTitle>
              </CardHeader>
              <CardContent class="p-0">
                <div class="border rounded-lg overflow-hidden bg-stone-100">
                  <div class="max-w-[600px] mx-auto bg-white">
                    <div class="p-4">
                      <p v-if="email.greeting" class="text-sm text-stone-600 italic mb-3">
                        {{ email.greeting }}
                      </p>
                      <div class="prose prose-sm prose-stone max-w-none email-content" v-html="email.content"></div>
                      <p v-if="email.salutation" class="text-sm text-stone-600 mt-4">
                        {{ email.salutation || emailSystem.defaultSalutations[email.email_type] }},
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <!-- Attachments -->
            <Card v-if="email.attachments && email.attachments.length > 0">
              <CardHeader class="py-3">
                <CardTitle class="text-sm font-medium flex items-center gap-2">
                  <Icon name="lucide:paperclip" class="w-4 h-4" />
                  Attachments ({{ email.attachments.length }})
                </CardTitle>
              </CardHeader>
              <CardContent class="pt-0">
                <div class="space-y-1">
                  <div
                    v-for="attachment in email.attachments"
                    :key="attachment.id"
                    class="flex items-center gap-2 p-2 bg-stone-50 rounded text-sm"
                  >
                    <Icon name="lucide:file" class="w-4 h-4 text-stone-500" />
                    <span class="truncate flex-1">
                      {{ attachment.directus_files_id?.filename_download || 'Attachment' }}
                    </span>
                    <span class="text-xs text-stone-400">
                      {{ formatFileSize(attachment.directus_files_id?.filesize) }}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <!-- Recipients List -->
            <Card v-if="email.recipients && email.recipients.length > 0">
              <CardHeader class="py-3">
                <CardTitle class="text-sm font-medium">
                  Recipients ({{ email.recipients.length }})
                </CardTitle>
              </CardHeader>
              <CardContent class="pt-0">
                <div class="max-h-60 overflow-y-auto">
                  <table class="w-full text-sm">
                    <thead class="sticky top-0 bg-white">
                      <tr class="border-b text-left text-xs text-stone-500">
                        <th class="py-2 pr-2">Name</th>
                        <th class="py-2 pr-2">Email</th>
                        <th class="py-2">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr
                        v-for="recipient in email.recipients"
                        :key="recipient.id"
                        class="border-b last:border-0"
                      >
                        <td class="py-2 pr-2 truncate max-w-[120px]">
                          {{ recipient.recipient_name || '—' }}
                        </td>
                        <td class="py-2 pr-2 text-stone-600 truncate max-w-[160px]">
                          {{ recipient.recipient_email }}
                        </td>
                        <td class="py-2">
                          <span
                            class="inline-flex items-center px-1.5 py-0.5 text-xs font-medium rounded capitalize"
                            :class="getRecipientStatusBadgeClass(recipient.status || 'pending')"
                          >
                            {{ recipient.status || 'pending' }}
                          </span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>

          <!-- Right Column - Activity Tabs -->
          <div class="flex-1 min-w-0">
            <Card class="h-full">
              <CardHeader class="pb-2">
                <CardTitle class="flex items-center gap-2">
                  <Icon name="lucide:activity" class="w-5 h-5" />
                  Email Activity
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Tabs v-model="activeTab" class="w-full">
                  <TabsList class="grid w-full grid-cols-2 mb-4">
                    <TabsTrigger value="activity">
                      <Icon name="lucide:list" class="w-4 h-4 mr-2" />
                      Activity
                    </TabsTrigger>
                    <TabsTrigger value="charts">
                      <Icon name="lucide:bar-chart-2" class="w-4 h-4 mr-2" />
                      Charts
                    </TabsTrigger>
                  </TabsList>

                  <!-- Activity List Tab -->
                  <TabsContent value="activity" class="mt-0">
                    <!-- Engagement Stats Row -->
                    <div
                      v-if="activityStats"
                      class="grid grid-cols-4 gap-2 mb-4"
                    >
                      <div class="text-center p-2 bg-blue-50 rounded-lg">
                        <p class="text-lg font-bold text-blue-600">{{ activityStats.uniqueOpens }}</p>
                        <p class="text-xs text-blue-600">Opens</p>
                      </div>
                      <div class="text-center p-2 bg-purple-50 rounded-lg">
                        <p class="text-lg font-bold text-purple-600">{{ activityStats.uniqueClicks }}</p>
                        <p class="text-xs text-purple-600">Clicks</p>
                      </div>
                      <div class="text-center p-2 bg-orange-50 rounded-lg">
                        <p class="text-lg font-bold text-orange-600">{{ activityStats.bounces }}</p>
                        <p class="text-xs text-orange-600">Bounces</p>
                      </div>
                      <div class="text-center p-2 bg-red-50 rounded-lg">
                        <p class="text-lg font-bold text-red-600">{{ activityStats.spamReports }}</p>
                        <p class="text-xs text-red-600">Spam</p>
                      </div>
                    </div>

                    <!-- Clicked URLs -->
                    <div v-if="clickedUrls.length > 0" class="mb-4">
                      <h4 class="text-sm font-medium text-stone-600 mb-2 flex items-center gap-2">
                        <Icon name="lucide:link" class="w-4 h-4" />
                        Top Links
                      </h4>
                      <div class="space-y-1">
                        <div
                          v-for="link in clickedUrls.slice(0, 5)"
                          :key="link.url"
                          class="flex items-center justify-between p-2 bg-stone-50 rounded text-sm"
                        >
                          <a
                            :href="link.url"
                            target="_blank"
                            class="text-blue-600 hover:underline truncate max-w-[70%]"
                          >
                            {{ link.url }}
                          </a>
                          <span class="text-stone-500 text-xs">{{ link.count }} clicks</span>
                        </div>
                      </div>
                    </div>

                    <!-- Activity Feed -->
                    <div>
                      <h4 class="text-sm font-medium text-stone-600 mb-2">Recent Activity</h4>
                      <div v-if="recentActivity.length > 0" class="space-y-1 max-h-[400px] overflow-y-auto">
                        <div
                          v-for="activity in recentActivity"
                          :key="activity.id"
                          class="flex items-center gap-2 p-2 hover:bg-stone-50 rounded"
                        >
                          <div
                            :class="[
                              'p-1 rounded-full flex-shrink-0',
                              getActivityEventInfo(activity.event).color,
                            ]"
                          >
                            <Icon
                              :name="getActivityEventInfo(activity.event).icon"
                              class="w-3 h-3"
                            />
                          </div>
                          <div class="flex-1 min-w-0">
                            <div class="text-sm">
                              <span class="font-medium">{{ getActivityEventInfo(activity.event).label }}</span>
                              <span v-if="activity.recipientName" class="text-stone-500">
                                - {{ activity.recipientName }}
                              </span>
                            </div>
                            <div v-if="activity.clickedUrl" class="text-xs text-blue-600 truncate">
                              {{ activity.clickedUrl }}
                            </div>
                          </div>
                          <div class="text-xs text-stone-400 flex-shrink-0">
                            {{ formatShortDate(activity.timestamp) }}
                          </div>
                        </div>
                      </div>
                      <div v-else class="text-center py-8 text-stone-400">
                        <Icon name="lucide:inbox" class="w-8 h-8 mx-auto mb-2" />
                        <p class="text-sm">No activity yet</p>
                      </div>
                    </div>
                  </TabsContent>

                  <!-- Charts Tab -->
                  <TabsContent value="charts" class="mt-0">
                    <!-- Delivery Chart -->
                    <div class="mb-6">
                      <h4 class="text-sm font-medium text-stone-600 mb-3">Delivery Status</h4>
                      <div v-if="deliveryChartData.length > 0" class="space-y-2">
                        <div
                          v-for="item in deliveryChartData"
                          :key="item.label"
                          class="flex items-center gap-3"
                        >
                          <div class="w-24 text-sm text-stone-600">{{ item.label }}</div>
                          <div class="flex-1 h-6 bg-stone-100 rounded-full overflow-hidden">
                            <div
                              class="h-full rounded-full transition-all duration-500"
                              :style="{
                                width: `${(item.value / (email.recipient_count || 1)) * 100}%`,
                                backgroundColor: item.color,
                              }"
                            ></div>
                          </div>
                          <div class="w-12 text-sm font-medium text-right">{{ item.value }}</div>
                        </div>
                      </div>
                      <div v-else class="text-center py-4 text-stone-400 text-sm">
                        No delivery data available
                      </div>
                    </div>

                    <!-- Engagement Chart -->
                    <div class="mb-6">
                      <h4 class="text-sm font-medium text-stone-600 mb-3">Engagement</h4>
                      <div v-if="engagementChartData.length > 0" class="space-y-2">
                        <div
                          v-for="item in engagementChartData"
                          :key="item.label"
                          class="flex items-center gap-3"
                        >
                          <div class="w-24 text-sm text-stone-600">{{ item.label }}</div>
                          <div class="flex-1 h-6 bg-stone-100 rounded-full overflow-hidden">
                            <div
                              class="h-full rounded-full transition-all duration-500"
                              :style="{
                                width: `${Math.min((item.value / (email.delivered_count || 1)) * 100, 100)}%`,
                                backgroundColor: item.color,
                              }"
                            ></div>
                          </div>
                          <div class="w-12 text-sm font-medium text-right">{{ item.value }}</div>
                        </div>
                      </div>
                      <div v-else class="text-center py-4 text-stone-400 text-sm">
                        No engagement data yet
                      </div>
                    </div>

                    <!-- Event Type Breakdown -->
                    <div>
                      <h4 class="text-sm font-medium text-stone-600 mb-3">Event Breakdown</h4>
                      <div v-if="eventTypeBreakdown.length > 0" class="space-y-2">
                        <div
                          v-for="item in eventTypeBreakdown"
                          :key="item.label"
                          class="flex items-center gap-3"
                        >
                          <div class="w-24 text-sm text-stone-600 truncate">{{ item.label }}</div>
                          <div class="flex-1 h-6 bg-stone-100 rounded-full overflow-hidden">
                            <div
                              class="h-full rounded-full transition-all duration-500"
                              :style="{
                                width: `${(item.value / recentActivity.length) * 100}%`,
                                backgroundColor: item.color,
                              }"
                            ></div>
                          </div>
                          <div class="w-12 text-sm font-medium text-right">{{ item.value }}</div>
                        </div>
                      </div>
                      <div v-else class="text-center py-4 text-stone-400 text-sm">
                        No events recorded
                      </div>
                    </div>

                    <!-- Rates Summary -->
                    <div v-if="activityStats && email.delivered_count" class="mt-6 grid grid-cols-2 gap-4">
                      <div class="text-center p-4 bg-cyan-50 rounded-lg">
                        <p class="text-2xl font-bold text-cyan-600">
                          {{ Math.round((activityStats.uniqueOpens / email.delivered_count) * 100) }}%
                        </p>
                        <p class="text-sm text-cyan-600">Open Rate</p>
                      </div>
                      <div class="text-center p-4 bg-indigo-50 rounded-lg">
                        <p class="text-2xl font-bold text-indigo-600">
                          {{ activityStats.uniqueOpens ? Math.round((activityStats.uniqueClicks / activityStats.uniqueOpens) * 100) : 0 }}%
                        </p>
                        <p class="text-sm text-indigo-600">Click-to-Open</p>
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </div>
        </div>

        <!-- Delete Confirmation Dialog -->
        <Dialog v-model:open="showDeleteDialog">
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Draft</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete this email draft? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" @click="showDeleteDialog = false">
                Cancel
              </Button>
              <Button variant="destructive" @click="handleDelete">
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  </div>
</template>

<style scoped>
.email-content :deep(img) {
  max-width: 100%;
  height: auto;
}

.email-content :deep(a) {
  color: #3b82f6;
  text-decoration: underline;
}
</style>
