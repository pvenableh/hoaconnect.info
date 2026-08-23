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
const { list: listInvitations, update: updateInvitation } = useDirectusItems("hoa_invitations");
const { list: listUnits } = useDirectusItems("hoa_units");
const {
  list: listBoardTerms,
  create: createBoardTerm,
  update: updateBoardTerm,
  remove: removeBoardTerm,
} = useDirectusItems("hoa_board_members");

// Secured API function for member-unit assignment (admin-only)
const assignMemberUnit = async (memberId: string, unitId: string, isPrimaryUnit = true) => {
  return await $fetch("/api/hoa/member-units/assign", {
    method: "POST",
    body: { memberId, unitId, isPrimaryUnit },
  });
};
const { buildOrgPath, navigateToOrg } = useOrgNavigation();

// The selected view lives in `?tab=` so it is linkable and survives a refresh,
// but via router.replace — Back leaves the page rather than stepping backwards
// through tabs. Declared BEFORE the await below: composables should not be
// called after a top-level await in setup.
const activeTab = useTabQuery({
  values: ["members", "invite", "pending", "board"],
  fallback: "members",
});

// Await to ensure org is loaded during SSR
const { currentOrg, selectedOrgId, isLoading } = await useSelectedOrg();

// Computed organization from the composable
const organization = computed(() => currentOrg.value?.organization || null);

// Use selectedOrgId directly (primitive value) for immediate reactivity
const orgId = computed(() => selectedOrgId.value);

// Fetch members list
// Role configuration
const config = useRuntimeConfig();
const roleOptions = [
  { value: config.public.directusRoleHoaAdmin, label: "HOA Admin" },
  { value: config.public.directusRoleMember, label: "Member" },
];

// Get role display name
const getRoleDisplay = (roleId: string | null | undefined): string => {
  if (!roleId) return "—";
  const role = roleOptions.find(r => r.value === roleId);
  return role?.label || "Member";
};

// Get role badge color. CATEGORICAL — purple marks "this one is an admin"
// against the neutral default; it is a kind, not a status, so it keeps its hue
// (with a dark pair) rather than moving onto a status token.
const getRoleBadgeClass = (roleId: string | null | undefined): string => {
  if (roleId === config.public.directusRoleHoaAdmin) {
    return "bg-purple-100 text-purple-800 dark:bg-purple-500/20 dark:text-purple-200";
  }
  return "t-bg-subtle t-text-secondary";
};

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
          "company",
          "member_type",
          "role",
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

// Name, email and role identify a member; everything else is context, so it
// drops away on a phone rather than forcing the table sideways.
const memberColumns = [
  { key: "name", label: "Name", sortable: true, value: (r: any) => `${r.first_name} ${r.last_name}` },
  { key: "email", label: "Email", sortable: true },
  { key: "phone", label: "Phone", hideOnMobile: true, value: (r: any) => r.phone || "—" },
  { key: "company", label: "Company", hideOnMobile: true, value: (r: any) => r.company || "—" },
  { key: "member_type", label: "Type", sortable: true, hideOnMobile: true },
  { key: "role", label: "Role" },
  { key: "units", label: "Unit(s)", hideOnMobile: true },
  { key: "account", label: "Account", hideOnMobile: true },
  { key: "actions", label: "Actions", align: "right" as const },
];

// Counts ride on the tabs so the page says how much is behind each one without
// making anyone open it. A zero count renders as no badge rather than "(0)".
const tabItems = computed(() => [
  { value: "members", label: "Members", icon: "lucide:users-round", count: members.value?.length ?? 0 },
  { value: "invite", label: "Invite", icon: "lucide:user-plus" },
  { value: "pending", label: "Pending", icon: "lucide:clock", count: invitations.value?.length ?? 0 },
  { value: "board", label: "Board", icon: "lucide:award", count: activeBoardTerms.value?.length ?? 0 },
]);

// Add member modal (for non-account members)
const showAddModal = ref(false);
const editingId = ref<string | null>(null);
const form = reactive({
  first_name: "",
  last_name: "",
  email: "",
  phone: "",
  company: "",
  member_type: "owner",
  role: config.public.directusRoleMember as string,
  unit: null as string | null,
  status: "active",
});

const resetForm = () => {
  form.first_name = "";
  form.last_name = "";
  form.email = "";
  form.phone = "";
  form.company = "";
  form.member_type = "owner";
  form.role = config.public.directusRoleMember;
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
  form.company = member.company || "";
  form.member_type = member.member_type;
  form.role = member.role || config.public.directusRoleMember;
  form.status = member.status;

  const primaryUnit = member.units?.find((u: any) => u.is_primary_unit);
  const firstUnit = member.units?.[0];
  form.unit = primaryUnit?.unit_id?.id || firstUnit?.unit_id?.id || null;

  editingId.value = member.id;
  showAddModal.value = true;
};

// Anchor the AI assistant to the member being viewed/edited while the modal is
// open, so the assistant answers about THIS member (and keeps their own thread).
const { setContext: setAiFocus, clearContext: clearAiFocus } = useAiContext();
watch(showAddModal, (open) => {
  if (open && editingId.value) {
    setAiFocus({
      entityType: "member",
      entityId: editingId.value,
      label: `${form.first_name} ${form.last_name}`.trim() || "Member",
    });
  } else {
    clearAiFocus();
  }
});

// Keep the org's denormalized member_count in sync after member changes.
const recomputeCount = async () => {
  if (!organization.value?.id) return;
  try {
    await $fetch("/api/hoa/recompute-member-count", {
      method: "POST",
      body: { organizationId: organization.value.id },
    });
  } catch {
    /* non-fatal */
  }
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
        company: form.company || null,
        member_type: form.member_type,
        role: form.role,
        status: form.status,
      });

      toast.success("Member updated");
    } else {
      const newMember = (await createMember({
        first_name: form.first_name,
        last_name: form.last_name,
        email: form.email,
        phone: form.phone,
        company: form.company || null,
        member_type: form.member_type,
        role: form.role,
        organization: organization.value.id,
        status: form.status,
      })) as any;

      if (form.unit && newMember?.id) {
        await assignMemberUnit(newMember.id, form.unit, true);
      }

      toast.success("Member added");
    }

    await refreshMembers();
    await recomputeCount();
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
    await recomputeCount();
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

// Cancel invitation
const cancellingInvitation = ref<string | null>(null);
const handleCancelInvitation = async (invitationId: string) => {
  if (!confirm("Are you sure you want to cancel this invitation?")) return;

  cancellingInvitation.value = invitationId;
  try {
    await $fetch("/api/hoa/cancel-invitation", {
      method: "POST",
      body: { invitationId },
    });
    toast.success("Invitation canceled");
    await refreshInvitations();
  } catch (error: any) {
    toast.error(error.data?.message || "Failed to cancel invitation");
  } finally {
    cancellingInvitation.value = null;
  }
};

// Resend invitation
const resendingInvitation = ref<string | null>(null);
const handleResendInvitation = async (invitationId: string) => {
  resendingInvitation.value = invitationId;
  try {
    await $fetch("/api/hoa/resend-invitation", {
      method: "POST",
      body: { invitationId },
    });
    toast.success("Invitation resent successfully");
    await refreshInvitations();
  } catch (error: any) {
    toast.error(error.data?.message || "Failed to resend invitation");
  } finally {
    resendingInvitation.value = null;
  }
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
    president: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-200",
    vice_president: "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-200",
    secretary: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200",
    treasurer: "bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-200",
    director: "t-bg-subtle t-text-secondary",
  };
  return colors[title || ""] || "t-bg-subtle t-text-secondary";
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
  <div class="min-h-screen t-bg">
    <PageContainer>
        <AppPageHeader
          eyebrow="People"
          title="Members"
          description="Invite new members and manage existing memberships."
        />

        <!-- Loading State -->
        <div v-if="isLoading" class="flex flex-col items-center py-12 gap-3">
          <span class="spinner-ios" />
          <p class="type-meta">Loading your organization…</p>
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
        <AppSegmentedControl v-model="activeTab" :items="tabItems" label="Members views" />

        <AppTabPanels :value="activeTab" :items="tabItems">
          <!-- Members Tab -->
          <div v-if="activeTab === 'members'" class="space-y-4">
            <!--
              People is where the dock now lands, so the first thing on it should
              be the community rather than a table. Counts + the two splits
              (people by type, homes by occupancy — different questions, see the
              component) before the list.
            -->
            <AdminPeopleGlance />

            <!-- Info Box — theme-aware accent tint (adapts to light/dark + theme) -->
            <Card class="t-bg-accent/10 t-border-accent">
              <CardContent class="pt-6">
                <p class="text-sm t-text">
                  <strong>Two ways to add members:</strong>
                </p>
                <ul
                  class="text-sm t-text-secondary mt-2 space-y-1 list-disc list-inside"
                >
                  <li>
                    <strong class="t-text">Add Member:</strong> Create a record for residents who
                    don't need system access
                  </li>
                  <li>
                    <strong class="t-text">Invite Member:</strong> Send an email invitation for
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
                <AppDataTable
                  :columns="memberColumns"
                  :rows="members || []"
                  empty-title="No members yet"
                  empty-description="Add members directly, or invite them to create their own login."
                  empty-icon="lucide:users"
                >
                  <template #cell-name="{ row }">
                    <span class="font-medium t-text">
                      {{ row.first_name }} {{ row.last_name }}
                    </span>
                  </template>
                  <template #cell-member_type="{ value }">
                    <span class="capitalize">{{ value }}</span>
                  </template>
                  <template #cell-role="{ row }">
                    <span
                      class="text-xs px-2 py-1 rounded-full font-medium"
                      :class="getRoleBadgeClass(row.role)"
                    >
                      {{ getRoleDisplay(row.role) }}
                    </span>
                  </template>
                  <template #cell-units="{ row }">{{ formatUnits(row) }}</template>
                  <template #cell-account="{ row }">
                    <Badge :variant="row.user ? 'default' : 'secondary'">
                      {{ row.user ? "Yes" : "No" }}
                    </Badge>
                  </template>
                  <template #cell-actions="{ row }">
                    <div class="flex items-center justify-end gap-2">
                      <Button
                        variant="outline"
                        size="icon-sm"
                        aria-label="Edit member"
                        @click="handleEdit(row)"
                      >
                        <Icon name="lucide:pencil" />
                      </Button>
                      <Button
                        variant="destructive"
                        size="icon-sm"
                        aria-label="Delete member"
                        @click="handleDelete(row.id)"
                      >
                        <Icon name="lucide:trash-2" />
                      </Button>
                    </div>
                  </template>

                  <template #empty>
                    <AppEmptyState
                      icon="lucide:users"
                      title="No members yet"
                      description="Add members directly, or invite them to create their own login."
                      compact
                    >
                      <Button @click="handleAddMember">
                        <Icon name="lucide:user-plus" />
                        Add the first member
                      </Button>
                    </AppEmptyState>
                  </template>
                </AppDataTable>
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
                      't-bg-subtle t-border': isExpired(
                        invitation.expires_at
                      ),
                    }"
                  >
                    <div class="flex-1">
                      <div class="flex items-center gap-3">
                        <div>
                          <p class="font-medium">{{ invitation.email }}</p>
                          <p class="text-sm t-text-secondary">
                            Role: {{ getRoleDisplay(invitation.role) }}
                          </p>
                          <p class="text-xs t-text-muted mt-1">
                            Invited by
                            {{ invitation.invited_by?.first_name }}
                            {{ invitation.invited_by?.last_name }} on
                            {{ formatDate(invitation.date_created) }}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div class="flex items-center gap-4">
                      <div class="text-right">
                        <div
                          v-if="isExpired(invitation.expires_at)"
                          class="text-xs bg-destructive/15 text-destructive px-2 py-1 rounded"
                        >
                          Expired
                        </div>
                        <div
                          v-else
                          class="text-xs bg-warning/15 text-warning px-2 py-1 rounded"
                        >
                          Pending
                        </div>
                        <p class="text-xs t-text-muted mt-1">
                          Expires {{ formatDate(invitation.expires_at) }}
                        </p>
                      </div>
                      <div class="flex gap-2">
                        <Button
                          @click="handleResendInvitation(invitation.id)"
                          variant="outline"
                          size="sm"
                          :disabled="resendingInvitation === invitation.id"
                        >
                          <Icon
                            v-if="resendingInvitation === invitation.id"
                            name="lucide:loader-2"
                            class="w-4 h-4 animate-spin"
                          />
                          <Icon v-else name="lucide:send" class="w-4 h-4" />
                          <span class="ml-1 hidden sm:inline">Resend</span>
                        </Button>
                        <Button
                          @click="handleCancelInvitation(invitation.id)"
                          variant="destructive"
                          size="sm"
                          :disabled="cancellingInvitation === invitation.id"
                        >
                          <Icon
                            v-if="cancellingInvitation === invitation.id"
                            name="lucide:loader-2"
                            class="w-4 h-4 animate-spin"
                          />
                          <Icon v-else name="lucide:x" class="w-4 h-4" />
                          <span class="ml-1 hidden sm:inline">Cancel</span>
                        </Button>
                      </div>
                    </div>
                  </div>

                  <AppEmptyState
                    v-if="!invitations?.length"
                    icon="lucide:mail-check"
                    title="No pending invitations"
                    description="Everything sent has been accepted or has expired."
                  >
                    <Button variant="outline" @click="activeTab = 'invite'">
                      <Icon name="lucide:user-plus" />
                      Invite someone
                    </Button>
                  </AppEmptyState>
                </div>
              </CardContent>
            </Card>
          </div>

          <!-- Board Tab -->
          <div v-if="activeTab === 'board'" class="space-y-6">
            <!-- Info Box -->
            <Card class="bg-info/10">
              <CardContent class="pt-6">
                <p class="text-sm t-text">
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
                    class="flex items-center justify-between p-4 border rounded-lg hover:t-bg-subtle"
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
                        <p v-if="term.term_start || term.term_end" class="text-xs t-text-muted mt-1">
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
                <AppEmptyState
                  v-else
                  icon="lucide:award"
                  title="No active board members"
                  description="Board positions added here appear on your community's public Board page."
                />
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
                    class="flex items-center justify-between p-4 border rounded-lg t-bg-subtle"
                  >
                    <div class="flex items-center gap-4">
                      <div
                        class="w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold t-bg-alt t-text-secondary"
                      >
                        {{ term.hoa_member?.first_name?.[0] || '' }}{{ term.hoa_member?.last_name?.[0] || '' }}
                      </div>
                      <div>
                        <p class="font-medium t-text-secondary">
                          {{ term.hoa_member?.first_name }} {{ term.hoa_member?.last_name }}
                        </p>
                        <span class="text-xs t-text-muted">
                          {{ formatBoardTitle(term.title) }}
                        </span>
                        <p v-if="term.term_start || term.term_end" class="text-xs t-text-muted mt-1">
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
        </AppTabPanels>

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

              <div class="grid gap-2">
                <Label for="company">Company</Label>
                <Input id="company" v-model="form.company" placeholder="Optional - for property managers" />
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
                    <option value="property_manager">Property Manager</option>
                  </select>
                </div>
                <div class="grid gap-2">
                  <Label for="member-role">Role</Label>
                  <select
                    id="member-role"
                    v-model="form.role"
                    class="w-full p-2 border rounded"
                  >
                    <option
                      v-for="role in roleOptions"
                      :key="role.value"
                      :value="role.value"
                    >
                      {{ role.label }}
                    </option>
                  </select>
                  <p class="text-xs t-text-muted">
                    HOA Admins can manage members, documents, and settings
                  </p>
                </div>
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
                <p v-if="!units?.length" class="text-xs t-text-muted">
                  No units available.
                  <NuxtLink :to="buildOrgPath('/admin/units')" class="text-primary underline"
                    >Add units first</NuxtLink
                  >
                </p>
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
                <p v-if="!members?.length" class="text-xs t-text-muted">
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
                  <p class="text-xs t-text-muted">Leave empty for ongoing</p>
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
      </PageContainer>
  </div>
</template>
