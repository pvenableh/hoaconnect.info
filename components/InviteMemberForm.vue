<script setup lang="ts">
import { ref, onMounted } from "vue";
import { toast } from "vue-sonner";
import { useDirectusItems } from "#imports";

interface Props {
  organizationId: string;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  success: [invitation: any];
  error: [error: Error];
}>();

const { list: listRoles } = useDirectusItems("directus_roles");
const { list: listUnits } = useDirectusItems("hoa_units");

const loading = ref(false);
const loadingData = ref(true);
const roles = ref<any[]>([]);
const units = ref<any[]>([]);

// Form state
const form = ref({
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  roleId: "",
  unitId: null as string | null,
  personType: "owner" as "owner" | "tenant",
});

// Load roles and units on mount
onMounted(async () => {
  try {
    // Load roles (exclude Administrator)
    const rolesData = await listRoles({
      filter: {
        name: { _neq: "Administrator" },
      },
      fields: ["id", "name", "description"],
    });

    if (rolesData) {
      roles.value = rolesData;
    }

    // Load units for this organization
    const unitsData = await listUnits({
      filter: {
        organization: { _eq: props.organizationId },
        status: { _eq: "published" },
      },
      fields: ["id", "unit_number"],
      sort: ["unit_number"],
    });

    if (unitsData) {
      units.value = unitsData;
    }
  } catch (err) {
    console.error("Error loading data:", err);
    toast.error("Failed to load required data");
  } finally {
    loadingData.value = false;
  }
});

// Validation
const isValid = computed(() => {
  return (
    form.value.firstName.trim().length >= 2 &&
    form.value.lastName.trim().length >= 2 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.value.email) &&
    form.value.roleId.length > 0
  );
});

// Submit
const handleSubmit = async () => {
  if (!isValid.value) {
    toast.error("Please complete all required fields");
    return;
  }

  loading.value = true;

  try {
    const response = await $fetch("/api/hoa/invite-member", {
      method: "POST",
      body: {
        firstName: form.value.firstName,
        lastName: form.value.lastName,
        email: form.value.email,
        phone: form.value.phone,
        organizationId: props.organizationId,
        roleId: form.value.roleId,
        unitId: form.value.unitId,
        personType: form.value.personType,
      },
    });

    toast.success("Invitation sent!", {
      description: `An invitation has been sent to ${form.value.email}`,
    });

    // Reset form
    form.value = {
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      roleId: "",
      unitId: null,
      personType: "owner",
    };

    emit("success", response);
  } catch (err: any) {
    const errorMessage =
      err.data?.message || "Failed to send invitation. Please try again.";

    toast.error("Invitation failed", {
      description: errorMessage,
    });

    emit("error", err);
  } finally {
    loading.value = false;
  }
};

// Reset form
const resetForm = () => {
  form.value = {
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    roleId: "",
    unitId: null,
    personType: "owner",
  };
};
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle>Invite New Member</CardTitle>
      <CardDescription>
        Send an invitation to someone to join your HOA
      </CardDescription>
    </CardHeader>

    <CardContent>
      <div v-if="loadingData" class="text-center py-8">
        <Icon
          name="lucide:loader-2"
          class="w-8 h-8 animate-spin mx-auto mb-4"
        />
        <p class="text-sm text-muted-foreground">Loading...</p>
      </div>

      <form v-else @submit.prevent="handleSubmit" class="space-y-4">
        <div class="grid grid-cols-2 gap-4">
          <FormField name="firstName">
            <FormItem>
              <FormLabel>First Name *</FormLabel>
              <FormControl>
                <Input v-model="form.firstName" placeholder="John" required />
              </FormControl>
            </FormItem>
          </FormField>

          <FormField name="lastName">
            <FormItem>
              <FormLabel>Last Name *</FormLabel>
              <FormControl>
                <Input v-model="form.lastName" placeholder="Doe" required />
              </FormControl>
            </FormItem>
          </FormField>
        </div>

        <FormField name="email">
          <FormItem>
            <FormLabel>Email *</FormLabel>
            <FormControl>
              <Input
                v-model="form.email"
                type="email"
                placeholder="john@example.com"
                required
              />
            </FormControl>
            <FormDescription>
              They will receive an invitation at this email address
            </FormDescription>
          </FormItem>
        </FormField>

        <FormField name="phone">
          <FormItem>
            <FormLabel>Phone</FormLabel>
            <FormControl>
              <Input
                v-model="form.phone"
                type="tel"
                placeholder="(305) 555-1234"
              />
            </FormControl>
          </FormItem>
        </FormField>

        <FormField name="roleId">
          <FormItem>
            <FormLabel>Role *</FormLabel>
            <FormControl>
              <select
                v-model="form.roleId"
                class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors"
                required
              >
                <option value="" disabled>Select a role</option>
                <option v-for="role in roles" :key="role.id" :value="role.id">
                  {{ role.name }}
                </option>
              </select>
            </FormControl>
            <FormDescription>
              The access level for this member
            </FormDescription>
          </FormItem>
        </FormField>

        <div class="grid grid-cols-2 gap-4">
          <FormField name="personType">
            <FormItem>
              <FormLabel>Type *</FormLabel>
              <FormControl>
                <select
                  v-model="form.personType"
                  class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors"
                >
                  <option value="owner">Owner</option>
                  <option value="tenant">Tenant</option>
                </select>
              </FormControl>
            </FormItem>
          </FormField>

          <FormField name="unitId">
            <FormItem>
              <FormLabel>Unit (Optional)</FormLabel>
              <FormControl>
                <select
                  v-model="form.unitId"
                  class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors"
                >
                  <option :value="null">No unit assigned</option>
                  <option v-for="unit in units" :key="unit.id" :value="unit.id">
                    Unit {{ unit.unit_number }}
                  </option>
                </select>
              </FormControl>
            </FormItem>
          </FormField>
        </div>
      </form>
    </CardContent>

    <CardFooter class="flex justify-between">
      <Button variant="outline" @click="resetForm" :disabled="loading">
        Reset
      </Button>

      <Button
        @click="handleSubmit"
        :disabled="loading || !isValid || loadingData"
      >
        {{ loading ? "Sending..." : "Send Invitation" }}
      </Button>
    </CardFooter>
  </Card>
</template>
