<script setup lang="ts">
import { toast } from "vue-sonner";

definePageMeta({
  middleware: "auth",
  layout: "auth",
});

const { user } = useDirectusAuth();
const { fetchItems, create, update, deleteOne } = useDirectusItems();
const { selectedOrgId } = useSelectedOrg();

const orgId = computed(() => selectedOrgId.value);

// Fetch units
const { data: units, refresh } = await useAsyncData(
  `units-${orgId.value}`,
  async () => {
    if (!orgId.value) return [];
    const result = await fetchItems("hoa_units", {
      fields: ["id", "unit_number", "status"],
      filter: {
        organization: { _eq: orgId.value },
        status: { _in: ["published", "draft"] },
      },
      sort: ["sort", "unit_number"],
    });
    return result || [];
  }
);

// Add/edit modal
const showModal = ref(false);
const editingId = ref<string | null>(null);
const form = reactive({
  unit_number: "",
  status: "published",
});

const resetForm = () => {
  form.unit_number = "";
  form.status = "published";
  editingId.value = null;
};

const handleAdd = () => {
  resetForm();
  showModal.value = true;
};

const handleEdit = (unit: any) => {
  form.unit_number = unit.unit_number;
  form.status = unit.status;
  editingId.value = unit.id;
  showModal.value = true;
};

const handleSubmit = async () => {
  if (!form.unit_number) {
    toast.error("Unit number is required");
    return;
  }

  if (!orgId.value) {
    toast.error("No organization selected");
    return;
  }

  try {
    if (editingId.value) {
      await update("hoa_units", editingId.value, form);
      toast.success("Unit updated");
    } else {
      await create("hoa_units", {
        ...form,
        organization: orgId.value,
        sort: 0,
      });
      toast.success("Unit added");
    }

    await refresh();
    showModal.value = false;
    resetForm();
  } catch (error) {
    toast.error("Failed to save unit");
  }
};

const handleDelete = async (id: string) => {
  if (!confirm("Delete this unit? This will affect any people assigned to it."))
    return;

  try {
    await deleteOne("hoa_units", id);
    await refresh();
    toast.success("Unit deleted");
  } catch (error) {
    toast.error("Failed to delete unit");
  }
};
</script>

<template>
  <div class="min-h-screen bg-stone-50">
    <div class="p-6">
      <div class="max-w-4xl mx-auto space-y-6">
        <!-- Header -->
        <div class="flex justify-between items-center">
          <h1 class="text-3xl font-bold">Units</h1>
          <Button @click="handleAdd">Add Unit</Button>
        </div>

        <!-- Units Grid -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card v-for="unit in units" :key="unit.id" class="relative">
            <CardHeader>
              <CardTitle class="text-center text-2xl">{{
                unit.unit_number
              }}</CardTitle>
              <CardDescription class="text-center capitalize">{{
                unit.status
              }}</CardDescription>
            </CardHeader>
            <CardFooter class="flex gap-2">
              <Button
                @click="handleEdit(unit)"
                variant="outline"
                size="sm"
                class="flex-1"
              >
                Edit
              </Button>
              <Button
                @click="handleDelete(unit.id)"
                variant="destructive"
                size="sm"
                class="flex-1"
              >
                Delete
              </Button>
            </CardFooter>
          </Card>

          <div
            v-if="!units?.length"
            class="col-span-full text-center py-12 text-stone-500"
          >
            No units added yet
          </div>
        </div>

        <!-- Add/Edit Modal -->
        <div
          v-if="showModal"
          class="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
        >
          <Card class="w-full max-w-md">
            <CardHeader>
              <CardTitle>{{ editingId ? "Edit" : "Add" }} Unit</CardTitle>
            </CardHeader>
            <CardContent class="space-y-4">
              <div>
                <label class="text-sm font-medium mb-2 block"
                  >Unit Number *</label
                >
                <Input v-model="form.unit_number" placeholder="101" />
              </div>

              <div>
                <label class="text-sm font-medium mb-2 block">Status</label>
                <select v-model="form.status" class="w-full p-2 border rounded">
                  <option value="published">Published</option>
                  <option value="draft">Draft</option>
                </select>
              </div>

              <div class="flex gap-2">
                <Button @click="handleSubmit" class="flex-1">Save</Button>
                <Button
                  @click="
                    showModal = false;
                    resetForm();
                  "
                  variant="outline"
                  class="flex-1"
                >
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  </div>
</template>
