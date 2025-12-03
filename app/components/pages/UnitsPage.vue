<script setup lang="ts">
import { toast } from "vue-sonner";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";

const {
  list: listUnits,
  create: createUnit,
  update: updateUnit,
  remove: removeUnit,
} = useDirectusItems("hoa_units");

// Await to ensure org is loaded during SSR
const { selectedOrgId, currentOrg, isLoading } = await useSelectedOrg();

const orgId = computed(() => selectedOrgId.value);
const organization = computed(() => currentOrg.value?.organization || null);

// Fetch units
const {
  data: units,
  refresh,
  error: unitsError,
} = await useAsyncData(
  `units-${orgId.value}`,
  async () => {
    if (!orgId.value) {
      return [];
    }

    try {
      const query = {
        fields: ["id", "unit_number", "status"],
        filter: {
          organization: { _eq: orgId.value },
          status: { _in: ["active", "inactive"] as ("active" | "inactive")[] },
        },
        sort: ["sort", "unit_number"],
      };

      const result = await listUnits(query);

      return result || [];
    } catch (error) {
      console.error("Error fetching units:", error);
      throw error;
    }
  },
  {
    watch: [orgId],
    server: false,
  }
);

// Add/edit modal
const showModal = ref(false);
const editingId = ref<string | null>(null);
const form = reactive({
  unit_number: "",
  status: "active",
});

const resetForm = () => {
  form.unit_number = "";
  form.status = "active";
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
      await updateUnit(editingId.value, form);
      toast.success("Unit updated");
    } else {
      await createUnit({
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
    await removeUnit(id);
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
        <template v-else>
          <!-- Error State -->
          <div v-if="unitsError" class="mb-4">
            <Alert variant="destructive">
              <Icon name="lucide:alert-circle" class="w-4 h-4" />
              <AlertTitle>Error Loading Units</AlertTitle>
              <AlertDescription>
                {{ unitsError.message || "Failed to load units" }}
              </AlertDescription>
            </Alert>
          </div>

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
                  <select
                    v-model="form.status"
                    class="w-full p-2 border rounded"
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
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
        </template>
      </div>
    </div>
  </div>
</template>
