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
                <div class="whitespace-pre-wrap">{{ email.content }}</div>
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
