<script setup lang="ts">
import { toast } from "vue-sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import type { HoaMember, DirectusFile, DirectusFolder } from "~~/types/directus";

const props = defineProps<{
  emailId?: string;
}>();

const { navigateToOrg } = useOrgNavigation();
const emailSystem = useEmailSystem();
const { list: listMembers } = useDirectusItems("hoa_members");
const filesComposable = useDirectusFiles();
const foldersComposable = useDirectusFolders();

// Await to ensure org is loaded during SSR
const { currentOrg, selectedOrgId, isLoading } = await useSelectedOrg();

// Computed organization from the composable
const organization = computed(() => currentOrg.value?.organization || null);
const orgId = computed(() => selectedOrgId.value);

// Get organization folder ID for file uploads
const orgFolderId = computed(() => {
  const folder = organization.value?.folder;
  if (!folder) return null;
  return typeof folder === "string" ? folder : folder.id;
});

// Form state
const form = reactive({
  subject: "",
  content: "",
  emailType: "basic" as
    | "basic"
    | "newsletter"
    | "announcement"
    | "reminder"
    | "notice",
  greeting: "",
  salutation: "",
  includeBoardFooter: true,
  recipientIds: [] as string[],
  attachmentIds: [] as string[],
});

// Attachment state
interface AttachmentInfo {
  id: string;
  filename: string;
  type: string;
  size: number;
}
const selectedAttachments = ref<AttachmentInfo[]>([]);
const showAttachmentBrowser = ref(false);
const attachmentFiles = ref<DirectusFile[]>([]);
const attachmentFolders = ref<DirectusFolder[]>([]);
const currentAttachmentFolder = ref<string | null>(null);
const attachmentFolderPath = ref<{ id: string | null; name: string }[]>([]);
const isLoadingAttachments = ref(false);
const attachmentSearchQuery = ref("");
const attachmentFileInput = ref<HTMLInputElement | null>(null);
const isUploadingAttachment = ref(false);

// Selection mode and filter type
const selectionMode = ref<"all" | "selected">("all");
const recipientFilter = ref<"all" | "owners" | "tenants">("all");

// Recipient filter options
const recipientFilterOptions = [
  { value: "all", label: "All Members", icon: "lucide:users" },
  { value: "owners", label: "Owners Only", icon: "lucide:home" },
  { value: "tenants", label: "Tenants Only", icon: "lucide:key" },
] as const;

// Fetch all members for recipient selection
const { data: allMembers } = await useAsyncData(
  `email-members-${orgId.value}`,
  async () => {
    if (!orgId.value) return [];

    try {
      const result = (await listMembers({
        fields: [
          "id",
          "first_name",
          "last_name",
          "email",
          "status",
          "member_type",
        ],
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

// Filter members based on recipient filter
const members = computed(() => {
  const allMembersList = allMembers.value || [];
  if (recipientFilter.value === "all") {
    return allMembersList;
  }
  return allMembersList.filter(
    (m) => m.member_type === recipientFilter.value.slice(0, -1)
  ); // "owners" -> "owner"
});

// Computed label for recipient type (fixes template parsing issue)
const recipientTypeLabel = computed(() => {
  return recipientFilter.value === "all" ? "members" : recipientFilter.value;
});

// Count members by type for display
const memberCounts = computed(() => {
  const all = allMembers.value || [];
  return {
    all: all.length,
    owners: all.filter((m) => m.member_type === "owner").length,
    tenants: all.filter((m) => m.member_type === "tenant").length,
  };
});

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
watch(
  existingEmail,
  async (email) => {
    if (email) {
      form.subject = email.subject || "";
      form.content = email.content || "";
      form.emailType = email.email_type || "basic";
      form.greeting = email.greeting || "";
      form.salutation = email.salutation || "";
      form.includeBoardFooter = email.include_board_footer ?? true;

      // Load attachments if they exist
      if (email.attachments && Array.isArray(email.attachments) && email.attachments.length > 0) {
        form.attachmentIds = email.attachments;
        // Fetch attachment details from Directus
        try {
          const attachmentDetails = await filesComposable.getMany(email.attachments as string[], {
            fields: ["id", "title", "filename_download", "type", "filesize"],
          });
          if (attachmentDetails && Array.isArray(attachmentDetails)) {
            selectedAttachments.value = (attachmentDetails as DirectusFile[]).map((file) => ({
              id: file.id,
              filename: file.filename_download || file.title || "attachment",
              type: file.type || "application/octet-stream",
              size: file.filesize || 0,
            }));
          }
        } catch (err) {
          console.error("Failed to load attachment details:", err);
        }
      }
      // Note: Recipients would need to be loaded separately for editing
    }
  },
  { immediate: true }
);

// Computed recipients based on selection mode
const selectedRecipients = computed(() => {
  if (selectionMode.value === "all") {
    return members.value;
  }
  return members.value.filter((m) => form.recipientIds.includes(m.id));
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
  form.recipientIds = members.value.map((m) => m.id);
};

const deselectAll = () => {
  form.recipientIds = [];
};

// Preview modal
const showPreview = ref(false);
const previewHtml = ref("");
const previewLoading = ref(false);

// Preview state for attachments
const previewAttachments = ref<{ id: string; filename: string; type: string; size: number }[]>([]);

const handlePreview = async () => {
  if (!orgId.value) return;

  previewLoading.value = true;
  try {
    const result = await emailSystem.previewEmail({
      organizationId: orgId.value,
      subject: form.subject,
      content: form.content,
      emailType: form.emailType,
      greeting: form.greeting || undefined,
      salutation: form.salutation || undefined,
      includeBoardFooter: form.includeBoardFooter,
      attachmentIds: form.attachmentIds.length > 0 ? form.attachmentIds : undefined,
    });
    previewHtml.value = result.html;
    previewAttachments.value = result.attachments || [];
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
    const result = await emailSystem.saveDraft({
      emailId: props.emailId,
      organizationId: orgId.value,
      subject: form.subject,
      content: form.content,
      emailType: form.emailType,
      greeting: form.greeting || undefined,
      salutation: form.salutation || undefined,
      includeBoardFooter: form.includeBoardFooter,
      status: "draft",
      attachmentIds: form.attachmentIds.length > 0 ? form.attachmentIds : undefined,
    });
    toast.success("Draft saved");
    navigateToOrg("/admin/email");
    return result;
  } catch (error: any) {
    toast.error(error.message || "Failed to save draft");
    throw error;
  }
};

// Send email
const handleSend = async () => {
  if (!orgId.value || !form.subject || !form.content) {
    toast.error("Please fill in subject and content");
    return;
  }

  const recipientIds =
    selectionMode.value === "all"
      ? members.value.map((m) => m.id)
      : form.recipientIds;

  if (recipientIds.length === 0) {
    toast.error("Please select at least one recipient");
    return;
  }

  try {
    // For new emails, save first to create the record, then send
    let emailId = props.emailId;

    if (!emailId) {
      // Save as draft first to get an emailId
      const saveResult = await emailSystem.saveDraft({
        organizationId: orgId.value,
        subject: form.subject,
        content: form.content,
        emailType: form.emailType,
        greeting: form.greeting || undefined,
        salutation: form.salutation || undefined,
        includeBoardFooter: form.includeBoardFooter,
        status: "draft",
        attachmentIds: form.attachmentIds.length > 0 ? form.attachmentIds : undefined,
      });
      emailId = saveResult.email.id;
    }

    const result = await emailSystem.sendEmail({
      organizationId: orgId.value,
      subject: form.subject,
      content: form.content,
      emailType: form.emailType,
      greeting: form.greeting || undefined,
      salutation: form.salutation || undefined,
      includeBoardFooter: form.includeBoardFooter,
      recipientIds,
      emailId,
      attachmentIds: form.attachmentIds.length > 0 ? form.attachmentIds : undefined,
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

// Attachment functions
const openAttachmentBrowser = async () => {
  showAttachmentBrowser.value = true;
  currentAttachmentFolder.value = orgFolderId.value || null;
  attachmentFolderPath.value = [{ id: orgFolderId.value || null, name: "Organization Files" }];
  await loadAttachmentFilesAndFolders();
};

const loadAttachmentFilesAndFolders = async () => {
  isLoadingAttachments.value = true;
  try {
    const filesResult = await filesComposable.listByFolder(
      currentAttachmentFolder.value,
      {
        fields: ["id", "title", "filename_download", "type", "filesize"],
        sort: ["-created_on"],
        limit: 100,
      }
    );
    attachmentFiles.value = (filesResult as DirectusFile[]) || [];

    const foldersResult = await foldersComposable.getByParent(
      currentAttachmentFolder.value
    );
    attachmentFolders.value = (foldersResult as DirectusFolder[]) || [];
  } catch (error) {
    console.error("Failed to load files:", error);
  } finally {
    isLoadingAttachments.value = false;
  }
};

const navigateToAttachmentFolder = async (
  folderId: string | null,
  folderName: string
) => {
  currentAttachmentFolder.value = folderId;

  const existingIndex = attachmentFolderPath.value.findIndex((f) => f.id === folderId);
  if (existingIndex >= 0) {
    attachmentFolderPath.value = attachmentFolderPath.value.slice(0, existingIndex + 1);
  } else {
    attachmentFolderPath.value.push({ id: folderId, name: folderName });
  }

  await loadAttachmentFilesAndFolders();
};

const selectAttachmentFile = (file: DirectusFile) => {
  if (!file.id) return;

  // Check if already attached
  if (form.attachmentIds.includes(file.id)) {
    toast.info("File already attached");
    return;
  }

  form.attachmentIds.push(file.id);
  selectedAttachments.value.push({
    id: file.id,
    filename: file.filename_download || file.title || "attachment",
    type: file.type || "application/octet-stream",
    size: file.filesize || 0,
  });

  showAttachmentBrowser.value = false;
  toast.success("Attachment added");
};

const removeAttachment = (id: string) => {
  const index = form.attachmentIds.indexOf(id);
  if (index > -1) {
    form.attachmentIds.splice(index, 1);
    selectedAttachments.value = selectedAttachments.value.filter((a) => a.id !== id);
  }
};

const triggerAttachmentUpload = () => {
  attachmentFileInput.value?.click();
};

const handleAttachmentUpload = async (event: Event) => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];

  if (!file) return;

  isUploadingAttachment.value = true;

  try {
    const result = await filesComposable.upload(file, {
      title: file.name,
      folder: orgFolderId.value || undefined,
    });

    if (result && typeof result === "object" && "id" in result) {
      const uploadedFile = result as DirectusFile;
      form.attachmentIds.push(uploadedFile.id);
      selectedAttachments.value.push({
        id: uploadedFile.id,
        filename: uploadedFile.filename_download || file.name,
        type: uploadedFile.type || file.type,
        size: uploadedFile.filesize || file.size,
      });
      toast.success("File uploaded and attached");
    }
  } catch (error) {
    console.error("Failed to upload file:", error);
    toast.error("Failed to upload file");
  } finally {
    isUploadingAttachment.value = false;
    if (input) input.value = "";
  }
};

const filteredAttachmentFiles = computed(() => {
  if (!attachmentSearchQuery.value) return attachmentFiles.value;

  const query = attachmentSearchQuery.value.toLowerCase();
  return attachmentFiles.value.filter(
    (file) =>
      file.title?.toLowerCase().includes(query) ||
      file.filename_download?.toLowerCase().includes(query)
  );
});

const formatFileSize = (bytes: number | null | undefined): string => {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const getFileIcon = (type: string): string => {
  if (type.startsWith("image/")) return "lucide:image";
  if (type.includes("pdf")) return "lucide:file-text";
  if (type.includes("word") || type.includes("document")) return "lucide:file-text";
  if (type.includes("excel") || type.includes("spreadsheet")) return "lucide:file-spreadsheet";
  return "lucide:file";
};

// Placeholder text for greeting field
const greetingPlaceholder = computed(() => emailSystem.defaultGreeting);

// Default salutation based on email type
const defaultSalutation = computed(
  () => emailSystem.defaultSalutations[form.emailType]
);

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
                  <Label for="greeting">Greeting</Label>
                  <Input
                    id="greeting"
                    v-model="form.greeting"
                    :placeholder="greetingPlaceholder"
                  />
                  <p class="text-xs text-stone-500">
                    Use
                    <code class="bg-stone-100 px-1 rounded"
                      >&#123;&#123;first_name&#125;&#125;</code
                    >
                    for personalization. In the preview it shows the
                    organization name, but each email will have the recipient's
                    first name.
                  </p>
                </div>

                <div class="space-y-2">
                  <Label for="content">Message *</Label>
                  <TiptapEditor
                    v-model="form.content"
                    placeholder="Write your email message here..."
                    :folder-id="orgFolderId"
                  />
                  <p class="text-xs text-stone-500">
                    Use the toolbar to format text, add images, or browse your
                    organization's files.
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
                    :placeholder="defaultSalutation"
                  />
                  <p class="text-xs text-stone-500">
                    Leave empty to use the default salutation for this email
                    type.
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

            <!-- Attachments -->
            <Card>
              <CardHeader>
                <CardTitle class="flex items-center gap-2">
                  <Icon name="lucide:paperclip" class="w-5 h-5" />
                  Attachments
                </CardTitle>
                <CardDescription>
                  Add files to include with your email
                </CardDescription>
              </CardHeader>
              <CardContent class="space-y-4">
                <!-- Add attachment buttons -->
                <div class="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    @click="openAttachmentBrowser"
                  >
                    <Icon name="lucide:folder-open" class="w-4 h-4 mr-2" />
                    Browse Files
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    :disabled="isUploadingAttachment"
                    @click="triggerAttachmentUpload"
                  >
                    <Icon
                      v-if="isUploadingAttachment"
                      name="lucide:loader-2"
                      class="w-4 h-4 mr-2 animate-spin"
                    />
                    <Icon v-else name="lucide:upload" class="w-4 h-4 mr-2" />
                    Upload New
                  </Button>
                  <input
                    ref="attachmentFileInput"
                    type="file"
                    class="hidden"
                    @change="handleAttachmentUpload"
                  />
                </div>

                <!-- Selected attachments list -->
                <div v-if="selectedAttachments.length > 0" class="space-y-2">
                  <div
                    v-for="attachment in selectedAttachments"
                    :key="attachment.id"
                    class="flex items-center justify-between p-3 bg-stone-50 rounded-lg border"
                  >
                    <div class="flex items-center gap-3 min-w-0">
                      <Icon
                        :name="getFileIcon(attachment.type)"
                        class="w-5 h-5 text-stone-500 flex-shrink-0"
                      />
                      <div class="min-w-0">
                        <div class="font-medium text-sm truncate">
                          {{ attachment.filename }}
                        </div>
                        <div class="text-xs text-stone-500">
                          {{ formatFileSize(attachment.size) }}
                        </div>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      @click="removeAttachment(attachment.id)"
                    >
                      <Icon name="lucide:x" class="w-4 h-4 text-stone-500" />
                    </Button>
                  </div>
                </div>

                <p v-else class="text-sm text-stone-500 text-center py-4">
                  No attachments added
                </p>
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
                  {{ recipientCount }} member{{
                    recipientCount !== 1 ? "s" : ""
                  }}
                  selected
                </CardDescription>
              </CardHeader>
              <CardContent class="space-y-4">
                <!-- Recipient Filter -->
                <div class="space-y-2">
                  <Label class="text-sm font-medium">Filter Recipients</Label>
                  <div class="grid grid-cols-3 gap-2">
                    <button
                      v-for="option in recipientFilterOptions"
                      :key="option.value"
                      @click="recipientFilter = option.value"
                      :class="[
                        'p-2 rounded-lg border text-center transition-all text-xs',
                        recipientFilter === option.value
                          ? 'border-primary bg-primary/5 text-primary'
                          : 'border-stone-200 hover:border-stone-300',
                      ]"
                    >
                      <Icon :name="option.icon" class="w-4 h-4 mx-auto mb-1" />
                      <div class="font-medium">{{ option.label }}</div>
                      <div class="text-stone-500">
                        ({{ memberCounts[option.value] }})
                      </div>
                    </button>
                  </div>
                </div>

                <Separator />

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
                      All {{ recipientTypeLabel }} ({{ members.length }})
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
                  <div
                    class="p-2 border-b bg-stone-50 flex justify-between items-center sticky top-0"
                  >
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
                      form.recipientIds.includes(member.id)
                        ? 'bg-primary/5'
                        : '',
                    ]"
                  >
                    <Checkbox
                      :checked="form.recipientIds.includes(member.id)"
                      @click.stop="toggleMember(member.id)"
                    />
                    <div class="flex-1 min-w-0">
                      <div class="font-medium truncate flex items-center gap-2">
                        {{ member.first_name }} {{ member.last_name }}
                        <span
                          v-if="member.member_type"
                          :class="[
                            'text-[10px] px-1.5 py-0.5 rounded-full uppercase font-semibold',
                            member.member_type === 'owner'
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-amber-100 text-amber-700',
                          ]"
                        >
                          {{ member.member_type }}
                        </span>
                      </div>
                      <div class="text-xs text-stone-500 truncate">
                        {{ member.email }}
                      </div>
                    </div>
                  </div>
                  <div
                    v-if="!members.length"
                    class="p-4 text-center text-stone-500 text-sm"
                  >
                    No {{ recipientTypeLabel }} with email addresses found
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
                  :disabled="
                    emailSystem.isSending.value || recipientCount === 0
                  "
                >
                  <Icon
                    v-if="emailSystem.isSending.value"
                    name="lucide:loader-2"
                    class="w-5 h-5 mr-2 animate-spin"
                  />
                  <Icon v-else name="lucide:send" class="w-5 h-5 mr-2" />
                  Send to {{ recipientCount }} member{{
                    recipientCount !== 1 ? "s" : ""
                  }}
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
            <div
              class="overflow-auto max-h-[70vh] border rounded-lg bg-stone-100 p-4"
            >
              <div
                class="bg-white rounded shadow-sm"
                v-html="previewHtml"
              ></div>
            </div>
            <!-- Attachments in preview -->
            <div v-if="previewAttachments.length > 0" class="mt-4">
              <div class="text-sm font-medium text-stone-700 mb-2 flex items-center gap-2">
                <Icon name="lucide:paperclip" class="w-4 h-4" />
                Attachments ({{ previewAttachments.length }})
              </div>
              <div class="flex flex-wrap gap-2">
                <div
                  v-for="attachment in previewAttachments"
                  :key="attachment.id"
                  class="flex items-center gap-2 px-3 py-2 bg-stone-100 rounded-lg text-sm"
                >
                  <Icon :name="getFileIcon(attachment.type)" class="w-4 h-4 text-stone-500" />
                  <span class="font-medium">{{ attachment.filename }}</span>
                  <span class="text-stone-500">({{ formatFileSize(attachment.size) }})</span>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <!-- Attachment Browser Dialog -->
        <Dialog v-model:open="showAttachmentBrowser">
          <DialogContent class="sm:max-w-3xl max-h-[80vh] flex flex-col">
            <DialogHeader>
              <DialogTitle>Select Attachment</DialogTitle>
              <DialogDescription>
                Choose a file to attach to your email
              </DialogDescription>
            </DialogHeader>

            <!-- Breadcrumb Navigation -->
            <div class="flex items-center gap-1 text-sm border-b pb-2">
              <template v-for="(folder, index) in attachmentFolderPath" :key="folder.id">
                <button
                  type="button"
                  class="hover:text-primary hover:underline"
                  :class="{ 'font-medium': index === attachmentFolderPath.length - 1 }"
                  @click="navigateToAttachmentFolder(folder.id, folder.name)"
                >
                  {{ folder.name }}
                </button>
                <Icon
                  v-if="index < attachmentFolderPath.length - 1"
                  name="lucide:chevron-right"
                  class="w-4 h-4 text-stone-400"
                />
              </template>
            </div>

            <!-- Search -->
            <div class="relative">
              <Icon
                name="lucide:search"
                class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400"
              />
              <Input
                v-model="attachmentSearchQuery"
                placeholder="Search files..."
                class="pl-9"
              />
            </div>

            <!-- File Grid -->
            <div class="flex-1 overflow-y-auto min-h-[300px]">
              <div
                v-if="isLoadingAttachments"
                class="flex items-center justify-center h-full"
              >
                <Icon
                  name="lucide:loader-2"
                  class="w-8 h-8 animate-spin text-stone-400"
                />
              </div>

              <div
                v-else-if="attachmentFolders.length === 0 && filteredAttachmentFiles.length === 0"
                class="flex flex-col items-center justify-center h-full text-stone-500"
              >
                <Icon name="lucide:folder-x" class="w-12 h-12 mb-2" />
                <p>No files found in this folder</p>
              </div>

              <div
                v-else
                class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 p-1"
              >
                <!-- Folders -->
                <button
                  v-for="folder in attachmentFolders"
                  :key="folder.id"
                  type="button"
                  class="flex flex-col items-center p-3 rounded-lg border hover:bg-stone-50 hover:border-stone-300 transition-colors"
                  @click="navigateToAttachmentFolder(folder.id, folder.name || 'Folder')"
                >
                  <Icon
                    name="lucide:folder"
                    class="w-10 h-10 text-amber-500 mb-2"
                  />
                  <span class="text-sm text-center truncate w-full">
                    {{ folder.name || "Folder" }}
                  </span>
                </button>

                <!-- Files -->
                <button
                  v-for="file in filteredAttachmentFiles"
                  :key="file.id"
                  type="button"
                  class="flex flex-col items-center p-3 rounded-lg border hover:bg-stone-50 hover:border-primary transition-colors group"
                  :class="{ 'border-primary bg-primary/5': form.attachmentIds.includes(file.id) }"
                  @click="selectAttachmentFile(file)"
                >
                  <div
                    class="w-12 h-12 mb-2 flex items-center justify-center rounded bg-stone-100"
                  >
                    <Icon
                      :name="getFileIcon(file.type || '')"
                      class="w-6 h-6 text-stone-400"
                    />
                  </div>
                  <span
                    class="text-sm text-center truncate w-full group-hover:text-primary"
                  >
                    {{ file.title || file.filename_download || "File" }}
                  </span>
                  <span class="text-xs text-stone-400">
                    {{ formatFileSize(file.filesize) }}
                  </span>
                  <Icon
                    v-if="form.attachmentIds.includes(file.id)"
                    name="lucide:check-circle"
                    class="w-4 h-4 text-primary mt-1"
                  />
                </button>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" @click="showAttachmentBrowser = false">
                Cancel
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  </div>
</template>
