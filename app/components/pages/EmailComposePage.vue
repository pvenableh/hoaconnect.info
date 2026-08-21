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
import type { HoaMember, DirectusFile, DirectusFolder, BlockSetting } from "#core/types/directus";
import type { PickedFile } from "#core/app/composables/useOrgStorage";
import {
  CC_TOKEN_BOARD,
  CC_TOKEN_PROPERTY_MANAGER,
  DEFAULT_CC_BCC_THRESHOLD,
  ccEntryLabel,
  isValidEmail,
} from "#core/shared/email/cc";

const props = defineProps<{
  emailId?: string;
  /** Recipient preset from the Audience tab deep-links. */
  audience?: "all" | "owners" | "tenants";
}>();

const { navigateToOrg, buildOrgPath } = useOrgNavigation();
const emailSystem = useEmailSystem();
const emailTemplates = useEmailTemplates();
const { list: listMembers } = useDirectusItems("hoa_members");
const filesComposable = useDirectusFiles();
const foldersComposable = useDirectusFolders();
const orgStorage = useOrgStorage();

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
    | "alert"
    | "newsletter"
    | "announcement"
    | "reminder"
    | "notice",
  contentMode: "visual" as "visual" | "mjml" | "builder",
  greeting: "",
  salutation: "",
  includeBoardFooter: true,
  headerText: "",
  recipientIds: [] as string[],
  attachmentIds: [] as string[],
  cc: [] as string[],
  bcc: [] as string[],
});

// The block-builder authors MJML into form.content, so the save/send/preview
// pipeline treats "builder" exactly as "mjml" — only the editor UI differs.
const apiContentMode = computed<"visual" | "mjml">(() =>
  form.contentMode === "builder" ? "mjml" : form.contentMode
);

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

// Selection mode and filter type. `audience` (from the Audience tab deep-link)
// presets the group when not editing an existing email.
const selectionMode = ref<"all" | "selected">("all");
const recipientFilter = ref<"all" | "owners" | "tenants">(
  !props.emailId && props.audience ? props.audience : "all",
);

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
  (email) => {
    if (email) {
      form.subject = email.subject || "";
      form.content = email.content || "";
      form.emailType = email.email_type || "basic";
      form.contentMode = (email as any).content_mode === "mjml" ? "mjml" : "visual";
      form.greeting = email.greeting || "";
      form.salutation = email.salutation || "";
      form.includeBoardFooter = email.include_board_footer ?? true;
      form.headerText = (email as any).header_text || "";
      form.cc = Array.isArray((email as any).cc) ? [...(email as any).cc] : [];
      form.bcc = Array.isArray((email as any).bcc) ? [...(email as any).bcc] : [];

      // Load attachments if they exist (M2M structure from Directus)
      if (email.attachments && Array.isArray(email.attachments) && email.attachments.length > 0) {
        // Extract file IDs and details from M2M junction records
        const attachments = email.attachments as Array<{
          id: number;
          directus_files_id: DirectusFile | string;
        }>;

        form.attachmentIds = [];
        selectedAttachments.value = [];

        for (const attachment of attachments) {
          const file = attachment.directus_files_id;
          if (typeof file === "object" && file?.id) {
            form.attachmentIds.push(file.id);
            selectedAttachments.value.push({
              id: file.id,
              filename: file.filename_download || file.title || "attachment",
              type: file.type || "application/octet-stream",
              size: file.filesize || 0,
            });
          } else if (typeof file === "string") {
            // Fallback if only ID was returned
            form.attachmentIds.push(file);
          }
        }
      }
      // Note: Recipients would need to be loaded separately for editing
    }
  },
  { immediate: true }
);

// ---- Template library (Phase 9 Stage B) ----
import type { HoaEmailTemplate } from "#core/types/directus";

const showTemplatePicker = ref(false);
const availableTemplates = ref<HoaEmailTemplate[]>([]);
const loadingTemplates = ref(false);

const openTemplatePicker = async () => {
  if (!orgId.value) return;
  showTemplatePicker.value = true;
  loadingTemplates.value = true;
  try {
    availableTemplates.value = await emailTemplates.listForOrg(orgId.value);
  } catch (e: any) {
    toast.error(e.message || "Failed to load templates");
  } finally {
    loadingTemplates.value = false;
  }
};

const applyTemplate = (tpl: HoaEmailTemplate) => {
  if (tpl.subject) form.subject = tpl.subject;
  if (tpl.content) form.content = tpl.content;
  if (tpl.email_type) form.emailType = tpl.email_type;
  form.contentMode = tpl.content_mode === "mjml" ? "mjml" : "visual";
  if (tpl.greeting != null) form.greeting = tpl.greeting;
  if (tpl.salutation != null) form.salutation = tpl.salutation;
  if (tpl.include_board_footer != null) form.includeBoardFooter = tpl.include_board_footer;
  showTemplatePicker.value = false;
  toast.success(`Started from "${tpl.name}"`);
};

const showSaveTemplate = ref(false);
const savingTemplate = ref(false);
const newTemplate = reactive({ name: "", description: "" });

const openSaveTemplate = () => {
  if (!form.subject && !form.content) {
    toast.error("Add some content before saving a template");
    return;
  }
  newTemplate.name = form.subject || "";
  newTemplate.description = "";
  showSaveTemplate.value = true;
};

const saveAsTemplate = async () => {
  if (!orgId.value || !newTemplate.name.trim()) {
    toast.error("Give the template a name");
    return;
  }
  savingTemplate.value = true;
  try {
    await emailTemplates.create(orgId.value, {
      name: newTemplate.name.trim(),
      description: newTemplate.description.trim() || null,
      email_type: form.emailType,
      subject: form.subject || null,
      content: form.content || null,
      content_mode: apiContentMode.value,
      greeting: form.greeting || null,
      salutation: form.salutation || null,
      include_board_footer: form.includeBoardFooter,
    });
    toast.success("Saved as template");
    showSaveTemplate.value = false;
  } catch (e: any) {
    toast.error(e.message || "Failed to save template");
  } finally {
    savingTemplate.value = false;
  }
};

// ---- Merge fields (Phase 9 Stage B) ----
const showMergeFields = ref(false);

const insertMergeField = (token: string) => {
  form.content = `${form.content || ""} {{${token}}}`.trimStart();
  toast.success(`Inserted {{${token}}}`);
};

// Computed recipients based on selection mode
const selectedRecipients = computed(() => {
  if (selectionMode.value === "all") {
    return members.value;
  }
  return members.value.filter((m) => form.recipientIds.includes(m.id));
});

const recipientCount = computed(() => selectedRecipients.value.length);

// ── CC / BCC ──────────────────────────────────────────────────────────────
// Org's small/large cutoff (defaults to 5 until the org's setting loads).
const ccBccThreshold = ref(DEFAULT_CC_BCC_THRESHOLD);
const { list: listSettings } = useDirectusItems<BlockSetting>("block_settings");
watchEffect(async () => {
  if (!orgId.value) return;
  try {
    const rows = await listSettings({
      filter: { organization: { _eq: orgId.value } },
      fields: ["cc_bcc_threshold"],
      limit: 1,
    });
    const t = Number((rows?.[0] as any)?.cc_bcc_threshold);
    if (Number.isFinite(t) && t > 0) ccBccThreshold.value = t;
  } catch {
    /* keep default */
  }
});

const ccTokenLabel = ccEntryLabel; // expose to template
const newEmail = reactive<{ cc: string; bcc: string }>({ cc: "", bcc: "" });

const hasBoard = (field: "cc" | "bcc") => form[field].includes(CC_TOKEN_BOARD);
const hasPm = (field: "cc" | "bcc") => form[field].includes(CC_TOKEN_PROPERTY_MANAGER);

const toggleGroup = (field: "cc" | "bcc", token: string) => {
  const i = form[field].indexOf(token);
  if (i > -1) form[field].splice(i, 1);
  else form[field].push(token);
};

const removeEntry = (field: "cc" | "bcc", value: string) => {
  const i = form[field].indexOf(value);
  if (i > -1) form[field].splice(i, 1);
};

const addEmailEntry = (field: "cc" | "bcc") => {
  const value = newEmail[field].trim().toLowerCase();
  if (!value) return;
  if (!isValidEmail(value)) {
    toast.error("Enter a valid email address");
    return;
  }
  if (!form[field].includes(value)) form[field].push(value);
  newEmail[field] = "";
};

// How CC/BCC behave for the current recipient count.
const hasCopies = computed(() => form.cc.length > 0 || form.bcc.length > 0);
const ccBccModeHint = computed(() => {
  if (!hasCopies.value) return "";
  return recipientCount.value <= ccBccThreshold.value
    ? `Small send (≤ ${ccBccThreshold.value}): each recipient's email shows the CC/BCC.`
    : `Large send (> ${ccBccThreshold.value}): CC/BCC contacts each get a single copy.`;
});

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
      contentMode: apiContentMode.value,
      greeting: form.greeting || undefined,
      salutation: form.salutation || undefined,
      includeBoardFooter: form.includeBoardFooter,
      headerText: form.headerText || undefined,
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
      contentMode: apiContentMode.value,
      greeting: form.greeting || undefined,
      salutation: form.salutation || undefined,
      includeBoardFooter: form.includeBoardFooter,
      headerText: form.headerText || undefined,
      status: "draft",
      attachmentIds: form.attachmentIds.length > 0 ? form.attachmentIds : undefined,
      cc: form.cc.length > 0 ? form.cc : undefined,
      bcc: form.bcc.length > 0 ? form.bcc : undefined,
    });
    toast.success("Draft saved");
    navigateToOrg("/admin/communications");
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
      contentMode: apiContentMode.value,
        greeting: form.greeting || undefined,
        salutation: form.salutation || undefined,
        includeBoardFooter: form.includeBoardFooter,
        headerText: form.headerText || undefined,
        status: "draft",
        attachmentIds: form.attachmentIds.length > 0 ? form.attachmentIds : undefined,
        cc: form.cc.length > 0 ? form.cc : undefined,
        bcc: form.bcc.length > 0 ? form.bcc : undefined,
      });
      emailId = saveResult.email.id;
    }

    const result = await emailSystem.sendEmail({
      organizationId: orgId.value,
      subject: form.subject,
      content: form.content,
      emailType: form.emailType,
      contentMode: apiContentMode.value,
      greeting: form.greeting || undefined,
      salutation: form.salutation || undefined,
      includeBoardFooter: form.includeBoardFooter,
      headerText: form.headerText || undefined,
      recipientIds,
      emailId,
      attachmentIds: form.attachmentIds.length > 0 ? form.attachmentIds : undefined,
      cc: form.cc.length > 0 ? form.cc : undefined,
      bcc: form.bcc.length > 0 ? form.bcc : undefined,
    });

    if (result.stats.failed > 0) {
      toast.warning(
        `Email sent with ${result.stats.failed} failures. ${result.stats.delivered}/${result.stats.total} delivered.`
      );
    } else {
      toast.success(`Email sent to ${result.stats.delivered} recipients`);
    }

    navigateToOrg("/admin/communications");
  } catch (error: any) {
    toast.error(error.message || "Failed to send email");
  }
};

// ---- Scheduling (Phase 9 Stage C) ----
const scheduleEnabled = ref(false);
const scheduledAt = ref(""); // datetime-local string
const recurrenceRule = ref<"none" | "weekly" | "monthly">("none");

// Map the recipient UI to stored targeting for the scheduler
const targetingForSave = () => {
  if (selectionMode.value === "selected") {
    return { recipientFilter: "custom" as const, recipientIds: [...form.recipientIds] };
  }
  return { recipientFilter: recipientFilter.value as "all" | "owners" | "tenants", recipientIds: undefined };
};

const handleSchedule = async () => {
  if (!orgId.value || !form.subject || !form.content) {
    toast.error("Please fill in subject and content");
    return;
  }
  if (!scheduledAt.value) {
    toast.error("Pick a date and time to schedule");
    return;
  }
  const when = new Date(scheduledAt.value);
  if (Number.isNaN(when.getTime()) || when.getTime() <= Date.now()) {
    toast.error("Schedule time must be in the future");
    return;
  }
  const { recipientFilter: rf, recipientIds: rids } = targetingForSave();
  if (rf === "custom" && (!rids || rids.length === 0)) {
    toast.error("Select at least one recipient to schedule");
    return;
  }

  try {
    await emailSystem.saveDraft({
      emailId: props.emailId,
      organizationId: orgId.value,
      subject: form.subject,
      content: form.content,
      emailType: form.emailType,
      contentMode: apiContentMode.value,
      greeting: form.greeting || undefined,
      salutation: form.salutation || undefined,
      includeBoardFooter: form.includeBoardFooter,
      headerText: form.headerText || undefined,
      status: "scheduled",
      scheduledAt: when.toISOString(),
      recurrenceRule: recurrenceRule.value,
      recipientFilter: rf,
      recipientIds: rids,
      attachmentIds: form.attachmentIds.length > 0 ? form.attachmentIds : undefined,
    });
    const repeat = recurrenceRule.value !== "none" ? `, repeating ${recurrenceRule.value}` : "";
    toast.success(`Scheduled for ${when.toLocaleString()}${repeat}`);
    navigateToOrg("/admin/communications");
  } catch (error: any) {
    toast.error(error.message || "Failed to schedule email");
  }
};

// Cancel
const handleCancel = () => {
  navigateToOrg("/admin/communications");
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

// Attach files chosen from the universal (org-scoped) library picker.
const onLibraryPicked = (files: PickedFile[]) => {
  for (const f of files) {
    if (form.attachmentIds.includes(f.id)) continue;
    form.attachmentIds.push(f.id);
    selectedAttachments.value.push({
      id: f.id,
      filename: f.filename_download || f.title || "attachment",
      type: f.type || "application/octet-stream",
      size: f.filesize || 0,
    });
  }
  if (files.length) toast.success("Attachment added");
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
    // Route new email uploads into the org's Uploads/Emails subfolder.
    const result = await orgStorage.upload(file, {
      title: file.name,
      source: "email",
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

// Test email state
const { user } = useUserSession();
const testEmails = ref<string[]>([]);
const showTestEmailSection = ref(false);
const testEmailSending = ref(false);
const testEmailResults = ref<{ email: string; success: boolean; error?: string }[]>([]);

// Initialize test emails with logged-in user's email
watch(
  () => user.value?.email,
  (email) => {
    if (email && testEmails.value.length === 0) {
      testEmails.value = [email];
    }
  },
  { immediate: true }
);

// Track current email ID (from props or after auto-save)
const currentEmailId = ref<string | undefined>(props.emailId);

// Send test email - auto-saves as draft first to get an email ID for "View in Browser" link
const handleTestEmail = async () => {
  if (!orgId.value || !form.subject || !form.content) {
    toast.error("Please fill in subject and content first");
    return;
  }

  if (testEmails.value.length === 0) {
    toast.error("Please add at least one test email address");
    return;
  }

  testEmailSending.value = true;
  testEmailResults.value = [];

  try {
    // Auto-save as draft first if no email ID exists
    // This ensures the "View in Browser" link works in test emails
    let emailId = currentEmailId.value;

    if (!emailId) {
      const saveResult = await emailSystem.saveDraft({
        organizationId: orgId.value,
        subject: form.subject,
        content: form.content,
        emailType: form.emailType,
      contentMode: apiContentMode.value,
        greeting: form.greeting || undefined,
        salutation: form.salutation || undefined,
        includeBoardFooter: form.includeBoardFooter,
        headerText: form.headerText || undefined,
        status: "draft",
        attachmentIds: form.attachmentIds.length > 0 ? form.attachmentIds : undefined,
      });
      emailId = saveResult.email.id;
      currentEmailId.value = emailId;
      toast.info("Email auto-saved as draft");
    }

    const result = await emailSystem.sendTestEmail({
      organizationId: orgId.value,
      emailId,
      testEmails: testEmails.value,
      subject: form.subject,
      content: form.content,
      emailType: form.emailType,
      contentMode: apiContentMode.value,
      greeting: form.greeting || undefined,
      salutation: form.salutation || undefined,
      includeBoardFooter: form.includeBoardFooter,
      headerText: form.headerText || undefined,
      attachmentIds: form.attachmentIds.length > 0 ? form.attachmentIds : undefined,
    });

    testEmailResults.value = result.results;

    if (result.details.totalFailed === 0) {
      toast.success(result.message);
    } else {
      toast.warning(result.message);
    }
  } catch (error: any) {
    toast.error(error.message || "Failed to send test email");
  } finally {
    testEmailSending.value = false;
  }
};

useSeoMeta({
  title: props.emailId ? "Edit Email" : "Compose Email",
  description: "Create and send emails to your HOA members",
});
</script>

<template>
  <div class="min-h-screen t-bg-subtle">
    <div class="p-6">
      <div class="max-w-5xl mx-auto">
        <AppPageHeader
          :back-to="buildOrgPath('/admin/communications')"
          back-label="Communications"
          :title="props.emailId ? 'Edit Email' : 'Compose Email'"
          description="Create and send emails to your HOA members."
        >
          <template #actions>
            <Button variant="outline" size="sm" @click="openTemplatePicker">
              <Icon name="lucide:layout-template" class="w-4 h-4 mr-2" />
              Start from template
            </Button>
            <Button variant="outline" size="sm" @click="openSaveTemplate">
              <Icon name="lucide:bookmark-plus" class="w-4 h-4 mr-2" />
              Save as template
            </Button>
          </template>
        </AppPageHeader>

        <!-- Loading State -->
        <div v-if="isLoading" class="text-center py-12">
          <Icon
            name="lucide:loader-2"
            class="w-8 h-8 animate-spin mx-auto mb-4"
          />
          <p class="text-sm t-text-secondary">Loading...</p>
        </div>

        <!-- No Organization State -->
        <AppEmptyState
          v-else-if="!organization"
          icon="lucide:alert-circle"
          title="No organization found"
          description="You aren't associated with any HOA organization, so there's nobody to send to. Ask an admin to add you to one."
        />

        <!-- Main Form -->
        <div v-else class="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <!-- Email Content (Left) -->
          <div class="lg:col-span-2 space-y-6 order-2 lg:order-1">
            <!-- Email Type -->
            <Card>
              <CardHeader>
                <CardTitle>Email Type</CardTitle>
                <CardDescription>
                  Sets the tone and styling. Every type is delivered as email (with a
                  shareable web link) — it does not post to the resident Announcements feed.
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
                        : 't-border hover:t-border',
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
                <div class="flex items-center justify-between gap-3 flex-wrap">
                  <div class="flex items-center gap-3 flex-wrap">
                    <CardTitle>Email Content</CardTitle>
                    <!-- Optional AI helper — drafts/rewrites subject + body. Lives
                         here (not in the field flow) so Subject → Body stays the
                         primary path. Self-hides when AI is unconfigured. -->
                    <AiDraftWithAi
                      :org-id="orgId"
                      v-model:subject="form.subject"
                      v-model:content="form.content"
                    />
                  </div>
                  <!-- Editor mode toggle: visual rich text · block builder · raw MJML -->
                  <div class="inline-flex rounded-lg border t-border p-0.5">
                    <button
                      type="button"
                      @click="form.contentMode = 'visual'"
                      :class="[
                        'px-3 py-1 text-xs font-medium rounded-md transition-colors',
                        form.contentMode === 'visual'
                          ? 'bg-primary text-primary-foreground'
                          : 't-text-secondary hover:t-bg-subtle',
                      ]"
                    >
                      <Icon name="lucide:type" class="w-3.5 h-3.5 mr-1 inline" />
                      Visual
                    </button>
                    <button
                      type="button"
                      @click="form.contentMode = 'builder'"
                      :class="[
                        'px-3 py-1 text-xs font-medium rounded-md transition-colors',
                        form.contentMode === 'builder'
                          ? 'bg-primary text-primary-foreground'
                          : 't-text-secondary hover:t-bg-subtle',
                      ]"
                    >
                      <Icon name="lucide:layout-template" class="w-3.5 h-3.5 mr-1 inline" />
                      Builder
                    </button>
                    <button
                      type="button"
                      @click="form.contentMode = 'mjml'"
                      :class="[
                        'px-3 py-1 text-xs font-medium rounded-md transition-colors',
                        form.contentMode === 'mjml'
                          ? 'bg-primary text-primary-foreground'
                          : 't-text-secondary hover:t-bg-subtle',
                      ]"
                    >
                      <Icon name="lucide:code-2" class="w-3.5 h-3.5 mr-1 inline" />
                      MJML / HTML
                    </button>
                  </div>
                </div>
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
                  <p class="text-xs t-text-muted">
                    Use
                    <code class="t-bg-subtle px-1 rounded"
                      >&#123;&#123;first_name&#125;&#125;</code
                    >
                    for personalization. In the preview it shows the
                    organization name, but each email will have the recipient's
                    first name.
                  </p>
                </div>

                <div class="space-y-2">
                  <div class="flex items-center justify-between gap-2">
                    <Label for="content">Message *</Label>
                    <!-- Surfaced at the point of writing rather than buried below.
                         The builder edits copy inside each block, so the raw
                         merge-field inserter doesn't apply there. -->
                    <button
                      v-if="form.contentMode !== 'builder'"
                      type="button"
                      class="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-md t-bg-subtle hover:bg-primary/10 hover:text-primary transition-colors tappable"
                      @click="showMergeFields = !showMergeFields"
                    >
                      <Icon name="lucide:braces" class="w-3.5 h-3.5" />
                      Insert merge field
                      <Icon
                        :name="showMergeFields ? 'lucide:chevron-up' : 'lucide:chevron-down'"
                        class="w-3.5 h-3.5 opacity-60"
                      />
                    </button>
                  </div>
                  <TiptapEditor
                    v-if="form.contentMode === 'visual'"
                    v-model="form.content"
                    placeholder="Write your email message here..."
                    :folder-id="orgFolderId"
                  />
                  <EmailBuilderRoot
                    v-else-if="form.contentMode === 'builder'"
                    :org-id="orgId"
                    v-model:mjml="form.content"
                    @update:subject="(s: string) => { if (s) form.subject = s; }"
                  />
                  <template v-else>
                    <textarea
                      v-model="form.content"
                      rows="18"
                      spellcheck="false"
                      placeholder="<mjml>&#10;  <mj-body>&#10;    <mj-section><mj-column>&#10;      <mj-text>Hello {{first_name}}</mj-text>&#10;    </mj-column></mj-section>&#10;  </mj-body>&#10;</mjml>"
                      class="w-full font-mono text-xs leading-relaxed rounded-lg border t-border t-bg-subtle p-3 focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                  </template>
                  <p class="text-xs t-text-muted">
                    <template v-if="form.contentMode === 'visual'">
                      Use the toolbar to format text, add images, or browse your
                      organization's files.
                    </template>
                    <template v-else-if="form.contentMode === 'builder'">
                      Add blocks, drag to reorder, and edit each block's content. Merge fields like
                      <code class="t-bg-subtle px-1 rounded">&#123;&#123;first_name&#125;&#125;</code> work inside text blocks. Preview to see the assembled email.
                    </template>
                    <template v-else>
                      Write raw <strong>MJML</strong> (compiled on send) or plain HTML for full control.
                      Merge fields like <code class="t-bg-subtle px-1 rounded">&#123;&#123;first_name&#125;&#125;</code> work in both modes.
                    </template>
                  </p>

                  <!-- Merge field panel — toggled from the Message label above. -->
                  <div v-if="showMergeFields" class="rounded-lg border t-border px-3 py-3">
                    <div class="space-y-2">
                      <div v-for="grp in emailSystem.mergeFieldGroups" :key="grp.group">
                        <p class="text-[10px] uppercase tracking-wide font-semibold t-text-muted mb-1">{{ grp.group }}</p>
                        <div class="flex flex-wrap gap-1.5">
                          <button
                            v-for="f in grp.fields"
                            :key="f.token"
                            type="button"
                            class="text-xs px-2 py-1 rounded-md t-bg-subtle hover:bg-primary/10 hover:text-primary transition-colors"
                            :title="`Insert {{${f.token}}}`"
                            @click="insertMergeField(f.token)"
                          >
                            {{ f.label }}
                          </button>
                        </div>
                      </div>
                      <p class="text-[11px] t-text-muted pt-1">
                        Each recipient sees their own values. Vehicle/pet/parking use the first matching record.
                      </p>
                    </div>
                  </div>
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
                  <Label for="header-line">Header line (under logo)</Label>
                  <Input
                    id="header-line"
                    v-model="form.headerText"
                    placeholder="Official Communication of {name}"
                  />
                  <p class="text-xs t-text-muted">
                    Optional. Overrides your organization's default for this send.
                    Use {name} or {legal_name} as placeholders. Leave empty to use
                    the org default.
                  </p>
                </div>

                <div class="space-y-2">
                  <Label for="salutation">Custom Salutation</Label>
                  <Input
                    id="salutation"
                    v-model="form.salutation"
                    :placeholder="defaultSalutation"
                  />
                  <p class="text-xs t-text-muted">
                    Leave empty to use the default salutation for this email
                    type.
                  </p>
                </div>

                <div class="flex items-center gap-3">
                  <Switch
                    id="include-board"
                    v-model="form.includeBoardFooter"
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
                  <StorageFilePickerButton
                    source="email"
                    multiple
                    label="Library"
                    icon="lucide:library"
                    variant="outline"
                    title="Attach from the organization library"
                    @select="onLibraryPicked"
                  />
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
                    class="flex items-center justify-between p-3 t-bg-subtle rounded-lg border dark:border-stone-700"
                  >
                    <div class="flex items-center gap-3 min-w-0">
                      <Icon
                        :name="getFileIcon(attachment.type)"
                        class="w-5 h-5 t-text-muted flex-shrink-0"
                      />
                      <div class="min-w-0">
                        <div class="font-medium text-sm truncate">
                          {{ attachment.filename }}
                        </div>
                        <div class="text-xs t-text-muted">
                          {{ formatFileSize(attachment.size) }}
                        </div>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      @click="removeAttachment(attachment.id)"
                    >
                      <Icon name="lucide:x" class="w-4 h-4 t-text-muted" />
                    </Button>
                  </div>
                </div>

                <AppEmptyState
                  v-else
                  compact
                  icon="lucide:paperclip"
                  title="No attachments"
                  description="Attach a document from your files, and recipients get it with the email."
                />
              </CardContent>
            </Card>
          </div>

          <!-- Recipients & Actions (Right) - Sticky on md+ -->
          <div class="order-1 lg:order-2 lg:sticky lg:top-6 lg:self-start space-y-6">
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
                          : 't-border hover:t-border',
                      ]"
                    >
                      <Icon :name="option.icon" class="w-4 h-4 mx-auto mb-1" />
                      <div class="font-medium">{{ option.label }}</div>
                      <div class="t-text-muted">
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
                  class="border dark:border-stone-700 rounded-lg max-h-80 overflow-y-auto"
                >
                  <div
                    class="p-2 border-b dark:border-stone-700 t-bg-subtle flex justify-between items-center sticky top-0"
                  >
                    <span class="text-sm t-text-secondary">
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
                      'p-3 border-b dark:border-stone-700 last:border-b-0 cursor-pointer hover:t-bg-subtle flex items-center gap-3',
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
                              ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                              : 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
                          ]"
                        >
                          {{ member.member_type }}
                        </span>
                      </div>
                      <div class="text-xs t-text-muted truncate">
                        {{ member.email }}
                      </div>
                    </div>
                  </div>
                  <div
                    v-if="!members.length"
                    class="p-4 text-center t-text-muted text-sm"
                  >
                    No {{ recipientTypeLabel }} with email addresses found
                  </div>
                </div>
              </CardContent>
            </Card>

            <!-- CC / BCC -->
            <Card>
              <CardHeader>
                <CardTitle>Copy others</CardTitle>
                <CardDescription>
                  Add the Board, Property Manager, or any address as CC/BCC.
                </CardDescription>
              </CardHeader>
              <CardContent class="space-y-5">
                <template v-for="field in (['cc', 'bcc'] as const)" :key="field">
                  <div class="space-y-2">
                    <Label class="text-sm font-medium uppercase tracking-wide">
                      {{ field === 'cc' ? 'CC' : 'BCC' }}
                    </Label>

                    <!-- Group quick-toggles -->
                    <div class="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        @click="toggleGroup(field, CC_TOKEN_BOARD)"
                        :class="[
                          'p-2 rounded-lg border text-center transition-all text-xs font-medium',
                          hasBoard(field) ? 'border-primary bg-primary/5 text-primary' : 't-border hover:t-border',
                        ]"
                      >
                        <Icon name="lucide:users" class="w-4 h-4 mx-auto mb-1" />
                        Board
                      </button>
                      <button
                        type="button"
                        @click="toggleGroup(field, CC_TOKEN_PROPERTY_MANAGER)"
                        :class="[
                          'p-2 rounded-lg border text-center transition-all text-xs font-medium',
                          hasPm(field) ? 'border-primary bg-primary/5 text-primary' : 't-border hover:t-border',
                        ]"
                      >
                        <Icon name="lucide:briefcase" class="w-4 h-4 mx-auto mb-1" />
                        Property Manager
                      </button>
                    </div>

                    <!-- Current entries -->
                    <div v-if="form[field].length" class="flex flex-wrap gap-1.5">
                      <span
                        v-for="entry in form[field]"
                        :key="entry"
                        class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-primary/10 text-primary"
                      >
                        {{ ccTokenLabel(entry) }}
                        <button type="button" @click="removeEntry(field, entry)" class="hover:opacity-70">
                          <Icon name="lucide:x" class="w-3 h-3" />
                        </button>
                      </span>
                    </div>

                    <!-- Free-form email entry -->
                    <div class="flex gap-2">
                      <Input
                        v-model="newEmail[field]"
                        type="email"
                        placeholder="name@example.com"
                        class="text-sm"
                        @keydown.enter.prevent="addEmailEntry(field)"
                      />
                      <Button type="button" variant="outline" size="sm" @click="addEmailEntry(field)">
                        Add
                      </Button>
                    </div>
                  </div>
                </template>

                <p v-if="ccBccModeHint" class="text-xs t-text-muted">
                  <Icon name="lucide:info" class="w-3 h-3 inline mr-1" />{{ ccBccModeHint }}
                </p>
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

                <!-- Schedule for later -->
                <div class="rounded-lg border t-border">
                  <button
                    type="button"
                    class="flex items-center justify-between w-full px-3 py-2"
                    @click="scheduleEnabled = !scheduleEnabled"
                  >
                    <span class="text-sm font-medium flex items-center gap-1.5">
                      <Icon name="lucide:calendar-clock" class="w-4 h-4" />
                      Schedule for later
                    </span>
                    <Switch :model-value="scheduleEnabled" @update:model-value="(v) => scheduleEnabled = v" />
                  </button>
                  <div v-if="scheduleEnabled" class="px-3 pb-3 pt-1 space-y-3 border-t t-border">
                    <div class="space-y-1.5">
                      <Label for="sched-at" class="text-xs">Send at</Label>
                      <input
                        id="sched-at"
                        v-model="scheduledAt"
                        type="datetime-local"
                        class="w-full text-sm rounded-md border t-border bg-transparent px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/40"
                      />
                    </div>
                    <div class="space-y-1.5">
                      <Label for="sched-repeat" class="text-xs">Repeat</Label>
                      <select
                        id="sched-repeat"
                        v-model="recurrenceRule"
                        class="w-full text-sm rounded-md border t-border bg-transparent px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/40"
                      >
                        <option value="none">Does not repeat</option>
                        <option value="weekly">Weekly</option>
                        <option value="monthly">Monthly</option>
                      </select>
                    </div>
                    <Button class="w-full" @click="handleSchedule" :disabled="emailSystem.isLoading.value">
                      <Icon name="lucide:calendar-clock" class="w-4 h-4 mr-2" />
                      Schedule
                    </Button>
                    <p class="text-[11px] t-text-muted">
                      Recipients are locked in at schedule time using the selection above.
                    </p>
                  </div>
                </div>

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

            <!-- Test Email -->
            <Card>
              <CardHeader class="pb-3">
                <button
                  type="button"
                  class="flex items-center justify-between w-full text-left"
                  @click="showTestEmailSection = !showTestEmailSection"
                >
                  <div class="flex items-center gap-2">
                    <Icon name="lucide:flask-conical" class="w-5 h-5 text-amber-600" />
                    <CardTitle class="text-base">Test Delivery</CardTitle>
                  </div>
                  <Icon
                    :name="showTestEmailSection ? 'lucide:chevron-up' : 'lucide:chevron-down'"
                    class="w-4 h-4 t-text-muted"
                  />
                </button>
                <CardDescription v-if="!showTestEmailSection">
                  Send a test email before sending to all recipients
                </CardDescription>
              </CardHeader>

              <CardContent v-if="showTestEmailSection" class="pt-0 space-y-4">
                <p class="text-sm t-text-secondary">
                  Test your email in multiple clients (Gmail, Outlook, etc.) before sending to all recipients.
                </p>

                <FormEmailTagInput
                  v-model="testEmails"
                  :default-email="user?.email"
                  placeholder="Enter email and press Enter"
                  :max-emails="5"
                />

                <!-- Test Results -->
                <div v-if="testEmailResults.length > 0" class="space-y-2">
                  <div class="text-sm font-medium t-text">Results:</div>
                  <div
                    v-for="result in testEmailResults"
                    :key="result.email"
                    class="flex items-center gap-2 text-sm"
                  >
                    <Icon
                      :name="result.success ? 'lucide:check-circle' : 'lucide:x-circle'"
                      :class="result.success ? 'text-green-600' : 'text-red-600'"
                      class="w-4 h-4 flex-shrink-0"
                    />
                    <span class="truncate">{{ result.email }}</span>
                    <span v-if="result.error" class="text-red-600 text-xs">
                      ({{ result.error }})
                    </span>
                  </div>
                </div>

                <Button
                  variant="outline"
                  class="w-full"
                  @click="handleTestEmail"
                  :disabled="testEmailSending || testEmails.length === 0 || !form.subject || !form.content"
                >
                  <Icon
                    v-if="testEmailSending"
                    name="lucide:loader-2"
                    class="w-4 h-4 mr-2 animate-spin"
                  />
                  <Icon v-else name="lucide:send" class="w-4 h-4 mr-2" />
                  Send Test Email{{ testEmails.length > 1 ? 's' : '' }}
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>

        <!-- Template Picker -->
        <Dialog v-model:open="showTemplatePicker">
          <DialogContent class="sm:max-w-2xl max-h-[80vh] flex flex-col">
            <DialogHeader>
              <DialogTitle>Start from a template</DialogTitle>
              <DialogDescription>
                Pick a saved template to pre-fill the subject, content, and settings.
              </DialogDescription>
            </DialogHeader>

            <div class="flex-1 overflow-y-auto min-h-[200px]">
              <div v-if="loadingTemplates" class="flex items-center justify-center py-12">
                <Icon name="lucide:loader-2" class="w-7 h-7 animate-spin t-text-muted" />
              </div>
              <AppEmptyState
                v-else-if="availableTemplates.length === 0"
                compact
                icon="lucide:layout-template"
                title="No templates yet"
                description="Build an email you expect to send again, then choose “Save as template” — it will be waiting here next time."
              />
              <div v-else class="space-y-2">
                <button
                  v-for="tpl in availableTemplates"
                  :key="tpl.id"
                  type="button"
                  class="w-full text-left p-3 rounded-lg border t-border hover:border-primary hover:bg-primary/5 transition-colors"
                  @click="applyTemplate(tpl)"
                >
                  <div class="flex items-center gap-2">
                    <span class="font-medium">{{ tpl.name }}</span>
                    <span class="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded-full t-bg-subtle t-text-secondary">
                      {{ tpl.email_type }}
                    </span>
                    <span
                      v-if="!emailTemplates.isOwnedBy(tpl, orgId || '')"
                      class="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded-full bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-200"
                    >
                      Global
                    </span>
                  </div>
                  <p v-if="tpl.description" class="text-sm t-text-muted mt-0.5 truncate">
                    {{ tpl.description }}
                  </p>
                  <p v-if="tpl.subject" class="text-xs t-text-muted mt-0.5 truncate">
                    Subject: {{ tpl.subject }}
                  </p>
                </button>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" @click="showTemplatePicker = false">Cancel</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <!-- Save as Template -->
        <Dialog v-model:open="showSaveTemplate">
          <DialogContent class="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Save as template</DialogTitle>
              <DialogDescription>
                Save the current subject, content, type, greeting, and salutation as a reusable template.
              </DialogDescription>
            </DialogHeader>

            <div class="space-y-4">
              <div class="space-y-2">
                <Label for="tpl-name">Template name *</Label>
                <Input id="tpl-name" v-model="newTemplate.name" placeholder="e.g. Monthly Newsletter" />
              </div>
              <div class="space-y-2">
                <Label for="tpl-desc">Description</Label>
                <Input id="tpl-desc" v-model="newTemplate.description" placeholder="Optional — when to use this" />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" @click="showSaveTemplate = false">Cancel</Button>
              <Button :disabled="savingTemplate || !newTemplate.name.trim()" @click="saveAsTemplate">
                <Icon v-if="savingTemplate" name="lucide:loader-2" class="w-4 h-4 mr-2 animate-spin" />
                <Icon v-else name="lucide:bookmark-plus" class="w-4 h-4 mr-2" />
                Save template
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

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
              class="overflow-auto max-h-[70vh] border dark:border-stone-700 rounded-lg t-bg-subtle p-4"
            >
              <div
                class="bg-white dark:bg-stone-800 rounded shadow-sm"
                v-html="previewHtml"
              ></div>
            </div>
            <!-- Attachments in preview -->
            <div v-if="previewAttachments.length > 0" class="mt-4">
              <div class="text-sm font-medium t-text mb-2 flex items-center gap-2">
                <Icon name="lucide:paperclip" class="w-4 h-4" />
                Attachments ({{ previewAttachments.length }})
              </div>
              <div class="flex flex-wrap gap-2">
                <div
                  v-for="attachment in previewAttachments"
                  :key="attachment.id"
                  class="flex items-center gap-2 px-3 py-2 t-bg-subtle rounded-lg text-sm"
                >
                  <Icon :name="getFileIcon(attachment.type)" class="w-4 h-4 t-text-muted" />
                  <span class="font-medium">{{ attachment.filename }}</span>
                  <span class="t-text-muted">({{ formatFileSize(attachment.size) }})</span>
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
            <div class="flex items-center gap-1 text-sm border-b dark:border-stone-700 pb-2">
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
                  class="w-4 h-4 t-text-muted"
                />
              </template>
            </div>

            <!-- Search -->
            <div class="relative">
              <Icon
                name="lucide:search"
                class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 t-text-muted"
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
                  class="w-8 h-8 animate-spin t-text-muted"
                />
              </div>

              <div
                v-else-if="attachmentFolders.length === 0 && filteredAttachmentFiles.length === 0"
                class="flex flex-col items-center justify-center h-full t-text-muted"
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
                  class="flex flex-col items-center p-3 rounded-lg border dark:border-stone-700 hover:t-bg-subtle hover:t-border transition-colors"
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
                  class="flex flex-col items-center p-3 rounded-lg border dark:border-stone-700 hover:t-bg-subtle hover:border-primary transition-colors group"
                  :class="{ 'border-primary bg-primary/5': form.attachmentIds.includes(file.id) }"
                  @click="selectAttachmentFile(file)"
                >
                  <div
                    class="w-12 h-12 mb-2 flex items-center justify-center rounded t-bg-subtle"
                  >
                    <Icon
                      :name="getFileIcon(file.type || '')"
                      class="w-6 h-6 t-text-muted"
                    />
                  </div>
                  <span
                    class="text-sm text-center truncate w-full group-hover:text-primary"
                  >
                    {{ file.title || file.filename_download || "File" }}
                  </span>
                  <span class="text-xs t-text-muted">
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
