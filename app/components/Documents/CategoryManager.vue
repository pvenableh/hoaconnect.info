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
import type { HoaDocumentCategory } from "~~/types/directus";

const { list, create, update, remove } = useDirectusItems("hoa_document_categories");

// Get org context
const { selectedOrgId } = await useSelectedOrg();
const orgId = computed(() => selectedOrgId.value);

// UI state
const showDialog = ref(false);
const isEditing = ref(false);
const saving = ref(false);
const editingCategory = ref<HoaDocumentCategory | null>(null);

// Form state
const formData = ref({
  name: "",
  description: "",
  icon: "",
  sort_by_date: false,
});

// Available icons for selection
const availableIcons = [
  { name: "heroicons:scale", label: "Scale (Bylaws)" },
  { name: "heroicons:currency-dollar", label: "Dollar (Financial)" },
  { name: "heroicons:user-group", label: "Group (Minutes)" },
  { name: "heroicons:clipboard-document-list", label: "Clipboard (Agendas)" },
  { name: "heroicons:bell", label: "Bell (Notices)" },
  { name: "heroicons:folder", label: "Folder" },
  { name: "heroicons:document-text", label: "Document" },
  { name: "heroicons:calendar", label: "Calendar" },
  { name: "heroicons:megaphone", label: "Megaphone" },
  { name: "heroicons:home", label: "Home" },
  { name: "heroicons:wrench-screwdriver", label: "Maintenance" },
  { name: "heroicons:shield-check", label: "Security" },
];

// Fetch categories
const { data: categories, refresh } = await useAsyncData(
  `admin-doc-categories-${orgId.value}`,
  async () => {
    if (!orgId.value) return [];

    const result = await list({
      fields: ["id", "name", "slug", "description", "icon", "sort_by_date", "sort", "status"],
      filter: {
        organization: { _eq: orgId.value },
      },
      sort: ["sort", "name"],
    });

    return (result || []) as HoaDocumentCategory[];
  },
  {
    watch: [orgId],
    server: false,
  }
);

// Generate slug from name
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// Open dialog for new category
function openNewDialog() {
  isEditing.value = false;
  editingCategory.value = null;
  formData.value = {
    name: "",
    description: "",
    icon: "heroicons:folder",
    sort_by_date: false,
  };
  showDialog.value = true;
}

// Open dialog for editing category
function openEditDialog(category: HoaDocumentCategory) {
  isEditing.value = true;
  editingCategory.value = category;
  formData.value = {
    name: category.name || "",
    description: category.description || "",
    icon: category.icon || "heroicons:folder",
    sort_by_date: category.sort_by_date || false,
  };
  showDialog.value = true;
}

// Save category
async function saveCategory() {
  if (!formData.value.name.trim()) {
    toast.error("Category name is required");
    return;
  }

  saving.value = true;

  try {
    if (isEditing.value && editingCategory.value) {
      // Update existing
      await update(editingCategory.value.id, {
        name: formData.value.name.trim(),
        slug: generateSlug(formData.value.name),
        description: formData.value.description.trim() || null,
        icon: formData.value.icon || null,
        sort_by_date: formData.value.sort_by_date,
      });
      toast.success("Category updated");
    } else {
      // Create new
      await create({
        name: formData.value.name.trim(),
        slug: generateSlug(formData.value.name),
        description: formData.value.description.trim() || null,
        icon: formData.value.icon || null,
        sort_by_date: formData.value.sort_by_date,
        organization: orgId.value,
        status: "published",
      });
      toast.success("Category created");
    }

    showDialog.value = false;
    await refresh();
  } catch (error) {
    console.error("Failed to save category:", error);
    toast.error("Failed to save category");
  } finally {
    saving.value = false;
  }
}

// Delete category
async function deleteCategory(category: HoaDocumentCategory) {
  if (!confirm(`Delete "${category.name}"? Documents in this category will become uncategorized.`)) {
    return;
  }

  try {
    await remove(category.id);
    toast.success("Category deleted");
    await refresh();
  } catch (error) {
    console.error("Failed to delete category:", error);
    toast.error("Failed to delete category");
  }
}

// Predefined category templates
const predefinedCategories = [
  {
    name: "Bylaws & Governance",
    slug: "bylaws",
    description: "HOA bylaws, rules, regulations, and governing documents",
    icon: "heroicons:scale",
    sort_by_date: false,
  },
  {
    name: "Financial Documents",
    slug: "financials",
    description: "Budgets, financial reports, and statements",
    icon: "heroicons:currency-dollar",
    sort_by_date: true,
  },
  {
    name: "Meeting Minutes",
    slug: "minutes",
    description: "Board meeting and annual meeting minutes",
    icon: "heroicons:user-group",
    sort_by_date: true,
  },
  {
    name: "Meeting Agendas",
    slug: "agendas",
    description: "Upcoming meeting agendas and schedules",
    icon: "heroicons:clipboard-document-list",
    sort_by_date: true,
  },
  {
    name: "Community Notices",
    slug: "notices",
    description: "Announcements, newsletters, and community updates",
    icon: "heroicons:bell",
    sort_by_date: true,
  },
];

// Check which predefined categories already exist
const existingCategorySlugs = computed(() => {
  if (!categories.value) return new Set<string>();
  return new Set(categories.value.map(c => c.slug).filter(Boolean));
});

// Get available predefined categories (not yet created)
const availablePredefinedCategories = computed(() => {
  return predefinedCategories.filter(pc => !existingCategorySlugs.value.has(pc.slug));
});

// Create a single predefined category
const creatingPredefined = ref(false);
async function createPredefinedCategory(template: typeof predefinedCategories[0]) {
  creatingPredefined.value = true;
  try {
    await create({
      name: template.name,
      slug: template.slug,
      description: template.description,
      icon: template.icon,
      sort_by_date: template.sort_by_date,
      organization: orgId.value,
      status: "published",
    });
    toast.success(`Created "${template.name}" category`);
    await refresh();
  } catch (error) {
    console.error("Failed to create category:", error);
    toast.error("Failed to create category");
  } finally {
    creatingPredefined.value = false;
  }
}

// Create all predefined categories at once
async function createAllPredefinedCategories() {
  if (availablePredefinedCategories.value.length === 0) {
    toast.info("All predefined categories already exist");
    return;
  }

  creatingPredefined.value = true;
  try {
    for (const template of availablePredefinedCategories.value) {
      await create({
        name: template.name,
        slug: template.slug,
        description: template.description,
        icon: template.icon,
        sort_by_date: template.sort_by_date,
        organization: orgId.value,
        status: "published",
      });
    }
    toast.success(`Created ${availablePredefinedCategories.value.length} categories`);
    await refresh();
  } catch (error) {
    console.error("Failed to create categories:", error);
    toast.error("Failed to create categories");
  } finally {
    creatingPredefined.value = false;
  }
}
</script>

<template>
  <Card>
    <CardHeader>
      <div class="flex items-center justify-between">
        <div>
          <CardTitle>Document Categories</CardTitle>
          <CardDescription>Organize your documents into categories</CardDescription>
        </div>
        <Button @click="openNewDialog" size="sm">
          <Icon name="heroicons:plus" class="h-4 w-4 mr-2" />
          Add Category
        </Button>
      </div>
    </CardHeader>
    <CardContent>
      <!-- Category list -->
      <div v-if="categories && categories.length > 0" class="space-y-2">
        <div
          v-for="category in categories"
          :key="category.id"
          class="flex items-center gap-4 p-3 rounded-lg border bg-white hover:bg-stone-50 transition-colors"
        >
          <!-- Icon -->
          <div class="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Icon :name="category.icon || 'heroicons:folder'" class="h-5 w-5 text-primary" />
          </div>

          <!-- Info -->
          <div class="flex-1 min-w-0">
            <h4 class="font-medium text-stone-900">{{ category.name }}</h4>
            <p v-if="category.description" class="text-sm text-stone-500 truncate">
              {{ category.description }}
            </p>
            <div class="flex items-center gap-2 mt-1">
              <span
                v-if="category.sort_by_date"
                class="inline-flex items-center gap-1 text-xs text-stone-500"
              >
                <Icon name="heroicons:calendar" class="h-3 w-3" />
                Sorted by date
              </span>
              <span
                v-if="category.status === 'draft'"
                class="inline-flex items-center gap-1 text-xs text-amber-600"
              >
                <Icon name="heroicons:pencil" class="h-3 w-3" />
                Draft
              </span>
            </div>
          </div>

          <!-- Actions -->
          <div class="flex items-center gap-2">
            <Button variant="ghost" size="sm" @click="openEditDialog(category)">
              <Icon name="heroicons:pencil" class="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" @click="deleteCategory(category)">
              <Icon name="heroicons:trash" class="h-4 w-4 text-red-500" />
            </Button>
          </div>
        </div>
      </div>

      <!-- Empty state -->
      <div v-else class="text-center py-8 text-stone-500">
        <Icon name="heroicons:folder" class="h-12 w-12 mx-auto mb-3 text-stone-300" />
        <p>No categories yet. Create one to organize your documents.</p>
      </div>

      <!-- Quick Setup Section -->
      <div v-if="availablePredefinedCategories.length > 0" class="mt-6 pt-6 border-t">
        <div class="flex items-center justify-between mb-4">
          <div>
            <h4 class="font-medium text-stone-900">Quick Setup</h4>
            <p class="text-sm text-stone-500">Add common HOA document categories</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            @click="createAllPredefinedCategories"
            :disabled="creatingPredefined"
          >
            <Icon name="heroicons:sparkles" class="h-4 w-4 mr-2" />
            {{ creatingPredefined ? 'Creating...' : 'Add All' }}
          </Button>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          <button
            v-for="template in availablePredefinedCategories"
            :key="template.slug"
            @click="createPredefinedCategory(template)"
            :disabled="creatingPredefined"
            class="flex items-center gap-3 p-3 rounded-lg border border-dashed border-stone-300 hover:border-primary hover:bg-primary/5 transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div class="w-8 h-8 rounded-lg bg-stone-100 flex items-center justify-center flex-shrink-0">
              <Icon :name="template.icon" class="h-4 w-4 text-stone-600" />
            </div>
            <div class="min-w-0">
              <p class="text-sm font-medium text-stone-900 truncate">{{ template.name }}</p>
              <p class="text-xs text-stone-500 truncate">{{ template.description }}</p>
            </div>
            <Icon name="heroicons:plus" class="h-4 w-4 text-stone-400 ml-auto flex-shrink-0" />
          </button>
        </div>
      </div>
    </CardContent>
  </Card>

  <!-- Add/Edit Dialog -->
  <Dialog v-model:open="showDialog">
    <DialogContent class="sm:max-w-[500px]">
      <DialogHeader>
        <DialogTitle>{{ isEditing ? 'Edit Category' : 'New Category' }}</DialogTitle>
        <DialogDescription>
          {{ isEditing ? 'Update the category details.' : 'Create a new document category.' }}
        </DialogDescription>
      </DialogHeader>

      <div class="grid gap-4 py-4">
        <!-- Name -->
        <div class="grid gap-2">
          <Label for="cat-name">Name</Label>
          <Input
            id="cat-name"
            v-model="formData.name"
            placeholder="e.g., Meeting Minutes"
          />
        </div>

        <!-- Description -->
        <div class="grid gap-2">
          <Label for="cat-desc">Description (optional)</Label>
          <Textarea
            id="cat-desc"
            v-model="formData.description"
            placeholder="Brief description of this category"
            rows="2"
          />
        </div>

        <!-- Icon -->
        <div class="grid gap-2">
          <Label>Icon</Label>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="icon in availableIcons"
              :key="icon.name"
              type="button"
              @click="formData.icon = icon.name"
              :class="[
                'w-10 h-10 rounded-lg border-2 flex items-center justify-center transition-colors',
                formData.icon === icon.name
                  ? 'border-primary bg-primary/10'
                  : 'border-stone-200 hover:border-stone-300'
              ]"
              :title="icon.label"
            >
              <Icon :name="icon.name" class="h-5 w-5" />
            </button>
          </div>
        </div>

        <!-- Sort by date toggle -->
        <div class="flex items-center gap-3">
          <Switch
            id="sort-by-date"
            :checked="formData.sort_by_date"
            @update:checked="formData.sort_by_date = $event"
          />
          <Label for="sort-by-date" class="cursor-pointer">
            Sort documents by date
            <span class="block text-sm font-normal text-stone-500">
              Enable for categories like meeting minutes or agendas
            </span>
          </Label>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" @click="showDialog = false" :disabled="saving">
          Cancel
        </Button>
        <Button @click="saveCategory" :disabled="saving">
          {{ saving ? 'Saving...' : (isEditing ? 'Update' : 'Create') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
