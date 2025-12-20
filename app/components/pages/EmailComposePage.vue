<script setup lang="ts">
import { toast } from "vue-sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { HoaMember } from "~~/types/directus";

const props = defineProps<{
  emailId?: string;
}>();

const { navigateToOrg } = useOrgNavigation();
const emailSystem = useEmailSystem();
const { list: listMembers } = useDirectusItems("hoa_members");

// Await to ensure org is loaded during SSR
const { currentOrg, selectedOrgId, isLoading } = await useSelectedOrg();

// Computed organization from the composable
const organization = computed(() => currentOrg.value?.organization || null);
const orgId = computed(() => selectedOrgId.value);

// Form state
const form = reactive({
  subject: "",
  content: "",
  emailType: "basic" as "basic" | "newsletter" | "announcement" | "reminder" | "notice",
  salutation: "",
  includeBoardFooter: true,
  recipientIds: [] as string[],
});

// Selection mode
const selectionMode = ref<"all" | "selected">("all");

// Fetch members for recipient selection
const { data: members } = await useAsyncData(
  `email-members-${orgId.value}`,
  async () => {
    if (!orgId.value) return [];

    try {
      const result = (await listMembers({
        fields: ["id", "first_name", "last_name", "email", "status"],
        filter: {
          organization: { _eq: orgId.value },
          status: { _eq: "active" },
          email: { _nnull: true },
        },
        sort: ["last_name", "first_name"],
      })) as HoaMember[];

      return result || [];
    } catch (error) {
      console.error("Error fetching members:", error);
      return [];
    }
  },
  {
    watch: [orgId],
    server: false,
  }
);

// Load existing email if editing
const { data: existingEmail } = await useAsyncData(
  `email-edit-${props.emailId}`,
  async () => {
    if (!props.emailId) return null;

    try {
      const result = await emailSystem.getEmail(props.emailId);
      return result.email;
    } catch (error) {
      console.error("Error loading email:", error);
      return null;
    }
  },
  {
    immediate: !!props.emailId,
  }
);

// Populate form if editing
watch(existingEmail, (email) => {
  if (email) {
    form.subject = email.subject || "";
    form.content = email.content || "";
    form.emailType = email.email_type || "basic";
    form.salutation = email.salutation || "";
    form.includeBoardFooter = email.include_board_footer ?? true;
    // Note: Recipients would need to be loaded separately for editing
  }
}, { immediate: true });

// Computed recipients based on selection mode
const selectedRecipients = computed(() => {
  if (selectionMode.value === "all") {
    return members.value || [];
  }
  return (members.value || []).filter((m) => form.recipientIds.includes(m.id));
});

const recipientCount = computed(() => selectedRecipients.value.length);

// Toggle member selection
const toggleMember = (id: string) => {
  const index = form.recipientIds.indexOf(id);
  if (index > -1) {
    form.recipientIds.splice(index, 1);
  } else {
    form.recipientIds.push(id);
  }
};

const selectAll = () => {
  form.recipientIds = (members.value || []).map((m) => m.id);
};

const deselectAll = () => {
  form.recipientIds = [];
};

// Preview modal
const showPreview = ref(false);
const previewHtml = ref("");
const previewLoading = ref(false);

const handlePreview = async () => {
  if (!orgId.value) return;

  previewLoading.value = true;
  try {
    const result = await emailSystem.previewEmail({
      organizationId: orgId.value,
      subject: form.subject,
      content: form.content,
      emailType: form.emailType,
      salutation: form.salutation || undefined,
      includeBoardFooter: form.includeBoardFooter,
      recipientName: "John Doe",
    });
    previewHtml.value = result.html;
    showPreview.value = true;
  } catch (error: any) {
    toast.error(error.message || "Failed to generate preview");
  } finally {
    previewLoading.value = false;
  }
};

// Save draft
const handleSaveDraft = async () => {
  if (!orgId.value || !form.subject || !form.content) {
    toast.error("Please fill in subject and content");
    return;
  }

  try {
    await emailSystem.saveDraft({
      emailId: props.emailId,
      organizationId: orgId.value,
      subject: form.subject,
      content: form.content,
      emailType: form.emailType,
      salutation: form.salutation || undefined,
      includeBoardFooter: form.includeBoardFooter,
      status: "draft",
    });
    toast.success("Draft saved");
    navigateToOrg("/admin/email");
  } catch (error: any) {
    toast.error(error.message || "Failed to save draft");
  }
};

// Send email
const handleSend = async () => {
  if (!orgId.value || !form.subject || !form.content) {
    toast.error("Please fill in subject and content");
    return;
  }

  const recipientIds = selectionMode.value === "all"
    ? (members.value || []).map((m) => m.id)
    : form.recipientIds;

  if (recipientIds.length === 0) {
    toast.error("Please select at least one recipient");
    return;
  }

  try {
    const result = await emailSystem.sendEmail({
      organizationId: orgId.value,
      subject: form.subject,
      content: form.content,
      emailType: form.emailType,
      salutation: form.salutation || undefined,
      includeBoardFooter: form.includeBoardFooter,
      recipientIds,
      emailId: props.emailId,
    });

    if (result.stats.failed > 0) {
      toast.warning(
        `Email sent with ${result.stats.failed} failures. ${result.stats.delivered}/${result.stats.total} delivered.`
      );
    } else {
      toast.success(`Email sent to ${result.stats.delivered} recipients`);
    }

    navigateToOrg("/admin/email");
  } catch (error: any) {
    toast.error(error.message || "Failed to send email");
  }
};

// Cancel
const handleCancel = () => {
  navigateToOrg("/admin/email");
};

useSeoMeta({
  title: props.emailId ? "Edit Email" : "Compose Email",
  description: "Create and send emails to your HOA members",
});
</script>

<template>
  <div class="min-h-screen bg-stone-50">
    <div class="p-6">
      <div class="max-w-5xl mx-auto">
        <!-- Header -->
        <div class="mb-8">
          <Button variant="ghost" size="sm" @click="handleCancel" class="mb-4">
            <Icon name="lucide:arrow-left" class="w-4 h-4 mr-2" />
            Back to Emails
          </Button>
          <h1 class="text-3xl font-bold mb-2">
            {{ props.emailId ? "Edit Email" : "Compose Email" }}
          </h1>
          <p class="text-stone-600">
            Create and send emails to your HOA members
          </p>
        </div>

        <!-- Loading State -->
        <div v-if="isLoading" class="text-center py-12">
          <Icon
            name="lucide:loader-2"
            class="w-8 h-8 animate-spin mx-auto mb-4"
          />
          <p class="text-sm text-stone-600">Loading...</p>
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

        <!-- Main Form -->
        <div v-else class="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <!-- Email Content (Left) -->
          <div class="lg:col-span-2 space-y-6">
            <!-- Email Type -->
            <Card>
              <CardHeader>
                <CardTitle>Email Type</CardTitle>
                <CardDescription>
                  Select the type of email to customize its appearance
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div class="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  <button
                    v-for="option in emailSystem.emailTypeOptions"
                    :key="option.value"
                    @click="form.emailType = option.value"
                    :class="[
                      'p-3 rounded-lg border-2 text-center transition-all',
                      form.emailType === option.value
                        ? 'border-primary bg-primary/5'
                        : 'border-stone-200 hover:border-stone-300',
                    ]"
                  >
                    <Icon :name="option.icon" class="w-5 h-5 mx-auto mb-1" />
                    <div class="text-xs font-medium">{{ option.label }}</div>
                  </button>
                </div>
              </CardContent>
            </Card>

            <!-- Subject & Content -->
            <Card>
              <CardHeader>
                <CardTitle>Email Content</CardTitle>
              </CardHeader>
              <CardContent class="space-y-4">
                <div class="space-y-2">
                  <Label for="subject">Subject *</Label>
                  <Input
                    id="subject"
                    v-model="form.subject"
                    placeholder="Enter email subject..."
                    class="text-lg"
                  />
                </div>

                <div class="space-y-2">
                  <Label for="content">Message *</Label>
                  <Textarea
                    id="content"
                    v-model="form.content"
                    placeholder="Write your email message here...

You can use **bold** and *italic* formatting."
                    rows="12"
                    class="font-mono text-sm"
                  />
                  <p class="text-xs text-stone-500">
                    Tip: Use **text** for bold and *text* for italic
                  </p>
                </div>
              </CardContent>
            </Card>

            <!-- Footer Options -->
            <Card>
              <CardHeader>
                <CardTitle>Footer Options</CardTitle>
              </CardHeader>
              <CardContent class="space-y-4">
                <div class="space-y-2">
                  <Label for="salutation">Custom Salutation</Label>
                  <Input
                    id="salutation"
                    v-model="form.salutation"
                    :placeholder="emailSystem.defaultSalutations[form.emailType]"
                  />
                  <p class="text-xs text-stone-500">
                    Leave empty to use default: "{{ emailSystem.defaultSalutations[form.emailType] }}"
                  </p>
                </div>

                <div class="flex items-center gap-3">
                  <Switch
                    id="include-board"
                    v-model:checked="form.includeBoardFooter"
                  />
                  <Label for="include-board" class="cursor-pointer">
                    Include board members in footer
                  </Label>
                </div>
              </CardContent>
            </Card>
          </div>

          <!-- Recipients (Right) -->
          <div class="space-y-6">
            <!-- Recipients Card -->
            <Card>
              <CardHeader>
                <CardTitle>Recipients</CardTitle>
                <CardDescription>
                  {{ recipientCount }} member{{ recipientCount !== 1 ? 's' : '' }} selected
                </CardDescription>
              </CardHeader>
              <CardContent class="space-y-4">
                <!-- Selection Mode -->
                <div class="space-y-3">
                  <div class="flex items-center gap-3">
                    <input
                      type="radio"
                      id="all-members"
                      v-model="selectionMode"
                      value="all"
                      class="w-4 h-4"
                    />
                    <Label for="all-members" class="cursor-pointer">
                      All members ({{ members?.length || 0 }})
                    </Label>
                  </div>
                  <div class="flex items-center gap-3">
                    <input
                      type="radio"
                      id="selected-members"
                      v-model="selectionMode"
                      value="selected"
                      class="w-4 h-4"
                    />
                    <Label for="selected-members" class="cursor-pointer">
                      Select specific members
                    </Label>
                  </div>
                </div>

                <!-- Member Selection List -->
                <div
                  v-if="selectionMode === 'selected'"
                  class="border rounded-lg max-h-80 overflow-y-auto"
                >
                  <div class="p-2 border-b bg-stone-50 flex justify-between items-center sticky top-0">
                    <span class="text-sm text-stone-600">
                      {{ form.recipientIds.length }} selected
                    </span>
                    <div class="flex gap-2">
                      <Button variant="ghost" size="sm" @click="selectAll">
                        All
                      </Button>
                      <Button variant="ghost" size="sm" @click="deselectAll">
                        None
                      </Button>
                    </div>
                  </div>
                  <div
                    v-for="member in members"
                    :key="member.id"
                    @click="toggleMember(member.id)"
                    :class="[
                      'p-3 border-b last:border-b-0 cursor-pointer hover:bg-stone-50 flex items-center gap-3',
                      form.recipientIds.includes(member.id) ? 'bg-primary/5' : '',
                    ]"
                  >
                    <Checkbox
                      :checked="form.recipientIds.includes(member.id)"
                      @click.stop="toggleMember(member.id)"
                    />
                    <div class="flex-1 min-w-0">
                      <div class="font-medium truncate">
                        {{ member.first_name }} {{ member.last_name }}
                      </div>
                      <div class="text-xs text-stone-500 truncate">
                        {{ member.email }}
                      </div>
                    </div>
                  </div>
                  <div
                    v-if="!members?.length"
                    class="p-4 text-center text-stone-500 text-sm"
                  >
                    No members with email addresses found
                  </div>
                </div>
              </CardContent>
            </Card>

            <!-- Actions -->
            <Card>
              <CardContent class="pt-6 space-y-3">
                <Button
                  class="w-full"
                  size="lg"
                  @click="handleSend"
                  :disabled="emailSystem.isSending.value || recipientCount === 0"
                >
                  <Icon
                    v-if="emailSystem.isSending.value"
                    name="lucide:loader-2"
                    class="w-5 h-5 mr-2 animate-spin"
                  />
                  <Icon v-else name="lucide:send" class="w-5 h-5 mr-2" />
                  Send to {{ recipientCount }} member{{ recipientCount !== 1 ? 's' : '' }}
                </Button>

                <div class="grid grid-cols-2 gap-3">
                  <Button
                    variant="outline"
                    @click="handlePreview"
                    :disabled="previewLoading || !form.subject || !form.content"
                  >
                    <Icon
                      v-if="previewLoading"
                      name="lucide:loader-2"
                      class="w-4 h-4 mr-2 animate-spin"
                    />
                    <Icon v-else name="lucide:eye" class="w-4 h-4 mr-2" />
                    Preview
                  </Button>
                  <Button
                    variant="outline"
                    @click="handleSaveDraft"
                    :disabled="emailSystem.isLoading.value"
                  >
                    <Icon name="lucide:save" class="w-4 h-4 mr-2" />
                    Save Draft
                  </Button>
                </div>

                <Button variant="ghost" class="w-full" @click="handleCancel">
                  Cancel
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>

        <!-- Preview Modal -->
        <Dialog v-model:open="showPreview">
          <DialogContent class="max-w-4xl max-h-[90vh] overflow-hidden">
            <DialogHeader>
              <DialogTitle>Email Preview</DialogTitle>
              <DialogDescription>
                This is how your email will appear to recipients
              </DialogDescription>
            </DialogHeader>
            <div class="overflow-auto max-h-[70vh] border rounded-lg bg-stone-100 p-4">
              <div class="bg-white rounded shadow-sm" v-html="previewHtml"></div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  </div>
</template>
