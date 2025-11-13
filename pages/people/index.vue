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

// Fetch people with unit relationship
const { data: people, refresh } = await useAsyncData(
  `people-${orgId.value}`,
  async () => {
    if (!orgId.value) return [];
    const result = await fetchItems("hoa_people", {
      fields: [
        "id",
        "first_name",
        "last_name",
        "email",
        "phone",
        "type",
        "unit.unit_number",
        "status",
      ],
      filter: {
        organization: { _eq: orgId.value },
        status: { _in: ["published", "draft"] },
      },
      sort: ["sort", "last_name"],
    });
    return result.data.value || [];
  }
);

// Fetch available units for dropdown
const { data: units } = await useAsyncData(
  `units-dropdown-${orgId.value}`,
  async () => {
    if (!orgId.value) return [];
    const result = await fetchItems("hoa_units", {
      fields: ["id", "unit_number"],
      filter: {
        organization: { _eq: orgId.value },
        status: { _eq: "published" },
      },
      sort: ["unit_number"],
    });
    return result.data.value || [];
  }
);

// Add person modal
const showModal = ref(false);
const editingId = ref<string | null>(null);
const form = reactive({
  first_name: "",
  last_name: "",
  email: "",
  phone: "",
  type: "owner",
  unit: null as string | null,
  status: "published",
});

const resetForm = () => {
  form.first_name = "";
  form.last_name = "";
  form.email = "";
  form.phone = "";
  form.type = "owner";
  form.unit = null;
  form.status = "published";
  editingId.value = null;
};

const handleAdd = () => {
  resetForm();
  showModal.value = true;
};

const handleEdit = (person: any) => {
  form.first_name = person.first_name;
  form.last_name = person.last_name;
  form.email = person.email;
  form.phone = person.phone;
  form.type = person.type;
  form.unit = person.unit?.id || null;
  form.status = person.status;
  editingId.value = person.id;
  showModal.value = true;
};

const handleSubmit = async () => {
  if (!orgId.value) {
    toast.error("No organization selected");
    return;
  }

  try {
    if (editingId.value) {
      await update("hoa_people", editingId.value, form);
      toast.success("Person updated");
    } else {
      await create("hoa_people", { ...form, organization: orgId.value });
      toast.success("Person added");
    }

    await refresh();
    showModal.value = false;
    resetForm();
  } catch (error) {
    toast.error("Failed to save person");
  }
};

const handleDelete = async (id: string) => {
  if (!confirm("Delete this person?")) return;

  try {
    await deleteOne("hoa_people", id);
    await refresh();
    toast.success("Person deleted");
  } catch (error) {
    toast.error("Failed to delete person");
  }
};
</script>

<template>
  <div class="min-h-screen bg-stone-50">
    <div class="p-6">
      <div class="max-w-7xl mx-auto space-y-6">
        <!-- Header -->
        <div class="flex justify-between items-center">
          <h1 class="text-3xl font-bold">People</h1>
          <div class="flex gap-2">
            <Button @click="navigateTo('/units')" variant="outline"
              >Manage Units</Button
            >
            <Button @click="handleAdd">Add Person</Button>
          </div>
        </div>

        <!-- People Table -->
        <Card>
          <CardContent class="pt-6">
            <div class="overflow-x-auto">
              <table class="w-full">
                <thead>
                  <tr class="border-b">
                    <th class="text-left p-2">Name</th>
                    <th class="text-left p-2">Email</th>
                    <th class="text-left p-2">Phone</th>
                    <th class="text-left p-2">Type</th>
                    <th class="text-left p-2">Unit</th>
                    <th class="text-right p-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="person in people"
                    :key="person.id"
                    class="border-b hover:bg-stone-50"
                  >
                    <td class="p-2">
                      {{ person.first_name }} {{ person.last_name }}
                    </td>
                    <td class="p-2">{{ person.email }}</td>
                    <td class="p-2">{{ person.phone }}</td>
                    <td class="p-2 capitalize">{{ person.type }}</td>
                    <td class="p-2">{{ person.unit?.unit_number || "N/A" }}</td>
                    <td class="p-2 text-right space-x-2">
                      <Button
                        @click="handleEdit(person)"
                        variant="outline"
                        size="sm"
                      >
                        Edit
                      </Button>
                      <Button
                        @click="handleDelete(person.id)"
                        variant="destructive"
                        size="sm"
                      >
                        Delete
                      </Button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div
              v-if="!people?.length"
              class="text-center py-12 text-stone-500"
            >
              No people added yet
            </div>
          </CardContent>
        </Card>

        <!-- Add/Edit Modal -->
        <div
          v-if="showModal"
          class="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
        >
          <Card class="w-full max-w-md">
            <CardHeader>
              <CardTitle>{{ editingId ? "Edit" : "Add" }} Person</CardTitle>
            </CardHeader>
            <CardContent class="space-y-4">
              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label class="text-sm font-medium mb-2 block"
                    >First Name</label
                  >
                  <Input v-model="form.first_name" />
                </div>
                <div>
                  <label class="text-sm font-medium mb-2 block"
                    >Last Name</label
                  >
                  <Input v-model="form.last_name" />
                </div>
              </div>

              <div>
                <label class="text-sm font-medium mb-2 block">Email</label>
                <Input v-model="form.email" type="email" />
              </div>

              <div>
                <label class="text-sm font-medium mb-2 block">Phone</label>
                <Input v-model="form.phone" type="tel" />
              </div>

              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label class="text-sm font-medium mb-2 block">Type</label>
                  <select v-model="form.type" class="w-full p-2 border rounded">
                    <option value="owner">Owner</option>
                    <option value="tenant">Tenant</option>
                  </select>
                </div>
                <div>
                  <label class="text-sm font-medium mb-2 block">Unit</label>
                  <select v-model="form.unit" class="w-full p-2 border rounded">
                    <option :value="null">Select Unit</option>
                    <option
                      v-for="unit in units"
                      :key="unit.id"
                      :value="unit.id"
                    >
                      {{ unit.unit_number }}
                    </option>
                  </select>
                  <p v-if="!units?.length" class="text-xs text-stone-500 mt-1">
                    No units available.
                    <NuxtLink to="/units" class="text-primary underline"
                      >Add units first</NuxtLink
                    >
                  </p>
                </div>
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
