<script setup lang="ts">
import { ref, onMounted } from "vue";
import { toast } from "vue-sonner";
import { useDirectusItems } from "#imports";
import type { InviteBlockCode, InviteRestoreTarget } from "#core/shared/members/invitability";

interface Props {
  organizationId: string;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  success: [invitation: any];
  error: [error: Error];
  /**
   * An invitation was refused because the email already belongs to a member who
   * is not a current, un-onboarded resident — and the host can offer to make
   * them one. Carries a TARGET, never a completed restore: reactivating a
   * former resident because someone mistyped an email is the exact outcome
   * this refuses to produce on its own.
   */
  restore: [target: InviteRestoreTarget];
}>();

const { list: listUnits } = useDirectusItems("hoa_units");

const loading = ref(false);
const loadingData = ref(true);

// Why the last attempt was refused, kept on screen rather than only in a toast.
// The server names the reason (`member_archived` vs `member_already_onboarded`
// vs `member_not_active`) precisely so the admin is not left guessing whether
// they typed the wrong address or found a former resident.
const blocked = ref<{
  code: InviteBlockCode | null;
  message: string;
  restore: InviteRestoreTarget | null;
} | null>(null);
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
  personType: "owner" as "owner" | "tenant" | "property_manager",
});

// Load roles and units on mount
onMounted(async () => {
  try {
    // Load roles via server API (avoids readItems restriction on core collections)
    const rolesResponse = await $fetch("/api/roles/list");

    if (rolesResponse?.data) {
      roles.value = rolesResponse.data;
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
  blocked.value = null;

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
    blocked.value = null;
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

    // The gate's 409 carries structured detail under `data.data`. Keying off the
    // code rather than off the status keeps this working regardless of how the
    // fetch layer surfaces the status — nothing else sends this shape.
    const detail = err.data?.data;
    if (detail?.code) {
      blocked.value = {
        code: detail.code,
        message: errorMessage,
        restore: detail.restore ?? null,
      };
    }

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
  blocked.value = null;
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
        <!--
          The refusal, stated rather than left in a toast that has scrolled away.
          An ARCHIVED match is the one an admin can act on, so it gets the
          button — but the button says Restore and is theirs to press. The
          endpoint never restores anyone.
        -->
        <Alert v-if="blocked" class="t-bg-accent/10 t-border-accent">
          <Icon name="lucide:user-x" class="w-4 h-4" />
          <AlertTitle>
            {{
              blocked.code === "member_archived"
                ? "That email belongs to a former resident"
                : blocked.code === "member_already_onboarded"
                  ? "That email is already on the portal"
                  : "That email is not an active member"
            }}
          </AlertTitle>
          <AlertDescription class="space-y-2">
            <p>{{ blocked.message }}</p>
            <p v-if="blocked.code === 'member_archived'" class="text-xs t-text-muted">
              If you meant someone else, check the address for a typo — restoring
              is not something an invitation should do by accident.
            </p>
            <Button
              v-if="blocked.restore"
              size="sm"
              variant="outline"
              type="button"
              @click="emit('restore', blocked.restore)"
            >
              <Icon name="lucide:rotate-ccw" class="w-4 h-4 mr-2" />
              {{
                blocked.restore.currentStatus === "archived"
                  ? `Restore ${blocked.restore.name}`
                  : `Set ${blocked.restore.name} active`
              }}
            </Button>
          </AlertDescription>
        </Alert>

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
                  <option value="property_manager">Property Manager</option>
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
