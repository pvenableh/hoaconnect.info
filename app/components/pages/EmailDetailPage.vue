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

const props = defineProps<{
  emailId: string;
}>();

const { navigateToOrg } = useOrgNavigation();
const emailSystem = useEmailSystem();

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

// Fetch activity stats for sent emails
const { data: activityData, status: activityStatus } = await useAsyncData(
  `email-activity-${props.emailId}`,
  async () => {
    // Only fetch activity for sent emails
    if (!email.value || email.value.status !== "sent") {
      return null;
    }
    try {
      // Forward cookies for SSR authentication
      const headers = useRequestHeaders(["cookie"]);
      return await $fetch(`/api/email/${props.emailId}/activity`, { headers });
    } catch (error) {
      console.error("Error fetching activity:", error);
      return null;
    }
  },
  {
    watch: [email],
    immediate: false,
  }
);

// Trigger activity fetch when email is loaded
watch(
  () => email.value?.status,
  (status) => {
    if (status === "sent") {
      activityData.value; // Trigger the fetch
    }
  },
  { immediate: true }
);

const activityStats = computed(() => activityData.value?.stats || null);
const clickedUrls = computed(() => activityData.value?.clickedUrls || []);
const recentActivity = computed(() => activityData.value?.recentActivity || []);

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
    month: "long",
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
      <div class="max-w-5xl mx-auto">
        <!-- Header -->
        <div class="mb-8">
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

        <!-- Email Details -->
        <div v-else class="space-y-6">
          <!-- Email Header -->
          <Card>
            <CardHeader>
              <div class="flex justify-between items-start">
                <div class="space-y-2">
                  <div class="flex items-center gap-3">
                    <span
                      class="inline-flex items-center px-3 py-1 text-sm font-medium rounded-full capitalize"
                      :class="getStatusBadgeClass(email.status || 'draft')"
                    >
                      {{ email.status || 'draft' }}
                    </span>
                    <span class="inline-flex items-center px-3 py-1 text-sm font-medium rounded-full bg-stone-100 text-stone-700 capitalize">
                      {{ email.email_type }}
                    </span>
                  </div>
                  <CardTitle class="text-2xl">{{ email.subject }}</CardTitle>
                  <CardDescription>
                    Created {{ formatDate(email.date_created) }}
                    <span v-if="email.sent_at">
                      • Sent {{ formatDate(email.sent_at) }}
                    </span>
                  </CardDescription>
                </div>
                <div class="flex gap-2">
                  <Button
                    v-if="email.status === 'draft'"
                    variant="outline"
                    @click="handleEdit"
                  >
                    <Icon name="lucide:edit" class="w-4 h-4 mr-2" />
                    Edit
                  </Button>
                  <Button
                    v-if="email.status === 'draft'"
                    variant="destructive"
                    @click="showDeleteDialog = true"
                  >
                    <Icon name="lucide:trash-2" class="w-4 h-4 mr-2" />
                    Delete
                  </Button>
                </div>
              </div>
            </CardHeader>
          </Card>

          <!-- Stats (for sent emails) -->
          <div
            v-if="email.status === 'sent' || email.status === 'failed'"
            class="grid grid-cols-1 md:grid-cols-4 gap-4"
          >
            <Card>
              <CardContent class="pt-6">
                <div class="flex items-center gap-3">
                  <div class="p-2 bg-blue-100 rounded-lg">
                    <Icon name="lucide:users" class="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <p class="text-2xl font-bold">{{ email.recipient_count || 0 }}</p>
                    <p class="text-sm text-stone-600">Total Recipients</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent class="pt-6">
                <div class="flex items-center gap-3">
                  <div class="p-2 bg-green-100 rounded-lg">
                    <Icon name="lucide:check-circle" class="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <p class="text-2xl font-bold">{{ email.delivered_count || 0 }}</p>
                    <p class="text-sm text-stone-600">Delivered</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent class="pt-6">
                <div class="flex items-center gap-3">
                  <div class="p-2 bg-red-100 rounded-lg">
                    <Icon name="lucide:x-circle" class="w-5 h-5 text-red-600" />
                  </div>
                  <div>
                    <p class="text-2xl font-bold">{{ email.failed_count || 0 }}</p>
                    <p class="text-sm text-stone-600">Failed</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent class="pt-6">
                <div class="flex items-center gap-3">
                  <div class="p-2 bg-emerald-100 rounded-lg">
                    <Icon name="lucide:percent" class="w-5 h-5 text-emerald-600" />
                  </div>
                  <div>
                    <p class="text-2xl font-bold">
                      {{ email.recipient_count ? Math.round(((email.delivered_count || 0) / email.recipient_count) * 100) : 0 }}%
                    </p>
                    <p class="text-sm text-stone-600">Delivery Rate</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <!-- Engagement Stats -->
          <div
            v-if="activityStats && (activityStats.opens > 0 || activityStats.clicks > 0)"
            class="grid grid-cols-1 md:grid-cols-4 gap-4"
          >
            <Card>
              <CardContent class="pt-6">
                <div class="flex items-center gap-3">
                  <div class="p-2 bg-blue-100 rounded-lg">
                    <Icon name="lucide:eye" class="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <p class="text-2xl font-bold">{{ activityStats.uniqueOpens }}</p>
                    <p class="text-sm text-stone-600">Unique Opens</p>
                    <p class="text-xs text-stone-400">({{ activityStats.opens }} total)</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent class="pt-6">
                <div class="flex items-center gap-3">
                  <div class="p-2 bg-purple-100 rounded-lg">
                    <Icon name="lucide:mouse-pointer-click" class="w-5 h-5 text-purple-600" />
                  </div>
                  <div>
                    <p class="text-2xl font-bold">{{ activityStats.uniqueClicks }}</p>
                    <p class="text-sm text-stone-600">Unique Clicks</p>
                    <p class="text-xs text-stone-400">({{ activityStats.clicks }} total)</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent class="pt-6">
                <div class="flex items-center gap-3">
                  <div class="p-2 bg-cyan-100 rounded-lg">
                    <Icon name="lucide:trending-up" class="w-5 h-5 text-cyan-600" />
                  </div>
                  <div>
                    <p class="text-2xl font-bold">
                      {{ email.delivered_count ? Math.round((activityStats.uniqueOpens / email.delivered_count) * 100) : 0 }}%
                    </p>
                    <p class="text-sm text-stone-600">Open Rate</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent class="pt-6">
                <div class="flex items-center gap-3">
                  <div class="p-2 bg-indigo-100 rounded-lg">
                    <Icon name="lucide:link" class="w-5 h-5 text-indigo-600" />
                  </div>
                  <div>
                    <p class="text-2xl font-bold">
                      {{ activityStats.uniqueOpens ? Math.round((activityStats.uniqueClicks / activityStats.uniqueOpens) * 100) : 0 }}%
                    </p>
                    <p class="text-sm text-stone-600">Click-to-Open Rate</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <!-- Clicked URLs -->
          <Card v-if="clickedUrls.length > 0">
            <CardHeader>
              <CardTitle class="flex items-center gap-2">
                <Icon name="lucide:link" class="w-5 h-5" />
                Top Clicked Links
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div class="space-y-2">
                <div
                  v-for="link in clickedUrls"
                  :key="link.url"
                  class="flex items-center justify-between p-3 bg-stone-50 rounded-lg"
                >
                  <a
                    :href="link.url"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="text-sm text-blue-600 hover:underline truncate max-w-[80%]"
                  >
                    {{ link.url }}
                  </a>
                  <span class="text-sm font-medium text-stone-600">
                    {{ link.count }} click{{ link.count !== 1 ? 's' : '' }}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          <!-- Recent Activity -->
          <Card v-if="recentActivity.length > 0">
            <CardHeader>
              <CardTitle class="flex items-center gap-2">
                <Icon name="lucide:activity" class="w-5 h-5" />
                Recent Activity
              </CardTitle>
              <CardDescription>
                Last {{ recentActivity.length }} events
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div class="space-y-2 max-h-80 overflow-y-auto">
                <div
                  v-for="activity in recentActivity"
                  :key="activity.id"
                  class="flex items-center gap-3 p-2 hover:bg-stone-50 rounded-lg"
                >
                  <div
                    :class="[
                      'p-1.5 rounded-full',
                      getActivityEventInfo(activity.event).color,
                    ]"
                  >
                    <Icon
                      :name="getActivityEventInfo(activity.event).icon"
                      class="w-4 h-4"
                    />
                  </div>
                  <div class="flex-1 min-w-0">
                    <div class="text-sm font-medium">
                      {{ getActivityEventInfo(activity.event).label }}
                      <span v-if="activity.recipientName" class="text-stone-500 font-normal">
                        by {{ activity.recipientName }}
                      </span>
                    </div>
                    <div v-if="activity.clickedUrl" class="text-xs text-blue-600 truncate">
                      {{ activity.clickedUrl }}
                    </div>
                    <div class="text-xs text-stone-400">
                      {{ formatDate(activity.timestamp) }}
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <!-- Email Content -->
          <Card>
            <CardHeader>
              <CardTitle>Email Content</CardTitle>
            </CardHeader>
            <CardContent>
              <div class="prose prose-stone max-w-none">
                <p v-if="email.greeting" class="text-stone-600 italic mb-4">
                  Greeting: {{ email.greeting }}
                </p>
                <div class="email-content" v-html="email.content"></div>
              </div>
            </CardContent>
          </Card>

          <!-- Email Settings -->
          <Card>
            <CardHeader>
              <CardTitle>Email Settings</CardTitle>
            </CardHeader>
            <CardContent>
              <dl class="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <dt class="text-sm text-stone-500">Greeting</dt>
                  <dd class="font-medium">
                    {{ email.greeting || emailSystem.defaultGreeting }}
                  </dd>
                </div>
                <div>
                  <dt class="text-sm text-stone-500">Salutation</dt>
                  <dd class="font-medium">
                    {{ email.salutation || emailSystem.defaultSalutations[email.email_type] || 'Default' }}
                  </dd>
                </div>
                <div>
                  <dt class="text-sm text-stone-500">Board Members in Footer</dt>
                  <dd class="font-medium">
                    {{ email.include_board_footer ? 'Yes' : 'No' }}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          <!-- Attachments -->
          <Card v-if="email.attachments && email.attachments.length > 0">
            <CardHeader>
              <CardTitle class="flex items-center gap-2">
                <Icon name="lucide:paperclip" class="w-5 h-5" />
                Attachments
              </CardTitle>
              <CardDescription>
                {{ email.attachments.length }} file{{ email.attachments.length !== 1 ? 's' : '' }} attached
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div class="space-y-2">
                <div
                  v-for="attachment in email.attachments"
                  :key="attachment.id"
                  class="flex items-center justify-between p-3 bg-stone-50 rounded-lg"
                >
                  <div class="flex items-center gap-3">
                    <div class="p-2 bg-stone-200 rounded-lg">
                      <Icon name="lucide:file" class="w-5 h-5 text-stone-600" />
                    </div>
                    <div>
                      <p class="font-medium text-sm">
                        {{ attachment.directus_files_id?.filename_download || attachment.directus_files_id?.title || 'Attachment' }}
                      </p>
                      <p class="text-xs text-stone-500">
                        {{ attachment.directus_files_id?.type || 'Unknown type' }}
                        <span v-if="attachment.directus_files_id?.filesize">
                          • {{ formatFileSize(attachment.directus_files_id.filesize) }}
                        </span>
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <!-- Recipients List -->
          <Card v-if="email.recipients && email.recipients.length > 0">
            <CardHeader>
              <CardTitle>Recipients</CardTitle>
              <CardDescription>
                {{ email.recipients.length }} recipient{{ email.recipients.length !== 1 ? 's' : '' }}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div class="overflow-x-auto">
                <table class="w-full">
                  <thead>
                    <tr class="border-b">
                      <th class="text-left p-3">Name</th>
                      <th class="text-left p-3">Email</th>
                      <th class="text-left p-3">Status</th>
                      <th class="text-left p-3">Sent At</th>
                      <th class="text-left p-3">Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="recipient in email.recipients"
                      :key="recipient.id"
                      class="border-b hover:bg-stone-50"
                    >
                      <td class="p-3">
                        {{ recipient.recipient_name || '—' }}
                      </td>
                      <td class="p-3 text-stone-600">
                        {{ recipient.recipient_email }}
                      </td>
                      <td class="p-3">
                        <span
                          class="inline-flex items-center px-2 py-1 text-xs font-medium rounded-full capitalize"
                          :class="getRecipientStatusBadgeClass(recipient.status || 'pending')"
                        >
                          {{ recipient.status || 'pending' }}
                        </span>
                      </td>
                      <td class="p-3 text-stone-600">
                        {{ recipient.sent_at ? formatDate(recipient.sent_at) : '—' }}
                      </td>
                      <td class="p-3 text-red-600 text-sm">
                        {{ recipient.error_message || '—' }}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
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
