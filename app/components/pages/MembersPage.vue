<script setup lang="ts">
import { useDirectusAuth, useDirectusItems } from "#imports";
import { toast } from "vue-sonner";

const {
  list: listMembers,
  create: createMember,
  update: updateMember,
  remove: removeMember,
} = useDirectusItems("hoa_members");
const { list: listInvitations } = useDirectusItems("hoa_invitations");
const { list: listUnits } = useDirectusItems("hoa_units");
const { create: createMemberUnit } = useDirectusItems("hoa_member_units");
const { buildOrgPath, navigateToOrg } = useOrgNavigation();

// Await to ensure org is loaded during SSR
const { currentOrg, selectedOrgId, isLoading } = await useSelectedOrg();

// Current tab
const activeTab = ref<"members" | "invite" | "pending">("members");

// Computed organization from the composable
const organization = computed(() => currentOrg.value?.organization || null);

// Use selectedOrgId directly (primitive value) for immediate reactivity
const orgId = computed(() => selectedOrgId.value);

// Fetch members list
const { data: members, refresh: refreshMembers } = await useAsyncData(
  `hoa-members-list-${orgId.value}`,
  async () => {
    if (!orgId.value) return [];

    try {
      const result = (await listMembers({
        fields: [
          "id",
          "first_name",
          "last_name",
          "email",
          "phone",
          "member_type",
          "user.id",
          "user.first_name",
          "user.last_name",
          "status",
          "date_created",
          "units.id",
          "units.is_primary_unit",
          "units.unit_id.id",
          "units.unit_id.unit_number",
        ],
        filter: {
          organization: { _eq: orgId.value },
          status: { _in: ["active", "inactive", "pending"] },
        },
        sort: ["sort", "last_name"],
      })) as any[];

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

// Fetch pending invitations
const { data: invitations, refresh: refreshInvitations } = await useAsyncData(
  `hoa-invitations-list-${orgId.value}`,
  async () => {
    if (!orgId.value) return [];
    const result = (await listInvitations({
      fields: [
        "id",
        "email",
        "invitation_status",
        "expires_at",
        "date_created",
        "invited_by.first_name",
        "invited_by.last_name",
        "role",
      ],
      filter: {
        organization: { _eq: orgId.value },
        invitation_status: { _in: ["pending", "expired"] },
      },
      sort: ["-date_created"],
    })) as any[];
    return result || [];
  },
  {
    watch: [orgId],
    server: false,
  }
);

// Fetch available units for dropdown
const { data: units } = await useAsyncData(
  `units-dropdown-${orgId.value}`,
  async () => {
    if (!orgId.value) return [];
    const result = (await listUnits({
      fields: ["id", "unit_number"],
      filter: {
        organization: { _eq: orgId.value },
        status: { _eq: "active" },
      },
      sort: ["unit_number"],
    })) as any[];
    return result || [];
  },
  {
    watch: [orgId],
    server: false,
  }
);

// Add member modal (for non-account members)
const showAddModal = ref(false);
const editingId = ref<string | null>(null);
const form = reactive({
  first_name: "",
  last_name: "",
  email: "",
  phone: "",
  member_type: "owner",
  unit: null as string | null,
  status: "active",
});

const resetForm = () => {
  form.first_name = "";
  form.last_name = "";
  form.email = "";
  form.phone = "";
  form.member_type = "owner";
  form.unit = null;
  form.status = "active";
  editingId.value = null;
};

const handleAddMember = () => {
  resetForm();
  showAddModal.value = true;
};

const handleEdit = (member: any) => {
  form.first_name = member.first_name;
  form.last_name = member.last_name;
  form.email = member.email;
  form.phone = member.phone;
  form.member_type = member.member_type;
  form.status = member.status;

  const primaryUnit = member.units?.find((u: any) => u.is_primary_unit);
  const firstUnit = member.units?.[0];
  form.unit = primaryUnit?.unit_id?.id || firstUnit?.unit_id?.id || null;

  editingId.value = member.id;
  showAddModal.value = true;
};

const handleSubmit = async () => {
  if (!organization.value?.id) {
    toast.error("No organization selected");
    return;
  }

  try {
    if (editingId.value) {
      await updateMember(editingId.value, {
        first_name: form.first_name,
        last_name: form.last_name,
        email: form.email,
        phone: form.phone,
        member_type: form.member_type,
        status: form.status,
      });

      toast.success("Member updated");
    } else {
      const newMember = (await createMember({
        first_name: form.first_name,
        last_name: form.last_name,
        email: form.email,
        phone: form.phone,
        member_type: form.member_type,
        organization: organization.value.id,
        status: form.status,
      })) as any;

      if (form.unit && newMember?.id) {
        await createMemberUnit({
          member_id: newMember.id,
          unit_id: form.unit,
          is_primary_unit: true,
          status: "published",
        });
      }

      toast.success("Member added");
    }

    await refreshMembers();
    showAddModal.value = false;
    resetForm();
  } catch (error: any) {
    console.error("Save error:", error);
    toast.error(error.message || "Failed to save member");
  }
};

const handleDelete = async (id: string) => {
  if (
    !confirm(
      "Delete this member? This will also remove their unit assignments."
    )
  )
    return;

  try {
    await removeMember(id);
    await refreshMembers();
    toast.success("Member deleted");
  } catch (error) {
    toast.error("Failed to delete member");
  }
};

const handleInviteSuccess = () => {
  toast.success("Invitation sent successfully!");
  refreshInvitations();
  activeTab.value = "pending";
};

const getPrimaryUnit = (member: any) => {
  if (!member.units || member.units.length === 0) return null;
  const primary = member.units.find((u: any) => u.is_primary_unit);
  return primary?.unit_id || member.units[0]?.unit_id;
};

const formatUnits = (member: any) => {
  if (!member.units || member.units.length === 0) return "N/A";
  if (member.units.length === 1) {
    return member.units[0].unit_id?.unit_number || "N/A";
  }
  const primary = getPrimaryUnit(member);
  return `${primary?.unit_number || "N/A"} (+${member.units.length - 1} more)`;
};

const formatDate = (date: string) => {
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

const isExpired = (expiresAt: string) => {
  return new Date(expiresAt) < new Date();
};

useSeoMeta({
  title: "Manage Members",
  description: "Invite and manage members of your HOA",
});
</script>

<template>
  <div class="min-h-screen bg-stone-50">
    <div class="container mx-auto p-6">
      <div class="mb-8">
        <h1 class="text-3xl font-bold mb-2">Manage Members</h1>
        <p class="text-stone-600">
          Invite new members and manage existing memberships
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
      <div v-else class="max-w-7xl mx-auto space-y-6">
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
              @click="activeTab = 'members'"
              :class="[
                'py-4 px-1 border-b-2 font-medium text-sm transition-colors',
                activeTab === 'members'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-stone-600 hover:text-stone-900 hover:border-stone-300',
              ]"
            >
              Members ({{ members?.length || 0 }})
            </button>
            <button
              @click="activeTab = 'invite'"
              :class="[
                'py-4 px-1 border-b-2 font-medium text-sm transition-colors',
                activeTab === 'invite'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-stone-600 hover:text-stone-900 hover:border-stone-300',
              ]"
            >
              Invite Member
            </button>
            <button
              @click="activeTab = 'pending'"
              :class="[
                'py-4 px-1 border-b-2 font-medium text-sm transition-colors',
                activeTab === 'pending'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-stone-600 hover:text-stone-900 hover:border-stone-300',
              ]"
            >
              Pending Invitations ({{ invitations?.length || 0 }})
            </button>
          </nav>
        </div>

        <!-- Members Tab -->
        <div v-if="activeTab === 'members'" class="space-y-4">
          <!-- Info Box -->
          <Card class="bg-blue-50 border-blue-200">
            <CardContent class="pt-6">
              <p class="text-sm text-blue-900">
                <strong>Two ways to add members:</strong>
              </p>
              <ul
                class="text-sm text-blue-900 mt-2 space-y-1 list-disc list-inside"
              >
                <li>
                  <strong>Add Member:</strong> Create a record for residents who
                  don't need system access
                </li>
                <li>
                  <strong>Invite Member:</strong> Send an email invitation for
                  residents who need to log in
                </li>
              </ul>
            </CardContent>
          </Card>

          <!-- Action Buttons -->
          <div class="flex justify-between items-center">
            <div class="flex gap-2">
              <Button @click="navigateToOrg('/units')" variant="outline">
                <Icon name="lucide:building" class="w-4 h-4 mr-2" />
                Manage Units
              </Button>
            </div>
            <div class="flex gap-2">
              <Button @click="activeTab = 'invite'" variant="outline">
                <Icon name="lucide:mail" class="w-4 h-4 mr-2" />
                Invite Member
              </Button>
              <Button @click="handleAddMember">
                <Icon name="lucide:user-plus" class="w-4 h-4 mr-2" />
                Add Member
              </Button>
            </div>
          </div>

          <!-- Members Table -->
          <Card>
            <CardContent class="pt-6">
              <div class="overflow-x-auto">
                <table class="w-full">
                  <thead>
                    <tr class="border-b">
                      <th class="text-left p-3">Name</th>
                      <th class="text-left p-3">Email</th>
                      <th class="text-left p-3">Phone</th>
                      <th class="text-left p-3">Type</th>
                      <th class="text-left p-3">Unit(s)</th>
                      <th class="text-left p-3">Account</th>
                      <th class="text-right p-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="member in members"
                      :key="member.id"
                      class="border-b hover:bg-stone-50"
                    >
                      <td class="p-3">
                        {{ member.first_name }} {{ member.last_name }}
                      </td>
                      <td class="p-3">{{ member.email }}</td>
                      <td class="p-3">{{ member.phone || "—" }}</td>
                      <td class="p-3 capitalize">{{ member.member_type }}</td>
                      <td class="p-3">{{ formatUnits(member) }}</td>
                      <td class="p-3">
                        <span
                          v-if="member.user"
                          class="text-xs bg-green-100 text-green-800 px-2 py-1 rounded"
                        >
                          Yes
                        </span>
                        <span
                          v-else
                          class="text-xs bg-stone-100 text-stone-600 px-2 py-1 rounded"
                        >
                          No
                        </span>
                      </td>
                      <td class="p-3 text-right space-x-2">
                        <Button
                          @click="handleEdit(member)"
                          variant="outline"
                          size="sm"
                        >
                          <Icon name="lucide:edit" class="w-4 h-4" />
                        </Button>
                        <Button
                          @click="handleDelete(member.id)"
                          variant="destructive"
                          size="sm"
                        >
                          <Icon name="lucide:trash-2" class="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div
                v-if="!members?.length"
                class="text-center py-12 text-stone-500"
              >
                <Icon
                  name="lucide:users"
                  class="w-12 h-12 mx-auto mb-4 text-stone-400"
                />
                <p class="font-medium">No members yet</p>
                <p class="text-sm mt-1">
                  Add members or invite them to join your HOA
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        <!-- Invite Tab -->
        <div v-if="activeTab === 'invite'">
          <InviteMemberForm
            v-if="organization?.id"
            :organization-id="organization.id"
            @success="handleInviteSuccess"
          />
        </div>

        <!-- Pending Invitations Tab -->
        <div v-if="activeTab === 'pending'" class="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Pending Invitations</CardTitle>
              <CardDescription>
                Track invitations that haven't been accepted yet
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div class="space-y-3">
                <div
                  v-for="invitation in invitations"
                  :key="invitation.id"
                  class="flex items-center justify-between p-4 border rounded-lg"
                  :class="{
                    'bg-stone-50 border-stone-200': isExpired(
                      invitation.expires_at
                    ),
                  }"
                >
                  <div class="flex-1">
                    <div class="flex items-center gap-3">
                      <div>
                        <p class="font-medium">{{ invitation.email }}</p>
                        <p class="text-sm text-stone-600">
                          Role ID: {{ invitation.role || "N/A" }}
                        </p>
                        <p class="text-xs text-stone-500 mt-1">
                          Invited by
                          {{ invitation.invited_by?.first_name }}
                          {{ invitation.invited_by?.last_name }} on
                          {{ formatDate(invitation.date_created) }}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div class="text-right">
                    <div
                      v-if="isExpired(invitation.expires_at)"
                      class="text-xs bg-red-100 text-red-800 px-2 py-1 rounded"
                    >
                      Expired
                    </div>
                    <div
                      v-else
                      class="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded"
                    >
                      Pending
                    </div>
                    <p class="text-xs text-stone-500 mt-1">
                      Expires {{ formatDate(invitation.expires_at) }}
                    </p>
                  </div>
                </div>

                <div
                  v-if="!invitations?.length"
                  class="text-center py-12 text-stone-500"
                >
                  <Icon
                    name="lucide:mail-check"
                    class="w-12 h-12 mx-auto mb-4 text-stone-400"
                  />
                  <p class="font-medium">No pending invitations</p>
                  <p class="text-sm mt-1">
                    All invitations have been accepted or expired
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <!-- Add/Edit Member Modal -->
        <div
          v-if="showAddModal"
          class="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          @click.self="showAddModal = false"
        >
          <Card class="w-full max-w-md">
            <CardHeader>
              <CardTitle>{{ editingId ? "Edit" : "Add" }} Member</CardTitle>
              <CardDescription>
                Adding a member without sending an invitation. They won't have
                system access.
              </CardDescription>
            </CardHeader>
            <CardContent class="space-y-4">
              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label class="text-sm font-medium mb-2 block"
                    >First Name</label
                  >
                  <Input v-model="form.first_name" required />
                </div>
                <div>
                  <label class="text-sm font-medium mb-2 block"
                    >Last Name</label
                  >
                  <Input v-model="form.last_name" required />
                </div>
              </div>

              <div>
                <label class="text-sm font-medium mb-2 block">Email</label>
                <Input v-model="form.email" type="email" required />
              </div>

              <div>
                <label class="text-sm font-medium mb-2 block">Phone</label>
                <Input v-model="form.phone" type="tel" />
              </div>

              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label class="text-sm font-medium mb-2 block">Type</label>
                  <select
                    v-model="form.member_type"
                    class="w-full p-2 border rounded"
                  >
                    <option value="owner">Owner</option>
                    <option value="tenant">Tenant</option>
                  </select>
                </div>
                <div>
                  <label class="text-sm font-medium mb-2 block"
                    >Primary Unit</label
                  >
                  <select v-model="form.unit" class="w-full p-2 border rounded">
                    <option :value="null">No Unit</option>
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
                    <NuxtLink :to="buildOrgPath('/units')" class="text-primary underline"
                      >Add units first</NuxtLink
                    >
                  </p>
                </div>
              </div>

              <div>
                <label class="text-sm font-medium mb-2 block">Status</label>
                <select v-model="form.status" class="w-full p-2 border rounded">
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="pending">Pending</option>
                </select>
              </div>

              <div class="flex gap-2">
                <Button @click="handleSubmit" class="flex-1">Save</Button>
                <Button
                  @click="
                    showAddModal = false;
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
