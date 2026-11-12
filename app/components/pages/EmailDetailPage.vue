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
import type { HoaEmailsFile } from "#core/types/directus";
import { recipientChip } from "#core/shared/email/send-progress";
import { planUnknownResend } from "#core/shared/email/resend-unknown";
import { canRemoveEmail, planFailedRetry, summarizeFailures } from "#core/shared/email/failed-sends";

const props = defineProps<{
  emailId: string;
}>();

const { navigateToOrg } = useOrgNavigation();
const emailSystem = useEmailSystem();

// Tab state
const activeTab = ref("activity");
// A control INSIDE a card, so `sm` — the page-level size would compete with the
// card's own title. Not URL-synced: this is a detail within one record, not a
// view of the page.
const tabItems = [
  { value: "activity", label: "Activity", icon: "lucide:list" },
  { value: "charts", label: "Charts", icon: "lucide:bar-chart-2" },
];

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

// The send queue (Phase 3b): while this email is sending, poll its progress
// every 5 s; when it finishes, reload the email so the counts and the rows
// catch up. A finished queued send keeps its final label.
const sendProgress = useSendProgress();
const isQueuedSend = computed(() => !!(email.value as any)?.send_run_key);
watch(
  () => [email.value?.status, isQueuedSend.value] as const,
  ([status, queued]) => {
    if (status === "sending" && queued) sendProgress.watchSend(props.emailId);
    else if (queued && !sendProgress.progress.value) sendProgress.watchSend(props.emailId);
  },
  { immediate: true }
);
watch(
  () => sendProgress.progress.value?.phase,
  (phase, prev) => {
    if (phase === "done" && prev && prev !== "done") refresh();
  }
);

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
    const org = email.value.organization as any;
    const organizationId = typeof org === "string" ? org : org?.id;
    const result = await $fetch(`/api/email/${props.emailId}/activity`, {
      headers,
      query: { organizationId },
    });
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
    const wasDraft = email.value?.status === "draft";
    await emailSystem.deleteEmail(props.emailId);
    toast.success(wasDraft ? "Email draft deleted" : "Failed email removed");
    navigateToOrg("/admin/communications");
  } catch (error: any) {
    toast.error(error?.data?.message || error.message || "Failed to delete email");
  } finally {
    showDeleteDialog.value = false;
  }
};

// A draft, or a failed send that reached nobody, can be removed
// (core/shared/email/failed-sends.ts); the server checks again.
const canRemove = computed(() => canRemoveEmail(email.value?.status, ((email.value as any)?.recipients ?? []) as any[]));

// Edit draft
const handleEdit = () => {
  navigateToOrg(`/admin/communications/compose?id=${props.emailId}`);
};

// "Resend to these N unknown" (core/shared/email/resend-unknown.ts): only for a
// finished send, only rows SendGrid has said nothing about for an hour, and it
// makes a draft to review, never a send.
const { confirm } = useConfirm();
const resendPlan = computed(() => {
  const e = email.value as any;
  if (!e?.send_run_key || !["sent", "failed", "scheduled"].includes(e.status)) return null;
  const plan = planUnknownResend(e.recipients ?? [], Date.now());
  return plan.memberIds.length || plan.waiting ? plan : null;
});
const resendReadyAt = computed(() => {
  const at = resendPlan.value?.readyAt;
  return at ? new Date(at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : null;
});
const resending = ref(false);
const handleResendUnknown = async () => {
  const n = resendPlan.value?.memberIds.length ?? 0;
  if (!n || resending.value) return;
  const people = n === 1 ? "1 person" : `${n} people`;
  const ok = await confirm({
    title: `Make a draft for the ${people} SendGrid never reported on?`,
    body: "Some of them may already have this email, so they could get it twice. Nothing is sent now: you review the draft and send it yourself.",
    confirmLabel: "Make Draft",
  });
  if (!ok) return;
  resending.value = true;
  try {
    const res = await $fetch<{ draftId: string }>(`/api/email/${props.emailId}/resend-unknown`, { method: "POST" });
    toast.success(`Draft ready for ${people}`);
    navigateToOrg(`/admin/communications/compose?id=${res.draftId}`);
  } catch (error: any) {
    toast.error(error?.data?.message || "Couldn't make the draft");
  } finally {
    resending.value = false;
  }
};

// Why a send failed, and "Retry the N that failed" (core/shared/email/
// failed-sends.ts). Like the unknown resend it makes a draft to review, never a
// send; unlike it, a failed row was refused, so nobody gets the email twice.
const failureReasons = computed(() => {
  const e = email.value as any;
  if (!e || !["sent", "failed", "scheduled"].includes(e.status)) return [];
  return summarizeFailures(e.recipients ?? []);
});
const failedCount = computed(() => failureReasons.value.reduce((n, r) => n + r.count, 0));
const retryPlan = computed(() => planFailedRetry(((email.value as any)?.recipients ?? []) as any[]));
const retrying = ref(false);
const handleRetryFailed = async () => {
  const n = retryPlan.value.memberIds.length;
  if (!n || retrying.value) return;
  const people = n === 1 ? "1 person" : `${n} people`;
  retrying.value = true;
  try {
    const res = await $fetch<{ draftId: string }>(`/api/email/${props.emailId}/retry-failed`, { method: "POST" });
    toast.success(`Draft ready for ${people}. Review it and send.`);
    navigateToOrg(`/admin/communications/compose?id=${res.draftId}`);
  } catch (error: any) {
    toast.error(error?.data?.message || "Couldn't make the draft");
  } finally {
    retrying.value = false;
  }
};

// Back to list
const handleBack = () => {
  navigateToOrg("/admin/communications");
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

// Delivery state is SEMANTIC colour, so it rides the status tokens rather than
// a hand-picked hue — same map EmailPage already uses, so a send reads the same
// in the list and on its detail page. The tokens are `light-dark()` pairs, so
// dark mode needs no second class.
const getStatusBadgeClass = (status: string) => {
  const classes: Record<string, string> = {
    draft: "t-bg-subtle t-text-secondary",
    scheduled: "bg-info/15 text-info",
    sending: "bg-warning/15 text-warning",
    paused: "bg-warning/15 text-warning",
    sent: "bg-success/15 text-success",
    failed: "bg-destructive/15 text-destructive",
  };
  return classes[status] || classes.draft;
};

// The queue's chips (held back with the reason, unknown, the webhook's
// delivery outcome) — one wording, shared with the server's tests.
const CHIP_TONE: Record<string, string> = {
  ok: "bg-success/15 text-success",
  warn: "bg-warning/15 text-warning",
  bad: "bg-destructive/15 text-destructive",
  muted: "t-bg-subtle t-text-secondary",
};
const chipFor = (row: Record<string, any>) => {
  const chip = recipientChip(row);
  return { label: chip.label, class: CHIP_TONE[chip.tone] };
};

const getRecipientStatusBadgeClass = (status: string) => {
  const classes: Record<string, string> = {
    pending: "t-bg-subtle t-text-secondary",
    sent: "bg-success/15 text-success",
    delivered: "bg-success/15 text-success",
    failed: "bg-destructive/15 text-destructive",
    // A bounce is recoverable in a way a hard failure is not, so it warns
    // rather than alarms.
    bounced: "bg-warning/15 text-warning",
  };
  return classes[status] || classes.pending;
};

const recipientColumns = [
  { key: "recipient_name", label: "Name", sortable: true, class: "truncate max-w-[120px]" },
  { key: "recipient_email", label: "Email", sortable: true, hideOnMobile: true, class: "truncate max-w-[160px]" },
  { key: "status", label: "Status", sortable: true },
];

const attachmentKey = (a: string | HoaEmailsFile) =>
  typeof a === "string" ? a : a.id;

const attachmentFile = (a: string | HoaEmailsFile) =>
  typeof a === "object" && a && typeof a.directus_files_id === "object"
    ? a.directus_files_id
    : null;

const formatFileSize = (bytes: number) => {
  if (!bytes || bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
};

// Opens and clicks are CATEGORICAL colour: the hue separates two kinds of
// engagement and carries no judgement, so they keep arbitrary hues. They do
// need a dark pair — these were light-only, which is dark ink on a near-white
// chip once the workspace goes dark. Everything else here is a delivery
// outcome, which is semantic, so it takes a status token.
const ENGAGEMENT_OPEN = "text-blue-700 bg-blue-100 dark:text-blue-200 dark:bg-blue-500/20";
const ENGAGEMENT_CLICK = "text-purple-700 bg-purple-100 dark:text-purple-200 dark:bg-purple-500/20";

const getActivityEventInfo = (event: string) => {
  const events: Record<string, { icon: string; color: string; label: string }> = {
    open: { icon: "lucide:eye", color: ENGAGEMENT_OPEN, label: "Opened" },
    click: { icon: "lucide:mouse-pointer-click", color: ENGAGEMENT_CLICK, label: "Clicked" },
    delivered: { icon: "lucide:check-circle", color: "text-success bg-success/15", label: "Delivered" },
    bounce: { icon: "lucide:alert-triangle", color: "text-warning bg-warning/15", label: "Bounced" },
    dropped: { icon: "lucide:x-circle", color: "text-destructive bg-destructive/15", label: "Dropped" },
    spam_report: { icon: "lucide:shield-alert", color: "text-destructive bg-destructive/15", label: "Spam Report" },
    unsubscribe: { icon: "lucide:user-minus", color: "text-warning bg-warning/15", label: "Unsubscribed" },
    processed: { icon: "lucide:send", color: "t-text-secondary t-bg-subtle", label: "Processed" },
    deferred: { icon: "lucide:clock", color: "text-warning bg-warning/15", label: "Deferred" },
  };
  return events[event] || { icon: "lucide:mail", color: "t-text-secondary t-bg-subtle", label: event };
};

useSeoMeta({
  title: computed(() => email.value?.subject || "Email Details"),
  description: "View email details and delivery status",
});
</script>

<template>
  <div class="min-h-screen t-bg-subtle">
    <PageContainer>
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
          <p class="text-sm t-text-secondary">Loading email...</p>
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
                      <span class="inline-flex items-center px-2.5 py-0.5 text-xs font-medium rounded-full t-bg-subtle t-text-secondary capitalize">
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
                      v-if="canRemove"
                      variant="destructive"
                      size="sm"
                      :aria-label="email.status === 'draft' ? 'Delete draft' : 'Remove failed email'"
                      data-testid="detail-remove-email"
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
                  <p class="text-xs t-text-muted">Recipients</p>
                </div>
              </Card>
              <Card class="p-3">
                <div class="text-center">
                  <p class="text-xl font-bold text-success">{{ email.delivered_count || 0 }}</p>
                  <p class="text-xs t-text-muted">Delivered</p>
                </div>
              </Card>
              <Card class="p-3">
                <div class="text-center">
                  <p class="text-xl font-bold text-destructive">{{ email.failed_count || 0 }}</p>
                  <p class="text-xs t-text-muted">Failed</p>
                </div>
              </Card>
              <Card class="p-3">
                <div class="text-center">
                  <p class="text-xl font-bold text-success">
                    {{ email.recipient_count ? Math.round(((email.delivered_count || 0) / email.recipient_count) * 100) : 0 }}%
                  </p>
                  <p class="text-xs t-text-muted">Rate</p>
                </div>
              </Card>
            </div>

            <!-- Why it failed, and trying again -->
            <Card v-if="failureReasons.length" data-testid="detail-failure-reasons">
              <CardContent class="py-4 space-y-3">
                <div class="flex flex-wrap items-start gap-3">
                  <div class="min-w-0 flex-1 text-sm">
                    <p class="font-medium flex items-center gap-1.5">
                      <Icon name="lucide:alert-triangle" class="w-4 h-4 text-destructive" />
                      {{ failedCount }} {{ failedCount === 1 ? "recipient" : "recipients" }} failed
                    </p>
                    <p class="t-text-secondary">
                      SendGrid refused {{ failedCount === 1 ? "this message" : "these messages" }}, so nothing reached {{ failedCount === 1 ? "this person" : "these people" }}.
                    </p>
                  </div>
                  <Button
                    v-if="retryPlan.memberIds.length"
                    size="sm"
                    variant="outline"
                    class="rounded-full"
                    :disabled="retrying"
                    data-testid="detail-retry-failed"
                    @click="handleRetryFailed"
                  >
                    <Icon name="lucide:rotate-cw" class="w-4 h-4 mr-1.5" />
                    Retry {{ retryPlan.memberIds.length }} failed
                  </Button>
                </div>
                <ul class="space-y-2">
                  <li
                    v-for="item in failureReasons"
                    :key="item.reason"
                    class="rounded-lg t-bg-subtle p-3 text-sm"
                  >
                    <p v-if="item.hint" class="font-medium">{{ item.hint }}</p>
                    <p class="t-text-secondary break-words" :class="item.hint ? 'text-xs mt-1' : ''">
                      <span v-if="failureReasons.length > 1 || item.count !== failedCount">{{ item.count }} × </span>{{ item.reason }}
                    </p>
                  </li>
                </ul>
                <p v-if="retryPlan.memberIds.length" class="text-xs t-text-muted">
                  Retry makes a draft addressed to just {{ retryPlan.memberIds.length === 1 ? "this person" : "these people" }}. Nothing is sent until you review it and press Send.
                </p>
              </CardContent>
            </Card>

            <!-- Email Content Preview -->
            <Card>
              <CardHeader class="pb-2">
                <CardTitle class="text-sm font-medium t-text-secondary">Email Preview</CardTitle>
              </CardHeader>
              <CardContent class="p-0">
                <div class="border rounded-lg overflow-hidden t-bg-subtle">
                  <div class="max-w-[600px] mx-auto bg-white">
                    <div class="p-4">
                      <p v-if="email.greeting" class="text-sm t-text-secondary italic mb-3">
                        {{ email.greeting }}
                      </p>
                      <div class="prose prose-sm prose-stone max-w-none email-content" v-html="email.content"></div>
                      <p v-if="email.salutation" class="text-sm t-text-secondary mt-4">
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
                    :key="attachmentKey(attachment)"
                    class="flex items-center gap-2 p-2 t-bg-subtle rounded text-sm"
                  >
                    <Icon name="lucide:file" class="w-4 h-4 t-text-muted" />
                    <span class="truncate flex-1">
                      {{ attachmentFile(attachment)?.filename_download || 'Attachment' }}
                    </span>
                    <span class="text-xs t-text-muted">
                      {{ formatFileSize(attachmentFile(attachment)?.filesize) }}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <!-- Send progress (the send queue) -->
            <Card v-if="isQueuedSend && sendProgress.progress.value" data-testid="detail-send-progress">
              <CardContent class="py-4">
                <CommunicationsSendProgress
                  :progress="sendProgress.progress.value"
                  :resuming="sendProgress.resuming.value"
                  :resume-error="sendProgress.resumeError.value"
                  @resume="sendProgress.resume()"
                />
              </CardContent>
            </Card>

            <!-- Resend to the unknown (after an hour with no SendGrid event) -->
            <Card v-if="resendPlan" data-testid="detail-resend-unknown">
              <CardContent class="py-4 flex flex-wrap items-center gap-3">
                <div class="min-w-0 flex-1 text-sm">
                  <p class="font-medium">
                    {{ resendPlan.memberIds.length + resendPlan.waiting }} unknown
                  </p>
                  <p class="t-text-secondary">
                    <template v-if="resendPlan.memberIds.length">
                      SendGrid hasn't reported on {{ resendPlan.memberIds.length === 1 ? "this person" : "these people" }} in over an hour, so the email most likely didn't reach them.
                    </template>
                    <template v-if="resendPlan.waiting">
                      {{ resendPlan.waiting }} {{ resendPlan.waiting === 1 ? "is" : "are" }} still within the hour SendGrid gets to report, until {{ resendReadyAt }}.
                    </template>
                  </p>
                </div>
                <Button
                  v-if="resendPlan.memberIds.length"
                  size="sm"
                  variant="outline"
                  class="rounded-full"
                  :disabled="resending"
                  @click="handleResendUnknown"
                >
                  <Icon name="lucide:mail-plus" class="w-4 h-4 mr-1.5" />
                  Resend to {{ resendPlan.memberIds.length }}
                </Button>
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
                  <AppDataTable
                    :columns="recipientColumns"
                    :rows="email.recipients"
                    sticky-header
                    empty-title="No recipients"
                    empty-description="This email has nobody on it yet."
                    empty-icon="lucide:users"
                  >
                    <template #cell-recipient_name="{ value }">{{ value || "—" }}</template>
                    <template #cell-recipient_email="{ value }">
                      <span class="t-text-secondary">{{ value }}</span>
                    </template>
                    <template #cell-status="{ value, row }">
                      <span
                        v-if="isQueuedSend"
                        class="inline-flex items-center px-1.5 py-0.5 text-xs font-medium rounded"
                        :class="chipFor(row).class"
                        :title="(row as any).error_message || undefined"
                        data-testid="recipient-chip"
                      >
                        {{ chipFor(row).label }}
                      </span>
                      <span
                        v-else
                        class="inline-flex items-center px-1.5 py-0.5 text-xs font-medium rounded capitalize"
                        :class="getRecipientStatusBadgeClass((value as string) || 'pending')"
                      >
                        {{ value || "pending" }}
                      </span>
                    </template>
                  </AppDataTable>
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
                <AppSegmentedControl
                  v-model="activeTab"
                  :items="tabItems"
                  size="sm"
                  fill
                  label="Email detail views"
                  class="mb-4"
                />

                <AppTabPanels :value="activeTab" :items="tabItems">

                  <!-- Activity List Tab -->
                  <div v-if="activeTab === 'activity'" class="mt-0">
                    <!-- Engagement Stats Row -->
                    <div
                      v-if="activityStats"
                      class="grid grid-cols-4 gap-2 mb-4"
                    >
                      <div class="text-center p-2 rounded-lg bg-blue-100 dark:bg-blue-500/15">
                        <p class="text-lg font-bold text-blue-700 dark:text-blue-200">{{ activityStats.uniqueOpens }}</p>
                        <p class="text-xs text-blue-700 dark:text-blue-200">Opens</p>
                      </div>
                      <div class="text-center p-2 rounded-lg bg-purple-100 dark:bg-purple-500/15">
                        <p class="text-lg font-bold text-purple-700 dark:text-purple-200">{{ activityStats.uniqueClicks }}</p>
                        <p class="text-xs text-purple-700 dark:text-purple-200">Clicks</p>
                      </div>
                      <div class="text-center p-2 rounded-lg bg-warning/15">
                        <p class="text-lg font-bold text-warning">{{ activityStats.bounces }}</p>
                        <p class="text-xs text-warning">Bounces</p>
                      </div>
                      <div class="text-center p-2 rounded-lg bg-destructive/15">
                        <p class="text-lg font-bold text-destructive">{{ activityStats.spamReports }}</p>
                        <p class="text-xs text-destructive">Spam</p>
                      </div>
                    </div>

                    <!-- Clicked URLs -->
                    <div v-if="clickedUrls.length > 0" class="mb-4">
                      <h4 class="text-sm font-medium t-text-secondary mb-2 flex items-center gap-2">
                        <Icon name="lucide:link" class="w-4 h-4" />
                        Top Links
                      </h4>
                      <div class="space-y-1">
                        <div
                          v-for="link in clickedUrls.slice(0, 5)"
                          :key="link.url"
                          class="flex items-center justify-between p-2 t-bg-subtle rounded text-sm"
                        >
                          <a
                            :href="link.url"
                            target="_blank"
                            class="text-primary hover:underline truncate max-w-[70%]"
                          >
                            {{ link.url }}
                          </a>
                          <span class="t-text-muted text-xs">{{ link.count }} clicks</span>
                        </div>
                      </div>
                    </div>

                    <!-- Activity Feed -->
                    <div>
                      <h4 class="text-sm font-medium t-text-secondary mb-2">Recent Activity</h4>
                      <div v-if="recentActivity.length > 0" class="space-y-1 max-h-[400px] overflow-y-auto">
                        <div
                          v-for="activity in recentActivity"
                          :key="activity.id"
                          class="flex items-center gap-2 p-2 hover:t-bg-subtle rounded"
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
                              <span v-if="activity.recipientName" class="t-text-muted">
                                - {{ activity.recipientName }}
                              </span>
                            </div>
                            <div v-if="activity.clickedUrl" class="text-xs text-primary truncate">
                              {{ activity.clickedUrl }}
                            </div>
                          </div>
                          <div class="text-xs t-text-muted flex-shrink-0">
                            {{ formatShortDate(activity.timestamp) }}
                          </div>
                        </div>
                      </div>
                      <div v-else class="text-center py-8 t-text-muted">
                        <Icon name="lucide:inbox" class="w-8 h-8 mx-auto mb-2" />
                        <p class="text-sm">No activity yet</p>
                      </div>
                    </div>
                  </div>

                  <!-- Charts Tab -->
                  <div v-if="activeTab === 'charts'" class="mt-0">
                    <!-- Delivery Chart -->
                    <div class="mb-6">
                      <h4 class="text-sm font-medium t-text-secondary mb-3">Delivery Status</h4>
                      <div v-if="deliveryChartData.length > 0" class="space-y-2">
                        <div
                          v-for="item in deliveryChartData"
                          :key="item.label"
                          class="flex items-center gap-3"
                        >
                          <div class="w-24 text-sm t-text-secondary">{{ item.label }}</div>
                          <div class="flex-1 h-6 t-bg-subtle rounded-full overflow-hidden">
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
                      <div v-else class="text-center py-4 t-text-muted text-sm">
                        No delivery data available
                      </div>
                    </div>

                    <!-- Engagement Chart -->
                    <div class="mb-6">
                      <h4 class="text-sm font-medium t-text-secondary mb-3">Engagement</h4>
                      <div v-if="engagementChartData.length > 0" class="space-y-2">
                        <div
                          v-for="item in engagementChartData"
                          :key="item.label"
                          class="flex items-center gap-3"
                        >
                          <div class="w-24 text-sm t-text-secondary">{{ item.label }}</div>
                          <div class="flex-1 h-6 t-bg-subtle rounded-full overflow-hidden">
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
                      <div v-else class="text-center py-4 t-text-muted text-sm">
                        No engagement data yet
                      </div>
                    </div>

                    <!-- Event Type Breakdown -->
                    <div>
                      <h4 class="text-sm font-medium t-text-secondary mb-3">Event Breakdown</h4>
                      <div v-if="eventTypeBreakdown.length > 0" class="space-y-2">
                        <div
                          v-for="item in eventTypeBreakdown"
                          :key="item.label"
                          class="flex items-center gap-3"
                        >
                          <div class="w-24 text-sm t-text-secondary truncate">{{ item.label }}</div>
                          <div class="flex-1 h-6 t-bg-subtle rounded-full overflow-hidden">
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
                      <div v-else class="text-center py-4 t-text-muted text-sm">
                        No events recorded
                      </div>
                    </div>

                    <!-- Rates Summary -->
                    <div v-if="activityStats && email.delivered_count" class="mt-6 grid grid-cols-2 gap-4">
                      <!-- These two rates measure the Opens and Clicks tiles above,
                           so they take the same two hues. They used to be cyan and
                           indigo, which tied them to nothing and put cyan — the
                           workspace accent — on something that is not an action. -->
                      <div class="text-center p-4 rounded-lg bg-blue-100 dark:bg-blue-500/15">
                        <p class="text-2xl font-bold text-blue-700 dark:text-blue-200">
                          {{ Math.round((activityStats.uniqueOpens / email.delivered_count) * 100) }}%
                        </p>
                        <p class="text-sm text-blue-700 dark:text-blue-200">Open Rate</p>
                      </div>
                      <div class="text-center p-4 rounded-lg bg-purple-100 dark:bg-purple-500/15">
                        <p class="text-2xl font-bold text-purple-700 dark:text-purple-200">
                          {{ activityStats.uniqueOpens ? Math.round((activityStats.uniqueClicks / activityStats.uniqueOpens) * 100) : 0 }}%
                        </p>
                        <p class="text-sm text-purple-700 dark:text-purple-200">Click-to-Open</p>
                      </div>
                    </div>
                  </div>
                </AppTabPanels>
              </CardContent>
            </Card>
          </div>
        </div>

        <!-- Delete Confirmation Dialog -->
        <Dialog v-model:open="showDeleteDialog">
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{{ email?.status === "draft" ? "Delete Draft" : "Remove Failed Email" }}</DialogTitle>
              <DialogDescription>
                <template v-if="email?.status === 'draft'">
                  Are you sure you want to delete this email draft? This action cannot be undone.
                </template>
                <template v-else>
                  This email reached nobody. Removing it takes it off the list for good, along with its failed recipient rows. This action cannot be undone.
                </template>
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" @click="showDeleteDialog = false">
                Cancel
              </Button>
              <Button variant="destructive" @click="handleDelete">
                {{ email?.status === 'draft' ? 'Delete' : 'Remove' }}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </PageContainer>
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
