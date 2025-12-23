<script setup lang="ts">
import { toast } from "vue-sonner";
import type { HoaAnnouncement } from "~~/types/directus";
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
const { currentOrg, selectedOrgId, isLoading } = await useSelectedOrg();

// Computed organization from the composable
const organization = computed(() => currentOrg.value?.organization || null);

// Use selectedOrgId directly (primitive value) for immediate reactivity
const orgId = computed(() => selectedOrgId.value);

// Current tab
const activeTab = ref<"all" | "published" | "draft" | "archived">("all");

// Announcement type options
const typeOptions = [
  { value: "general", label: "General", icon: "megaphone", color: "text-stone-600 bg-stone-50" },
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
const form = reactive({
  title: "",
  content: "",
  status: "draft" as "published" | "draft" | "archived",
  announcement_type: "general" as "general" | "urgent" | "maintenance" | "event" | "reminder",
  target_audience: "all" as "all" | "owners" | "tenants" | "board members",
  publish_date: "",
  expiry_date: "",
  is_pinned: false,
});

const resetForm = () => {
  form.title = "";
  form.content = "";
  form.status = "draft";
  form.announcement_type = "general";
  form.target_audience = "all";
  form.publish_date = "";
  form.expiry_date = "";
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
  form.publish_date = announcement.publish_date ? announcement.publish_date.split("T")[0] : "";
  form.expiry_date = announcement.expiry_date ? announcement.expiry_date.split("T")[0] : "";
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
      publish_date: form.publish_date || null,
      expiry_date: form.expiry_date || null,
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

const isExpired = (expiryDate: string | null | undefined) => {
  if (!expiryDate) return false;
  return new Date(expiryDate) < new Date();
};

const getStatusBadgeClass = (status: string | null | undefined) => {
  switch (status) {
    case "published":
      return "bg-green-100 text-green-800";
    case "draft":
      return "bg-yellow-100 text-yellow-800";
    case "archived":
      return "bg-stone-100 text-stone-600";
    default:
      return "bg-stone-100 text-stone-600";
  }
};

useSeoMeta({
  title: "Manage Announcements",
  description: "Create and manage community announcements",
});
</script>

<template>
  <div class="min-h-screen bg-stone-50">
    <div class="p-6">
      <div class="max-w-7xl mx-auto">
        <div class="mb-8">
          <h1 class="text-3xl font-bold mb-2">Manage Announcements</h1>
          <p class="text-stone-600">
            Create and manage announcements for your community
          </p>
        </div>

        <!-- Loading State -->
        <div v-if="isLoading" class="text-center py-12">
          <Icon
            name="lucide:loader-2"
            class="w-8 h-8 animate-spin mx-auto mb-4"
          />
          <p class="text-sm text-stone-600">Loading your organization...</p>
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

          <!-- Tabs -->
          <div class="border-b border-stone-200">
            <nav class="flex space-x-8">
              <button
                @click="activeTab = 'all'"
                :class="[
                  'py-4 px-1 border-b-2 font-medium text-sm transition-colors',
                  activeTab === 'all'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-stone-600 hover:text-stone-900 hover:border-stone-300',
                ]"
              >
                All ({{ statusCounts.all }})
              </button>
              <button
                @click="activeTab = 'published'"
                :class="[
                  'py-4 px-1 border-b-2 font-medium text-sm transition-colors',
                  activeTab === 'published'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-stone-600 hover:text-stone-900 hover:border-stone-300',
                ]"
              >
                <Icon name="lucide:check-circle" class="w-4 h-4 inline mr-1" />
                Published ({{ statusCounts.published }})
              </button>
              <button
                @click="activeTab = 'draft'"
                :class="[
                  'py-4 px-1 border-b-2 font-medium text-sm transition-colors',
                  activeTab === 'draft'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-stone-600 hover:text-stone-900 hover:border-stone-300',
                ]"
              >
                <Icon name="lucide:file-edit" class="w-4 h-4 inline mr-1" />
                Drafts ({{ statusCounts.draft }})
              </button>
              <button
                @click="activeTab = 'archived'"
                :class="[
                  'py-4 px-1 border-b-2 font-medium text-sm transition-colors',
                  activeTab === 'archived'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-stone-600 hover:text-stone-900 hover:border-stone-300',
                ]"
              >
                <Icon name="lucide:archive" class="w-4 h-4 inline mr-1" />
                Archived ({{ statusCounts.archived }})
              </button>
            </nav>
          </div>

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
              <div class="overflow-x-auto">
                <table class="w-full">
                  <thead>
                    <tr class="border-b">
                      <th class="text-left p-3">Title</th>
                      <th class="text-left p-3">Type</th>
                      <th class="text-left p-3">Audience</th>
                      <th class="text-left p-3">Status</th>
                      <th class="text-left p-3">Publish Date</th>
                      <th class="text-left p-3">Expiry</th>
                      <th class="text-right p-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="announcement in filteredAnnouncements"
                      :key="announcement.id"
                      class="border-b hover:bg-stone-50"
                      :class="{ 'bg-red-50/30': isExpired(announcement.expiry_date) && announcement.status === 'published' }"
                    >
                      <td class="p-3">
                        <div class="flex items-center gap-2">
                          <span
                            v-if="announcement.is_pinned"
                            class="text-amber-500"
                            title="Pinned"
                          >
                            <Icon name="lucide:pin" class="w-4 h-4" />
                          </span>
                          <span class="font-medium">{{ announcement.title }}</span>
                        </div>
                        <p
                          v-if="announcement.content"
                          class="text-xs text-stone-500 line-clamp-1 mt-1"
                          v-html="announcement.content"
                        />
                      </td>
                      <td class="p-3">
                        <span
                          class="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium"
                          :class="getTypeInfo(announcement.announcement_type).color"
                        >
                          <Icon
                            :name="'lucide:' + getTypeInfo(announcement.announcement_type).icon"
                            class="w-3 h-3"
                          />
                          {{ getTypeInfo(announcement.announcement_type).label }}
                        </span>
                      </td>
                      <td class="p-3 text-sm">
                        {{ getAudienceDisplay(announcement.target_audience) }}
                      </td>
                      <td class="p-3">
                        <span
                          class="text-xs px-2 py-1 rounded font-medium"
                          :class="getStatusBadgeClass(announcement.status)"
                        >
                          {{ announcement.status }}
                        </span>
                      </td>
                      <td class="p-3 text-sm">
                        {{ formatDate(announcement.publish_date) }}
                      </td>
                      <td class="p-3 text-sm">
                        <span
                          :class="{
                            'text-red-600 font-medium': isExpired(announcement.expiry_date),
                          }"
                        >
                          {{ formatDate(announcement.expiry_date) }}
                        </span>
                        <span
                          v-if="isExpired(announcement.expiry_date)"
                          class="text-xs text-red-600 block"
                        >
                          Expired
                        </span>
                      </td>
                      <td class="p-3 text-right">
                        <div class="flex items-center justify-end gap-1">
                          <Button
                            v-if="announcement.status === 'draft'"
                            @click="handleQuickPublish(announcement)"
                            variant="ghost"
                            size="sm"
                            title="Publish"
                          >
                            <Icon name="lucide:send" class="w-4 h-4 text-green-600" />
                          </Button>
                          <Button
                            @click="handleTogglePin(announcement)"
                            variant="ghost"
                            size="sm"
                            :title="announcement.is_pinned ? 'Unpin' : 'Pin'"
                          >
                            <Icon
                              :name="announcement.is_pinned ? 'lucide:pin-off' : 'lucide:pin'"
                              class="w-4 h-4"
                              :class="{ 'text-amber-500': announcement.is_pinned }"
                            />
                          </Button>
                          <Button
                            @click="handleEdit(announcement)"
                            variant="outline"
                            size="sm"
                          >
                            <Icon name="lucide:edit" class="w-4 h-4" />
                          </Button>
                          <Button
                            @click="handleDelete(announcement.id)"
                            variant="destructive"
                            size="sm"
                          >
                            <Icon name="lucide:trash-2" class="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div
                v-if="!filteredAnnouncements?.length"
                class="text-center py-12 text-stone-500"
              >
                <Icon
                  name="lucide:megaphone"
                  class="w-12 h-12 mx-auto mb-4 text-stone-400"
                />
                <p class="font-medium">No announcements found</p>
                <p class="text-sm mt-1">
                  Create your first announcement to keep your community informed
                </p>
                <Button @click="handleAdd" class="mt-4">
                  <Icon name="lucide:plus" class="w-4 h-4 mr-2" />
                  Create Announcement
                </Button>
              </div>
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
                    <Label for="publish-date">Publish Date</Label>
                    <Input
                      id="publish-date"
                      v-model="form.publish_date"
                      type="date"
                    />
                    <p class="text-xs text-stone-500">
                      Leave empty to publish immediately
                    </p>
                  </div>
                  <div class="grid gap-2">
                    <Label for="expiry-date">Expiry Date</Label>
                    <Input
                      id="expiry-date"
                      v-model="form.expiry_date"
                      type="date"
                    />
                    <p class="text-xs text-stone-500">
                      Leave empty for no expiry
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
                    class="h-4 w-4 rounded border-stone-300"
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
      </div>
    </div>
  </div>
</template>
