<script setup lang="ts">
import { toast } from "vue-sonner";
import type { HoaAnnouncement } from "#core/types/directus";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const {
  list: listAnnouncements,
  create: createAnnouncement,
  update: updateAnnouncement,
  remove: removeAnnouncement,
} = useDirectusItems("hoa_announcements");

const { buildOrgPath } = useOrgNavigation();

// Await to ensure org is loaded during SSR
// Declared before the await: composables must not run after a top-level await.
const activeTab = useTabQuery({
  values: ["all", "published", "draft", "archived"],
  fallback: "all",
});

const { currentOrg, selectedOrgId, isLoading } = await useSelectedOrg();

// Computed organization from the composable
const organization = computed(() => currentOrg.value?.organization || null);

// Use selectedOrgId directly (primitive value) for immediate reactivity
const orgId = computed(() => selectedOrgId.value);

// Current tab


// Announcement type options
const typeOptions = [
  { value: "general", label: "General", icon: "megaphone", color: "t-text-secondary t-bg-subtle" },
  { value: "urgent", label: "Urgent", icon: "alert-triangle", color: "text-red-600 bg-red-50" },
  { value: "maintenance", label: "Maintenance", icon: "wrench", color: "text-amber-600 bg-amber-50" },
  { value: "event", label: "Event", icon: "calendar", color: "text-blue-600 bg-blue-50" },
  { value: "reminder", label: "Reminder", icon: "bell", color: "text-purple-600 bg-purple-50" },
];

// Target audience options
const audienceOptions = [
  { value: "all", label: "All Members" },
  { value: "owners", label: "Owners Only" },
  { value: "tenants", label: "Tenants Only" },
  { value: "board members", label: "Board Members Only" },
];

// Status options
const statusOptions = [
  { value: "published", label: "Published" },
  { value: "draft", label: "Draft" },
  { value: "archived", label: "Archived" },
];

// Get type display info
const getTypeInfo = (type: string | null | undefined) => {
  return typeOptions.find((t) => t.value === type) || typeOptions[0];
};

// Get audience display
const getAudienceDisplay = (audience: string | null | undefined) => {
  const option = audienceOptions.find((a) => a.value === audience);
  return option?.label || "All Members";
};

// Fetch announcements list
const { data: announcements, refresh: refreshAnnouncements } = await useAsyncData(
  `hoa-announcements-admin-${orgId.value}`,
  async () => {
    if (!orgId.value) return [];

    try {
      const result = (await listAnnouncements({
        fields: [
          "id",
          "title",
          "content",
          "status",
          "announcement_type",
          "target_audience",
          "publish_date",
          "expiry_date",
          "is_pinned",
          "date_created",
          "date_updated",
          "user_created.first_name",
          "user_created.last_name",
        ],
        filter: {
          organization: { _eq: orgId.value },
        },
        sort: ["-is_pinned", "-date_created"],
      })) as any[];

      return result || [];
    } catch (error) {
      console.error("Error fetching announcements:", error);
      return [];
    }
  },
  {
    watch: [orgId],
    server: false,
  }
);

// Filter announcements by tab
const filteredAnnouncements = computed(() => {
  if (!announcements.value) return [];
  if (activeTab.value === "all") return announcements.value;
  return announcements.value.filter((a: any) => a.status === activeTab.value);
});

// Count by status
const tabItems = computed(() => [
  { value: "all", label: "All", icon: "lucide:list", count: statusCounts.value.all },
  { value: "published", label: "Published", icon: "lucide:check-circle", count: statusCounts.value.published },
  { value: "draft", label: "Drafts", icon: "lucide:file-pen", count: statusCounts.value.draft },
  { value: "archived", label: "Archived", icon: "lucide:archive", count: statusCounts.value.archived },
]);

const statusCounts = computed(() => {
  if (!announcements.value) return { all: 0, published: 0, draft: 0, archived: 0 };
  return {
    all: announcements.value.length,
    published: announcements.value.filter((a: any) => a.status === "published").length,
    draft: announcements.value.filter((a: any) => a.status === "draft").length,
    archived: announcements.value.filter((a: any) => a.status === "archived").length,
  };
});

// Modal state
const showModal = ref(false);
const editingId = ref<string | null>(null);

// Default time is 5PM EST (17:00)
const DEFAULT_TIME = "17:00";

const form = reactive({
  title: "",
  content: "",
  status: "draft" as "published" | "draft" | "archived",
  announcement_type: "general" as "general" | "urgent" | "maintenance" | "event" | "reminder",
  target_audience: "all" as "all" | "owners" | "tenants" | "board members",
  publish_date: "",
  publish_time: DEFAULT_TIME,
  expiry_date: "",
  expiry_time: DEFAULT_TIME,
  is_pinned: false,
});

// Helper to parse datetime into date and time parts
const parseDatetime = (datetime: string | null | undefined) => {
  if (!datetime) return { date: "", time: DEFAULT_TIME };
  const d = new Date(datetime);
  const date = d.toISOString().split("T")[0];
  const hours = d.getHours().toString().padStart(2, "0");
  const minutes = d.getMinutes().toString().padStart(2, "0");
  return { date, time: `${hours}:${minutes}` };
};

// Helper to combine date and time into ISO datetime string (EST timezone)
const combineDatetime = (date: string, time: string) => {
  if (!date) return null;
  // Create datetime string and append EST offset (-05:00)
  return `${date}T${time || DEFAULT_TIME}:00.000-05:00`;
};

const resetForm = () => {
  form.title = "";
  form.content = "";
  form.status = "draft";
  form.announcement_type = "general";
  form.target_audience = "all";
  form.publish_date = "";
  form.publish_time = DEFAULT_TIME;
  form.expiry_date = "";
  form.expiry_time = DEFAULT_TIME;
  form.is_pinned = false;
  editingId.value = null;
};

const handleAdd = () => {
  resetForm();
  showModal.value = true;
};

const handleEdit = (announcement: any) => {
  form.title = announcement.title || "";
  form.content = announcement.content || "";
  form.status = announcement.status || "draft";
  form.announcement_type = announcement.announcement_type || "general";
  form.target_audience = announcement.target_audience || "all";

  const publishParsed = parseDatetime(announcement.publish_date);
  form.publish_date = publishParsed.date;
  form.publish_time = publishParsed.time;

  const expiryParsed = parseDatetime(announcement.expiry_date);
  form.expiry_date = expiryParsed.date;
  form.expiry_time = expiryParsed.time;

  form.is_pinned = announcement.is_pinned || false;
  editingId.value = announcement.id;
  showModal.value = true;
};

const handleSubmit = async () => {
  if (!organization.value?.id) {
    toast.error("No organization selected");
    return;
  }

  if (!form.title.trim()) {
    toast.error("Title is required");
    return;
  }

  try {
    const data = {
      title: form.title,
      content: form.content,
      status: form.status,
      announcement_type: form.announcement_type,
      target_audience: form.target_audience,
      publish_date: combineDatetime(form.publish_date, form.publish_time),
      expiry_date: combineDatetime(form.expiry_date, form.expiry_time),
      is_pinned: form.is_pinned,
    };

    if (editingId.value) {
      await updateAnnouncement(editingId.value, data);
      toast.success("Announcement updated");
    } else {
      await createAnnouncement({
        ...data,
        organization: organization.value.id,
      });
      toast.success("Announcement created");
    }

    await refreshAnnouncements();
    showModal.value = false;
    resetForm();
  } catch (error: any) {
    console.error("Save error:", error);
    toast.error(error.message || "Failed to save announcement");
  }
};

const handleDelete = async (id: string) => {
  if (!confirm("Delete this announcement? This cannot be undone.")) return;

  try {
    await removeAnnouncement(id);
    await refreshAnnouncements();
    toast.success("Announcement deleted");
  } catch (error) {
    toast.error("Failed to delete announcement");
  }
};

const handleTogglePin = async (announcement: any) => {
  try {
    await updateAnnouncement(announcement.id, {
      is_pinned: !announcement.is_pinned,
    });
    await refreshAnnouncements();
    toast.success(announcement.is_pinned ? "Announcement unpinned" : "Announcement pinned");
  } catch (error) {
    toast.error("Failed to update announcement");
  }
};

const handleQuickPublish = async (announcement: any) => {
  try {
    await updateAnnouncement(announcement.id, {
      status: "published",
    });
    await refreshAnnouncements();
    toast.success("Announcement published");
  } catch (error) {
    toast.error("Failed to publish announcement");
  }
};

const formatDate = (date: string | null | undefined) => {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

const formatDateTime = (datetime: string | null | undefined) => {
  if (!datetime) return "—";
  const d = new Date(datetime);
  const date = d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const time = d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return `${date} at ${time}`;
};

const isExpired = (expiryDate: string | null | undefined) => {
  if (!expiryDate) return false;
  return new Date(expiryDate) < new Date();
};

// Draft used to be `bg-yellow-100 text-yellow-800` with no dark pair, so a draft
// badge in dark mode was near-black text on near-white. The status tokens carry
// both grounds, so there is nothing left to forget.
const getStatusBadgeClass = (status: string | null | undefined) => {
  switch (status) {
    case "published":
      return "bg-success/15 text-success";
    case "draft":
      return "bg-warning/15 text-warning";
    default:
      return "t-bg-subtle t-text-secondary";
  }
};

// Title carries the row on a phone; type, audience and the two dates are the
// context you read on a wide screen.
const announcementColumns = [
  { key: "title", label: "Title", sortable: true },
  { key: "announcement_type", label: "Type", sortable: true, hideOnMobile: true },
  { key: "target_audience", label: "Audience", hideOnMobile: true },
  { key: "status", label: "Status", sortable: true },
  { key: "publish_date", label: "Publish Date", sortable: true, hideOnMobile: true, class: "whitespace-nowrap" },
  { key: "expiry_date", label: "Expiry", sortable: true, hideOnMobile: true, class: "whitespace-nowrap" },
  { key: "actions", label: "Actions", align: "right" as const },
];

// A published announcement that has already expired is still on the list but is
// no longer doing its job, so the row says so at a glance.
const announcementRowClass = (row: any) =>
  isExpired(row.expiry_date) && row.status === "published" ? "bg-destructive/[0.06]" : undefined;

useSeoMeta({
  title: "Manage Announcements",
  description: "Create and manage community announcements",
});
</script>

<template>
  <div class="ui-kit accent-amber min-h-screen t-bg">
    <PageContainer>
        <WidgetGlass strong class="mb-8">
          <p class="text-xs uppercase tracking-widest t-text-tertiary mb-1.5">Announcements</p>
          <h1 class="text-3xl font-semibold tracking-tight t-text">Manage Announcements</h1>
          <p class="t-text-secondary mt-1">
            Create and manage announcements for your community
          </p>
        </WidgetGlass>

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

          <AppSegmentedControl v-model="activeTab" :items="tabItems" label="Announcement views" />

          <!-- Action Buttons -->
          <div class="flex justify-end">
            <Button @click="handleAdd">
              <Icon name="lucide:plus" class="w-4 h-4 mr-2" />
              New Announcement
            </Button>
          </div>

          <!-- Announcements Table -->
          <Card>
            <CardContent class="pt-6">
              <AppDataTable
                :columns="announcementColumns"
                :rows="filteredAnnouncements"
                :row-class="announcementRowClass"
                :filtered="activeTab !== 'all'"
                empty-title="No announcements yet"
                empty-description="Create your first announcement to keep your community informed."
                empty-icon="lucide:megaphone"
              >
                <template #cell-title="{ row }">
                  <div class="flex items-center gap-2">
                    <Icon v-if="row.is_pinned" name="lucide:pin" class="w-4 h-4 text-warning shrink-0" title="Pinned" />
                    <span class="font-medium">{{ row.title }}</span>
                  </div>
                  <p v-if="row.content" class="text-xs t-text-muted line-clamp-1 mt-1" v-html="row.content" />
                </template>

                <template #cell-announcement_type="{ row }">
                  <span
                    class="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium"
                    :class="getTypeInfo(row.announcement_type).color"
                  >
                    <Icon :name="'lucide:' + getTypeInfo(row.announcement_type).icon" class="w-3 h-3" />
                    {{ getTypeInfo(row.announcement_type).label }}
                  </span>
                </template>

                <template #cell-target_audience="{ value }">
                  <span class="text-sm">{{ getAudienceDisplay(value as string) }}</span>
                </template>

                <template #cell-status="{ value }">
                  <span class="text-xs px-2 py-1 rounded-full font-medium capitalize" :class="getStatusBadgeClass(value as string)">
                    {{ value }}
                  </span>
                </template>

                <template #cell-publish_date="{ value }">
                  <span class="text-sm">{{ formatDateTime(value as string) }}</span>
                </template>

                <template #cell-expiry_date="{ value }">
                  <span class="text-sm" :class="{ 'text-destructive font-medium': isExpired(value as string) }">
                    {{ formatDateTime(value as string) }}
                  </span>
                  <span v-if="isExpired(value as string)" class="text-xs text-destructive block">Expired</span>
                </template>

                <template #cell-actions="{ row }">
                  <div class="flex items-center justify-end gap-1">
                    <Button
                      v-if="row.status === 'draft'"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Publish announcement"
                      title="Publish"
                      @click="handleQuickPublish(row)"
                    >
                      <Icon name="lucide:send" class="text-success" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      :aria-label="row.is_pinned ? 'Unpin announcement' : 'Pin announcement'"
                      :title="row.is_pinned ? 'Unpin' : 'Pin'"
                      @click="handleTogglePin(row)"
                    >
                      <Icon
                        :name="row.is_pinned ? 'lucide:pin-off' : 'lucide:pin'"
                        :class="{ 'text-warning': row.is_pinned }"
                      />
                    </Button>
                    <Button variant="outline" size="icon-sm" aria-label="Edit announcement" @click="handleEdit(row)">
                      <Icon name="lucide:edit" />
                    </Button>
                    <Button variant="destructive" size="icon-sm" aria-label="Delete announcement" @click="handleDelete(row.id)">
                      <Icon name="lucide:trash-2" />
                    </Button>
                  </div>
                </template>

                <template #empty>
                  <AppEmptyState
                    icon="lucide:megaphone"
                    title="No announcements yet"
                    description="Create your first announcement to keep your community informed."
                    compact
                  >
                    <Button @click="handleAdd">
                      <Icon name="lucide:plus" />
                      Create Announcement
                    </Button>
                  </AppEmptyState>
                </template>
              </AppDataTable>
            </CardContent>
          </Card>

          <!-- Add/Edit Modal -->
          <Dialog v-model:open="showModal">
            <DialogContent class="sm:max-w-[600px]">
              <DialogHeader>
                <DialogTitle>
                  {{ editingId ? "Edit" : "Create" }} Announcement
                </DialogTitle>
                <DialogDescription>
                  {{ editingId ? "Update" : "Create a new" }} announcement for your community
                </DialogDescription>
              </DialogHeader>
              <div class="grid gap-4 py-4 max-h-[60vh] overflow-y-auto">
                <div class="grid gap-2">
                  <Label for="title">Title <span class="text-red-500">*</span></Label>
                  <Input
                    id="title"
                    v-model="form.title"
                    placeholder="Enter announcement title"
                    required
                  />
                </div>

                <div class="grid gap-2">
                  <Label for="content">Content</Label>
                  <Textarea
                    id="content"
                    v-model="form.content"
                    placeholder="Enter announcement content..."
                    rows="4"
                  />
                </div>

                <div class="grid grid-cols-2 gap-4">
                  <div class="grid gap-2">
                    <Label for="type">Type</Label>
                    <select
                      id="type"
                      v-model="form.announcement_type"
                      class="w-full p-2 border rounded"
                    >
                      <option
                        v-for="option in typeOptions"
                        :key="option.value"
                        :value="option.value"
                      >
                        {{ option.label }}
                      </option>
                    </select>
                  </div>
                  <div class="grid gap-2">
                    <Label for="audience">Target Audience</Label>
                    <select
                      id="audience"
                      v-model="form.target_audience"
                      class="w-full p-2 border rounded"
                    >
                      <option
                        v-for="option in audienceOptions"
                        :key="option.value"
                        :value="option.value"
                      >
                        {{ option.label }}
                      </option>
                    </select>
                  </div>
                </div>

                <div class="grid grid-cols-2 gap-4">
                  <div class="grid gap-2">
                    <Label for="publish-date">Publish Date & Time</Label>
                    <div class="flex gap-2">
                      <Input
                        id="publish-date"
                        v-model="form.publish_date"
                        type="date"
                        class="flex-1"
                      />
                      <Input
                        id="publish-time"
                        v-model="form.publish_time"
                        type="time"
                        class="w-28"
                        :disabled="!form.publish_date"
                      />
                    </div>
                    <p class="text-xs t-text-muted">
                      Leave empty to publish immediately. Default: 5:00 PM EST
                    </p>
                  </div>
                  <div class="grid gap-2">
                    <Label for="expiry-date">Expiry Date & Time</Label>
                    <div class="flex gap-2">
                      <Input
                        id="expiry-date"
                        v-model="form.expiry_date"
                        type="date"
                        class="flex-1"
                      />
                      <Input
                        id="expiry-time"
                        v-model="form.expiry_time"
                        type="time"
                        class="w-28"
                        :disabled="!form.expiry_date"
                      />
                    </div>
                    <p class="text-xs t-text-muted">
                      Leave empty for no expiry. Default: 5:00 PM EST
                    </p>
                  </div>
                </div>

                <div class="grid gap-2">
                  <Label for="status">Status</Label>
                  <select
                    id="status"
                    v-model="form.status"
                    class="w-full p-2 border rounded"
                  >
                    <option
                      v-for="option in statusOptions"
                      :key="option.value"
                      :value="option.value"
                    >
                      {{ option.label }}
                    </option>
                  </select>
                </div>

                <div class="flex items-center gap-2">
                  <input
                    id="pinned"
                    type="checkbox"
                    v-model="form.is_pinned"
                    class="h-4 w-4 rounded t-border"
                  />
                  <Label for="pinned" class="font-normal cursor-pointer">
                    Pin this announcement (appears at the top)
                  </Label>
                </div>
              </div>
              <DialogFooter>
                <Button
                  @click="showModal = false; resetForm();"
                  variant="outline"
                >
                  Cancel
                </Button>
                <Button @click="handleSubmit">
                  {{ editingId ? "Update" : "Create" }}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </PageContainer>
  </div>
</template>
