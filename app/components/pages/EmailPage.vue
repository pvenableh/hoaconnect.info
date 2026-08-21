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
import type { HoaEmail } from "#core/types/directus";

const { navigateToOrg } = useOrgNavigation();
const emailSystem = useEmailSystem();

// Declared before the await: composables must not run after a top-level await.
const activeTab = useTabQuery({
  values: ["all", "sent", "scheduled", "drafts"],
  fallback: "all",
});

// Awaited so the org is loaded during SSR.
const { currentOrg, selectedOrgId, isLoading } = await useSelectedOrg();

// Computed organization from the composable
const organization = computed(() => currentOrg.value?.organization || null);
const orgId = computed(() => selectedOrgId.value);

// Pagination
const currentPage = ref(1);
const pageLimit = 20;

const tabItems = [
  { value: "all", label: "All", icon: "lucide:inbox" },
  { value: "sent", label: "Sent", icon: "lucide:send" },
  { value: "scheduled", label: "Scheduled", icon: "lucide:clock" },
  { value: "drafts", label: "Drafts", icon: "lucide:file-pen" },
];

// Columns: subject identifies the email and stays on a phone; the rest is
// context that drops away rather than pushing the table sideways.
const emailColumns = [
  { key: "subject", label: "Subject", sortable: true },
  { key: "email_type", label: "Type", hideOnMobile: true },
  { key: "status", label: "Status" },
  { key: "recipients", label: "Recipients", hideOnMobile: true },
  { key: "date", label: "Date", sortable: true, hideOnMobile: true, value: (r: any) => r.sent_at || r.date_created },
  { key: "actions", label: "Actions", align: "right" as const },
];

// Get status filter based on tab
const statusFilter = computed(() => {
  switch (activeTab.value) {
    case "sent":
      return "sent";
    case "scheduled":
      return "scheduled";
    case "drafts":
      return "draft";
    default:
      return undefined;
  }
});

// Fetch emails list
const {
  data: emailsData,
  refresh: refreshEmails,
  status: fetchStatus,
} = await useAsyncData(
  `hoa-emails-list-${orgId.value}-${activeTab.value}`,
  async () => {
    if (!orgId.value) return { emails: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } };

    try {
      return await emailSystem.listEmails(orgId.value, {
        status: statusFilter.value,
        page: currentPage.value,
        limit: pageLimit,
      });
    } catch (error) {
      console.error("Error fetching emails:", error);
      return { emails: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } };
    }
  },
  {
    watch: [orgId, activeTab, currentPage],
    server: false,
  }
);

const emails = computed(() => emailsData.value?.emails || []);
const pagination = computed(() => emailsData.value?.pagination || { page: 1, limit: 20, total: 0, totalPages: 0 });

// Delete confirmation
const showDeleteDialog = ref(false);
const emailToDelete = ref<string | null>(null);

const handleDelete = async () => {
  if (!emailToDelete.value) return;

  try {
    await emailSystem.deleteEmail(emailToDelete.value);
    toast.success("Email draft deleted");
    await refreshEmails();
  } catch (error: any) {
    toast.error(error.message || "Failed to delete email");
  } finally {
    showDeleteDialog.value = false;
    emailToDelete.value = null;
  }
};

const confirmDelete = (id: string) => {
  emailToDelete.value = id;
  showDeleteDialog.value = true;
};

// Navigation
const goToCompose = () => {
  navigateToOrg("/admin/communications/compose");
};

const goToActivity = () => {
  navigateToOrg("/admin/communications/activity");
};

const goToTemplates = () => {
  navigateToOrg("/admin/communications/templates");
};

const goToEmail = (id: string) => {
  navigateToOrg(`/admin/communications/${id}`);
};

const goToPage = (page: number) => {
  currentPage.value = page;
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

const getStatusBadgeClass = (status: string) => {
  const classes: Record<string, string> = {
    draft: "t-bg-subtle t-text-secondary",
    scheduled: "bg-info/15 text-info",
    sending: "bg-warning/15 text-warning",
    sent: "bg-success/15 text-success",
    failed: "bg-destructive/15 text-destructive",
  };
  return classes[status] || classes.draft;
};

const getEmailTypeBadgeClass = (type: string) => {
  const classes: Record<string, string> = {
    basic: "t-bg-subtle t-text-secondary",
    // CATEGORICAL — the hue names the kind of email, not how it went, so these
    // keep arbitrary hues. `alert` is red because alerts are red, not because
    // anything failed; it deliberately does NOT use the destructive token,
    // which on this page means "this send failed".
    alert: "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-200",
    newsletter: "bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-200",
    announcement: "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-200",
    reminder: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-200",
    notice: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200",
  };
  return classes[type] || classes.basic;
};

useSeoMeta({
  title: "Email Management",
  description: "Send and manage emails to your HOA members",
});
</script>

<template>
  <div class="min-h-screen t-bg">
    <PageContainer>
        <AppPageHeader
          eyebrow="Communications"
          title="Email"
          description="Alerts, newsletters, reminders, and notices for your members."
        >
          <template #actions>
            <Button variant="outline" @click="goToTemplates">
              <Icon name="lucide:layout-template" />
              Templates
            </Button>
            <Button variant="outline" @click="goToActivity">
              <Icon name="lucide:activity" />
              Activity
            </Button>
            <Button @click="goToCompose">
              <Icon name="lucide:plus" />
              Compose
            </Button>
          </template>
        </AppPageHeader>

        <!-- Loading State -->
        <div v-if="isLoading" class="flex flex-col items-center py-12 gap-3">
          <span class="spinner-ios" />
          <p class="type-meta">Loading your organization…</p>
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

        <!-- Main Content -->
        <div v-else class="space-y-6">
          <!-- Organization Info -->
          <Card>
            <CardHeader>
              <CardTitle>{{ organization.name }}</CardTitle>
              <CardDescription v-if="organization.street_address">
                {{ organization.street_address }}
              </CardDescription>
            </CardHeader>
          </Card>

          <!-- Quick Stats -->
          <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent class="pt-6">
                <div class="flex items-center gap-3">
                  <div class="p-2 bg-primary/15 rounded-lg">
                    <Icon name="lucide:mail" class="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p class="text-2xl font-bold">{{ pagination.total }}</p>
                    <p class="text-sm t-text-secondary">Total Emails</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent class="pt-6">
                <div class="flex items-center gap-3">
                  <div class="p-2 bg-success/15 rounded-lg">
                    <Icon name="lucide:check-circle" class="w-5 h-5 text-success" />
                  </div>
                  <div>
                    <p class="text-2xl font-bold">
                      {{ emails.filter((e: HoaEmail) => e.status === 'sent').length }}
                    </p>
                    <p class="text-sm t-text-secondary">Sent</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent class="pt-6">
                <div class="flex items-center gap-3">
                  <div class="p-2 t-bg-subtle rounded-lg">
                    <Icon name="lucide:file-edit" class="w-5 h-5 t-text-secondary" />
                  </div>
                  <div>
                    <p class="text-2xl font-bold">
                      {{ emails.filter((e: HoaEmail) => e.status === 'draft').length }}
                    </p>
                    <p class="text-sm t-text-secondary">Drafts</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent class="pt-6">
                <div class="flex items-center gap-3">
                  <div class="p-2 bg-destructive/15 rounded-lg">
                    <Icon name="lucide:alert-triangle" class="w-5 h-5 text-destructive" />
                  </div>
                  <div>
                    <p class="text-2xl font-bold">
                      {{ emails.filter((e: HoaEmail) => e.status === 'failed').length }}
                    </p>
                    <p class="text-sm t-text-secondary">Failed</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <AppSegmentedControl v-model="activeTab" :items="tabItems" label="Email views" />

          <!-- Emails List -->
          <Card>
            <CardContent class="pt-6">
              <!-- Loading — content-shaped skeleton -->
              <WidgetRowSkeleton v-if="fetchStatus === 'pending'" :rows="6" :avatar="false" />

              <AppDataTable
                v-else-if="emails.length"
                :columns="emailColumns"
                :rows="emails"
                @row-click="(row) => goToEmail(row.id)"
              >
                <template #cell-subject="{ row }">
                  <span class="font-medium t-text">{{ row.subject }}</span>
                </template>
                <template #cell-email_type="{ value }">
                  <span
                    class="inline-flex items-center px-2 py-1 text-xs font-medium rounded-full capitalize"
                    :class="getEmailTypeBadgeClass(value)"
                  >
                    {{ value }}
                  </span>
                </template>
                <template #cell-status="{ row }">
                  <span
                    class="inline-flex items-center px-2 py-1 text-xs font-medium rounded-full capitalize"
                    :class="getStatusBadgeClass(row.status || 'draft')"
                  >
                    {{ row.status || 'draft' }}
                  </span>
                </template>
                <template #cell-recipients="{ row }">
                  <template v-if="row.status === 'sent' || row.status === 'failed'">
                    <span class="text-success">{{ row.delivered_count || 0 }}</span>
                    <span class="t-text-muted">/</span>
                    <span>{{ row.recipient_count || 0 }}</span>
                    <span v-if="row.failed_count" class="text-destructive ml-1">
                      ({{ row.failed_count }} failed)
                    </span>
                  </template>
                  <span v-else class="t-text-muted">—</span>
                </template>
                <template #cell-date="{ value }">
                  <span class="t-text-secondary">{{ formatDate(value) }}</span>
                </template>
                <template #cell-actions="{ row }">
                  <div class="flex justify-end gap-2" @click.stop>
                    <Button
                      variant="outline"
                      size="icon-sm"
                      aria-label="View email"
                      @click="goToEmail(row.id)"
                    >
                      <Icon name="lucide:eye" />
                    </Button>
                    <Button
                      v-if="row.status === 'draft'"
                      variant="destructive"
                      size="icon-sm"
                      aria-label="Delete draft"
                      @click="confirmDelete(row.id)"
                    >
                      <Icon name="lucide:trash-2" />
                    </Button>
                  </div>
                </template>
              </AppDataTable>

              <AppEmptyState
                v-else
                icon="lucide:mail"
                :title="activeTab === 'all' ? 'No emails yet' : `Nothing in ${activeTab}`"
                :description="
                  activeTab === 'all'
                    ? 'Write your first email to reach everyone in the community.'
                    : 'Emails appear here once they reach this state.'
                "
              >
                <Button @click="goToCompose">
                  <Icon name="lucide:plus" />
                  Compose an email
                </Button>
              </AppEmptyState>

              <!-- Pagination -->
              <div
                v-if="pagination.totalPages > 1"
                class="flex justify-between items-center mt-6 pt-4 border-t"
              >
                <p class="text-sm t-text-secondary">
                  Showing {{ (pagination.page - 1) * pagination.limit + 1 }} to
                  {{ Math.min(pagination.page * pagination.limit, pagination.total) }} of
                  {{ pagination.total }} emails
                </p>
                <div class="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    :disabled="pagination.page <= 1"
                    @click="goToPage(pagination.page - 1)"
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    :disabled="pagination.page >= pagination.totalPages"
                    @click="goToPage(pagination.page + 1)"
                  >
                    Next
                  </Button>
                </div>
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
      </PageContainer>
  </div>
</template>
