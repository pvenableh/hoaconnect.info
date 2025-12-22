<script setup lang="ts">
import { useDirectusAuth, useDirectusItems } from "#imports";
import { toast } from "vue-sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const {
  list: listMembers,
  create: createMember,
  update: updateMember,
  remove: removeMember,
} = useDirectusItems("hoa_members");
const { list: listInvitations } = useDirectusItems("hoa_invitations");
const { list: listUnits } = useDirectusItems("hoa_units");
const { create: createMemberUnit } = useDirectusItems("hoa_member_units");
const {
  list: listBoardTerms,
  create: createBoardTerm,
  update: updateBoardTerm,
  remove: removeBoardTerm,
} = useDirectusItems("hoa_board_members");
const { buildOrgPath, navigateToOrg } = useOrgNavigation();

// Await to ensure org is loaded during SSR
const { currentOrg, selectedOrgId, isLoading } = await useSelectedOrg();

// Current tab
const activeTab = ref<"members" | "invite" | "pending" | "board">("members");

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

// Fetch board member terms
const { data: boardTerms, refresh: refreshBoardTerms } = await useAsyncData(
  `board-terms-${orgId.value}`,
  async () => {
    if (!orgId.value) return [];
    try {
      const result = (await listBoardTerms({
        fields: [
          "id",
          "title",
          "term_start",
          "term_end",
          "message",
          "status",
          "hoa_member.id",
          "hoa_member.first_name",
          "hoa_member.last_name",
          "hoa_member.email",
        ],
        filter: {
          hoa_member: {
            organization: { _eq: orgId.value },
          },
        },
        sort: ["-term_start", "title"],
      })) as any[];
      return result || [];
    } catch (error) {
      console.error("Error fetching board terms:", error);
      return [];
    }
  },
  {
    watch: [orgId],
    server: false,
  }
);

// Board title options
const boardTitleOptions = [
  { value: "president", label: "President" },
  { value: "vice_president", label: "Vice President" },
  { value: "secretary", label: "Secretary" },
  { value: "treasurer", label: "Treasurer" },
  { value: "director", label: "Director" },
];

// Check if a board term is currently active
const isActiveTerm = (term: any) => {
  const now = new Date();
  const start = term.term_start ? new Date(term.term_start) : null;
  const end = term.term_end ? new Date(term.term_end) : null;

  if (term.status !== "published") return false;
  if (start && start > now) return false;
  if (end && end < now) return false;
  return true;
};

// Separate active and past board terms
const activeBoardTerms = computed(() =>
  (boardTerms.value || []).filter((term: any) => isActiveTerm(term))
);

const pastBoardTerms = computed(() =>
  (boardTerms.value || []).filter((term: any) => !isActiveTerm(term))
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

// Board term modal
const showBoardModal = ref(false);
const editingBoardTermId = ref<string | null>(null);
const boardForm = reactive({
  hoa_member: null as string | null,
  title: "director" as string,
  term_start: "",
  term_end: "",
  message: "",
  status: "published" as string,
});

const resetBoardForm = () => {
  boardForm.hoa_member = null;
  boardForm.title = "director";
  boardForm.term_start = "";
  boardForm.term_end = "";
  boardForm.message = "";
  boardForm.status = "published";
  editingBoardTermId.value = null;
};

const handleAddBoardTerm = () => {
  resetBoardForm();
  showBoardModal.value = true;
};

const handleEditBoardTerm = (term: any) => {
  boardForm.hoa_member = term.hoa_member?.id || null;
  boardForm.title = term.title || "director";
  boardForm.term_start = term.term_start ? term.term_start.split("T")[0] : "";
  boardForm.term_end = term.term_end ? term.term_end.split("T")[0] : "";
  boardForm.message = term.message || "";
  boardForm.status = term.status || "published";
  editingBoardTermId.value = term.id;
  showBoardModal.value = true;
};

const handleSubmitBoardTerm = async () => {
  if (!boardForm.hoa_member) {
    toast.error("Please select a member");
    return;
  }

  try {
    const data = {
      hoa_member: boardForm.hoa_member,
      title: boardForm.title,
      term_start: boardForm.term_start || null,
      term_end: boardForm.term_end || null,
      message: boardForm.message || null,
      status: boardForm.status,
    };

    if (editingBoardTermId.value) {
      await updateBoardTerm(editingBoardTermId.value, data);
      toast.success("Board position updated");
    } else {
      await createBoardTerm(data);
      toast.success("Board position added");
    }

    await refreshBoardTerms();
    showBoardModal.value = false;
    resetBoardForm();
  } catch (error: any) {
    console.error("Save error:", error);
    toast.error(error.message || "Failed to save board position");
  }
};

const handleDeleteBoardTerm = async (id: string) => {
  if (!confirm("Remove this board position?")) return;

  try {
    await removeBoardTerm(id);
    await refreshBoardTerms();
    toast.success("Board position removed");
  } catch (error) {
    toast.error("Failed to remove board position");
  }
};

const formatBoardTitle = (title: string | null): string => {
  if (!title) return "Board Member";
  const option = boardTitleOptions.find((o) => o.value === title);
  return option?.label || title.replace(/_/g, " ");
};

const getBoardTitleColor = (title: string | null): string => {
  const colors: Record<string, string> = {
    president: "bg-amber-100 text-amber-700",
    vice_president: "bg-blue-100 text-blue-700",
    secretary: "bg-emerald-100 text-emerald-700",
    treasurer: "bg-purple-100 text-purple-700",
    director: "bg-stone-100 text-stone-700",
  };
  return colors[title || ""] || "bg-stone-100 text-stone-700";
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
    <div class="p-6">
      <div class="max-w-7xl mx-auto">
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
            <button
              @click="activeTab = 'board'"
              :class="[
                'py-4 px-1 border-b-2 font-medium text-sm transition-colors',
                activeTab === 'board'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-stone-600 hover:text-stone-900 hover:border-stone-300',
              ]"
            >
              <Icon name="lucide:award" class="w-4 h-4 inline mr-1" />
              Board ({{ activeBoardTerms?.length || 0 }})
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
              <Button @click="navigateToOrg('/admin/units')" variant="outline">
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

        <!-- Board Tab -->
        <div v-if="activeTab === 'board'" class="space-y-6">
          <!-- Info Box -->
          <Card class="bg-amber-50 border-amber-200">
            <CardContent class="pt-6">
              <p class="text-sm text-amber-900">
                <strong>Manage your HOA Board:</strong>
                Assign board positions to members. Active board members will be displayed on the public Board page.
              </p>
            </CardContent>
          </Card>

          <!-- Action Button -->
          <div class="flex justify-end">
            <Button @click="handleAddBoardTerm">
              <Icon name="lucide:plus" class="w-4 h-4 mr-2" />
              Add Board Position
            </Button>
          </div>

          <!-- Active Board Members -->
          <Card>
            <CardHeader>
              <CardTitle>Current Board Members</CardTitle>
              <CardDescription>
                Active board positions displayed on your public Board page
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div v-if="activeBoardTerms?.length" class="space-y-3">
                <div
                  v-for="term in activeBoardTerms"
                  :key="term.id"
                  class="flex items-center justify-between p-4 border rounded-lg hover:bg-stone-50"
                >
                  <div class="flex items-center gap-4">
                    <div
                      class="w-12 h-12 rounded-full flex items-center justify-center text-lg font-semibold"
                      :class="getBoardTitleColor(term.title)"
                    >
                      {{ term.hoa_member?.first_name?.[0] || '' }}{{ term.hoa_member?.last_name?.[0] || '' }}
                    </div>
                    <div>
                      <p class="font-medium">
                        {{ term.hoa_member?.first_name }} {{ term.hoa_member?.last_name }}
                      </p>
                      <span
                        class="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full"
                        :class="getBoardTitleColor(term.title)"
                      >
                        {{ formatBoardTitle(term.title) }}
                      </span>
                      <p v-if="term.term_start || term.term_end" class="text-xs text-stone-500 mt-1">
                        <span v-if="term.term_start">{{ formatDate(term.term_start) }}</span>
                        <span v-if="term.term_start && term.term_end"> - </span>
                        <span v-if="term.term_end">{{ formatDate(term.term_end) }}</span>
                        <span v-if="term.term_start && !term.term_end"> - Present</span>
                      </p>
                    </div>
                  </div>
                  <div class="flex gap-2">
                    <Button
                      @click="handleEditBoardTerm(term)"
                      variant="outline"
                      size="sm"
                    >
                      <Icon name="lucide:edit" class="w-4 h-4" />
                    </Button>
                    <Button
                      @click="handleDeleteBoardTerm(term.id)"
                      variant="destructive"
                      size="sm"
                    >
                      <Icon name="lucide:trash-2" class="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
              <div v-else class="text-center py-12 text-stone-500">
                <Icon
                  name="lucide:award"
                  class="w-12 h-12 mx-auto mb-4 text-stone-400"
                />
                <p class="font-medium">No active board members</p>
                <p class="text-sm mt-1">
                  Add board positions to display on your public Board page
                </p>
              </div>
            </CardContent>
          </Card>

          <!-- Past Board Members -->
          <Card v-if="pastBoardTerms?.length">
            <CardHeader>
              <CardTitle>Past Board Members</CardTitle>
              <CardDescription>
                Historical board positions (expired or inactive)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div class="space-y-3">
                <div
                  v-for="term in pastBoardTerms"
                  :key="term.id"
                  class="flex items-center justify-between p-4 border rounded-lg bg-stone-50"
                >
                  <div class="flex items-center gap-4">
                    <div
                      class="w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold bg-stone-200 text-stone-600"
                    >
                      {{ term.hoa_member?.first_name?.[0] || '' }}{{ term.hoa_member?.last_name?.[0] || '' }}
                    </div>
                    <div>
                      <p class="font-medium text-stone-600">
                        {{ term.hoa_member?.first_name }} {{ term.hoa_member?.last_name }}
                      </p>
                      <span class="text-xs text-stone-500">
                        {{ formatBoardTitle(term.title) }}
                      </span>
                      <p v-if="term.term_start || term.term_end" class="text-xs text-stone-400 mt-1">
                        <span v-if="term.term_start">{{ formatDate(term.term_start) }}</span>
                        <span v-if="term.term_start && term.term_end"> - </span>
                        <span v-if="term.term_end">{{ formatDate(term.term_end) }}</span>
                      </p>
                    </div>
                  </div>
                  <div class="flex gap-2">
                    <Button
                      @click="handleEditBoardTerm(term)"
                      variant="outline"
                      size="sm"
                    >
                      <Icon name="lucide:edit" class="w-4 h-4" />
                    </Button>
                    <Button
                      @click="handleDeleteBoardTerm(term.id)"
                      variant="ghost"
                      size="sm"
                    >
                      <Icon name="lucide:trash-2" class="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <!-- Add/Edit Member Modal -->
        <Dialog v-model:open="showAddModal">
          <DialogContent class="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>{{ editingId ? "Edit" : "Add" }} Member</DialogTitle>
              <DialogDescription>
                Adding a member without sending an invitation. They won't have
                system access.
              </DialogDescription>
            </DialogHeader>
            <div class="grid gap-4 py-4">
              <div class="grid grid-cols-2 gap-4">
                <div class="grid gap-2">
                  <Label for="first-name">First Name</Label>
                  <Input id="first-name" v-model="form.first_name" required />
                </div>
                <div class="grid gap-2">
                  <Label for="last-name">Last Name</Label>
                  <Input id="last-name" v-model="form.last_name" required />
                </div>
              </div>

              <div class="grid gap-2">
                <Label for="email">Email</Label>
                <Input id="email" v-model="form.email" type="email" required />
              </div>

              <div class="grid gap-2">
                <Label for="phone">Phone</Label>
                <Input id="phone" v-model="form.phone" type="tel" />
              </div>

              <div class="grid grid-cols-2 gap-4">
                <div class="grid gap-2">
                  <Label for="member-type">Type</Label>
                  <select
                    id="member-type"
                    v-model="form.member_type"
                    class="w-full p-2 border rounded"
                  >
                    <option value="owner">Owner</option>
                    <option value="tenant">Tenant</option>
                  </select>
                </div>
                <div class="grid gap-2">
                  <Label for="primary-unit">Primary Unit</Label>
                  <select id="primary-unit" v-model="form.unit" class="w-full p-2 border rounded">
                    <option :value="null">No Unit</option>
                    <option
                      v-for="unit in units"
                      :key="unit.id"
                      :value="unit.id"
                    >
                      {{ unit.unit_number }}
                    </option>
                  </select>
                  <p v-if="!units?.length" class="text-xs text-stone-500">
                    No units available.
                    <NuxtLink :to="buildOrgPath('/admin/units')" class="text-primary underline"
                      >Add units first</NuxtLink
                    >
                  </p>
                </div>
              </div>

              <div class="grid gap-2">
                <Label for="status">Status</Label>
                <select id="status" v-model="form.status" class="w-full p-2 border rounded">
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="pending">Pending</option>
                </select>
              </div>
            </div>
            <DialogFooter>
              <Button
                @click="
                  showAddModal = false;
                  resetForm();
                "
                variant="outline"
              >
                Cancel
              </Button>
              <Button @click="handleSubmit">Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <!-- Add/Edit Board Position Modal -->
        <Dialog v-model:open="showBoardModal">
          <DialogContent class="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>{{ editingBoardTermId ? "Edit" : "Add" }} Board Position</DialogTitle>
              <DialogDescription>
                Assign a board position to a member. Active positions will be displayed on the public Board page.
              </DialogDescription>
            </DialogHeader>
            <div class="grid gap-4 py-4">
              <div class="grid gap-2">
                <Label for="board-member">Member</Label>
                <select
                  id="board-member"
                  v-model="boardForm.hoa_member"
                  class="w-full p-2 border rounded"
                  :disabled="!!editingBoardTermId"
                >
                  <option :value="null">Select a member...</option>
                  <option
                    v-for="member in members"
                    :key="member.id"
                    :value="member.id"
                  >
                    {{ member.first_name }} {{ member.last_name }}
                  </option>
                </select>
                <p v-if="!members?.length" class="text-xs text-stone-500">
                  No members available. Add members first.
                </p>
              </div>

              <div class="grid gap-2">
                <Label for="board-title">Position</Label>
                <select
                  id="board-title"
                  v-model="boardForm.title"
                  class="w-full p-2 border rounded"
                >
                  <option
                    v-for="option in boardTitleOptions"
                    :key="option.value"
                    :value="option.value"
                  >
                    {{ option.label }}
                  </option>
                </select>
              </div>

              <div class="grid grid-cols-2 gap-4">
                <div class="grid gap-2">
                  <Label for="term-start">Term Start</Label>
                  <Input
                    id="term-start"
                    v-model="boardForm.term_start"
                    type="date"
                  />
                </div>
                <div class="grid gap-2">
                  <Label for="term-end">Term End</Label>
                  <Input
                    id="term-end"
                    v-model="boardForm.term_end"
                    type="date"
                  />
                  <p class="text-xs text-stone-500">Leave empty for ongoing</p>
                </div>
              </div>

              <div class="grid gap-2">
                <Label for="board-message">Bio/Message (optional)</Label>
                <Textarea
                  id="board-message"
                  v-model="boardForm.message"
                  placeholder="Brief bio or message from this board member..."
                  rows="3"
                />
              </div>

              <div class="grid gap-2">
                <Label for="board-status">Status</Label>
                <select
                  id="board-status"
                  v-model="boardForm.status"
                  class="w-full p-2 border rounded"
                >
                  <option value="published">Published (Active)</option>
                  <option value="draft">Draft (Hidden)</option>
                  <option value="archived">Archived</option>
                </select>
              </div>
            </div>
            <DialogFooter>
              <Button
                @click="
                  showBoardModal = false;
                  resetBoardForm();
                "
                variant="outline"
              >
                Cancel
              </Button>
              <Button @click="handleSubmitBoardTerm">Save Position</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        </div>
      </div>
    </div>
  </div>
</template>
