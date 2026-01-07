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
import type { HoaEmail } from "~~/types/directus";

const { navigateToOrg } = useOrgNavigation();
const emailSystem = useEmailSystem();

// Await to ensure org is loaded during SSR
const { currentOrg, selectedOrgId, isLoading } = await useSelectedOrg();

// Current tab
const activeTab = ref<"all" | "sent" | "drafts">("all");

// Computed organization from the composable
const organization = computed(() => currentOrg.value?.organization || null);
const orgId = computed(() => selectedOrgId.value);

// Pagination
const currentPage = ref(1);
const pageLimit = 20;

// Get status filter based on tab
const statusFilter = computed(() => {
  switch (activeTab.value) {
    case "sent":
      return "sent";
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
  navigateToOrg("/admin/email/compose");
};

const goToActivity = () => {
  navigateToOrg("/admin/email/activity");
};

const goToEmail = (id: string) => {
  navigateToOrg(`/admin/email/${id}`);
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
    scheduled: "bg-blue-100 text-blue-700",
    sending: "bg-yellow-100 text-yellow-700",
    sent: "bg-green-100 text-green-700",
    failed: "bg-red-100 text-red-700",
  };
  return classes[status] || classes.draft;
};

const getEmailTypeBadgeClass = (type: string) => {
  const classes: Record<string, string> = {
    basic: "t-bg-subtle t-text-secondary",
    newsletter: "bg-sky-100 text-sky-700",
    announcement: "bg-orange-100 text-orange-700",
    reminder: "bg-amber-100 text-amber-700",
    notice: "bg-emerald-100 text-emerald-700",
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
    <div class="p-6">
      <div class="max-w-7xl mx-auto">
        <div class="mb-8 flex justify-between items-start">
          <div>
            <h1 class="text-3xl font-bold mb-2">Email Management</h1>
            <p class="t-text-secondary">
              Send emails to your HOA members individually or in bulk
            </p>
          </div>
          <div class="flex gap-3">
            <Button @click="goToActivity" variant="outline" size="lg">
              <Icon name="lucide:activity" class="w-5 h-5 mr-2" />
              Email Activity
            </Button>
            <Button @click="goToCompose" size="lg">
              <Icon name="lucide:plus" class="w-5 h-5 mr-2" />
              Compose Email
            </Button>
          </div>
        </div>

        <!-- Loading State -->
        <div v-if="isLoading" class="text-center py-12">
          <Icon
            name="lucide:loader-2"
            class="w-8 h-8 animate-spin mx-auto mb-4"
          />
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
                  <div class="p-2 bg-blue-100 rounded-lg">
                    <Icon name="lucide:mail" class="w-5 h-5 text-blue-600" />
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
                  <div class="p-2 bg-green-100 rounded-lg">
                    <Icon name="lucide:check-circle" class="w-5 h-5 text-green-600" />
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
                  <div class="p-2 bg-red-100 rounded-lg">
                    <Icon name="lucide:alert-triangle" class="w-5 h-5 text-red-600" />
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

          <!-- Tabs -->
          <div class="border-b t-border">
            <nav class="flex space-x-8">
              <button
                @click="activeTab = 'all'"
                :class="[
                  'py-4 px-1 border-b-2 font-medium text-sm transition-colors',
                  activeTab === 'all'
                    ? 'border-primary text-primary'
                    : 'border-transparent t-text-secondary hover:t-text hover:border-muted',
                ]"
              >
                All Emails
              </button>
              <button
                @click="activeTab = 'sent'"
                :class="[
                  'py-4 px-1 border-b-2 font-medium text-sm transition-colors',
                  activeTab === 'sent'
                    ? 'border-primary text-primary'
                    : 'border-transparent t-text-secondary hover:t-text hover:border-muted',
                ]"
              >
                Sent
              </button>
              <button
                @click="activeTab = 'drafts'"
                :class="[
                  'py-4 px-1 border-b-2 font-medium text-sm transition-colors',
                  activeTab === 'drafts'
                    ? 'border-primary text-primary'
                    : 'border-transparent t-text-secondary hover:t-text hover:border-muted',
                ]"
              >
                Drafts
              </button>
            </nav>
          </div>

          <!-- Emails List -->
          <Card>
            <CardContent class="pt-6">
              <!-- Loading -->
              <div v-if="fetchStatus === 'pending'" class="text-center py-8">
                <Icon name="lucide:loader-2" class="w-6 h-6 animate-spin mx-auto mb-2" />
                <p class="text-sm t-text-muted">Loading emails...</p>
              </div>

              <!-- Emails Table -->
              <div v-else-if="emails.length" class="overflow-x-auto">
                <table class="w-full">
                  <thead>
                    <tr class="border-b">
                      <th class="text-left p-3">Subject</th>
                      <th class="text-left p-3">Type</th>
                      <th class="text-left p-3">Status</th>
                      <th class="text-left p-3">Recipients</th>
                      <th class="text-left p-3">Date</th>
                      <th class="text-right p-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="email in emails"
                      :key="email.id"
                      class="border-b hover:t-bg-subtle cursor-pointer"
                      @click="goToEmail(email.id)"
                    >
                      <td class="p-3">
                        <div class="font-medium">{{ email.subject }}</div>
                      </td>
                      <td class="p-3">
                        <span
                          class="inline-flex items-center px-2 py-1 text-xs font-medium rounded-full capitalize"
                          :class="getEmailTypeBadgeClass(email.email_type)"
                        >
                          {{ email.email_type }}
                        </span>
                      </td>
                      <td class="p-3">
                        <span
                          class="inline-flex items-center px-2 py-1 text-xs font-medium rounded-full capitalize"
                          :class="getStatusBadgeClass(email.status || 'draft')"
                        >
                          {{ email.status || 'draft' }}
                        </span>
                      </td>
                      <td class="p-3">
                        <div v-if="email.status === 'sent' || email.status === 'failed'">
                          <span class="text-green-600">{{ email.delivered_count || 0 }}</span>
                          <span class="t-text-muted">/</span>
                          <span>{{ email.recipient_count || 0 }}</span>
                          <span v-if="email.failed_count" class="text-red-500 ml-1">
                            ({{ email.failed_count }} failed)
                          </span>
                        </div>
                        <span v-else class="t-text-muted">—</span>
                      </td>
                      <td class="p-3 t-text-secondary">
                        {{ formatDate(email.sent_at || email.date_created) }}
                      </td>
                      <td class="p-3 text-right" @click.stop>
                        <div class="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            @click="goToEmail(email.id)"
                          >
                            <Icon name="lucide:eye" class="w-4 h-4" />
                          </Button>
                          <Button
                            v-if="email.status === 'draft'"
                            variant="destructive"
                            size="sm"
                            @click="confirmDelete(email.id)"
                          >
                            <Icon name="lucide:trash-2" class="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <!-- Empty State -->
              <div v-else class="text-center py-12 t-text-muted">
                <Icon
                  name="lucide:mail"
                  class="w-12 h-12 mx-auto mb-4 t-text-muted"
                />
                <p class="font-medium">No emails yet</p>
                <p class="text-sm mt-1">
                  Create your first email to communicate with your members
                </p>
                <Button @click="goToCompose" class="mt-4">
                  <Icon name="lucide:plus" class="w-4 h-4 mr-2" />
                  Compose Email
                </Button>
              </div>

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
      </div>
    </div>
  </div>
</template>
