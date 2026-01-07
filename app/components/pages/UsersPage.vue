<script setup lang="ts">
import { useDirectusItems } from "#imports";
import { toast } from "vue-sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { HoaMember, HoaJoinRequest, DirectusUser, HoaUnit } from "~~/types/directus";

const { list: listMembers, update: updateMember } = useDirectusItems("hoa_members");
const { list: listJoinRequests } = useDirectusItems("hoa_join_requests");
const { list: listUnits } = useDirectusItems("hoa_units");
const { buildOrgPath, navigateToOrg } = useOrgNavigation();

// Await to ensure org is loaded during SSR
const { currentOrg, selectedOrgId, isLoading } = await useSelectedOrg();

// Current tab
const activeTab = ref<"users" | "requests" | "connect">("users");

// Computed organization from the composable
const organization = computed(() => currentOrg.value?.organization || null);

// Use selectedOrgId directly (primitive value) for immediate reactivity
const orgId = computed(() => selectedOrgId.value);

// Role configuration
const config = useRuntimeConfig();
const roleOptions = [
  { value: config.public.directusRoleHoaAdmin, label: "HOA Admin" },
  { value: config.public.directusRoleMember, label: "Member" },
];

// Get role display name
const getRoleDisplay = (roleId: string | null | undefined): string => {
  if (!roleId) return "—";
  const role = roleOptions.find((r) => r.value === roleId);
  return role?.label || "Member";
};

// Get role badge color
const getRoleBadgeClass = (roleId: string | null | undefined): string => {
  if (roleId === config.public.directusRoleHoaAdmin) {
    return "bg-purple-100 text-purple-800";
  }
  return "t-bg-subtle t-text-secondary";
};

// Fetch members with linked user accounts
const { data: membersWithAccounts, refresh: refreshMembers } = await useAsyncData(
  `hoa-members-with-accounts-${orgId.value}`,
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
          "role",
          "status",
          "date_created",
          "user.id",
          "user.email",
          "user.first_name",
          "user.last_name",
          "user.status",
          "user.last_access",
          "units.id",
          "units.is_primary_unit",
          "units.unit_id.id",
          "units.unit_id.unit_number",
        ],
        filter: {
          organization: { _eq: orgId.value },
          user: { _nnull: true },
          status: { _in: ["active", "inactive", "pending"] },
        },
        sort: ["last_name"],
      })) as any[];

      return result || [];
    } catch (error) {
      console.error("Error fetching members with accounts:", error);
      return [];
    }
  },
  {
    watch: [orgId],
    server: false,
  }
);

// Fetch members WITHOUT linked user accounts (for connect tab)
const { data: membersWithoutAccounts, refresh: refreshMembersWithoutAccounts } = await useAsyncData(
  `hoa-members-without-accounts-${orgId.value}`,
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
          "role",
          "status",
          "date_created",
        ],
        filter: {
          organization: { _eq: orgId.value },
          user: { _null: true },
          status: { _in: ["active", "inactive", "pending"] },
        },
        sort: ["last_name"],
      })) as any[];

      return result || [];
    } catch (error) {
      console.error("Error fetching members without accounts:", error);
      return [];
    }
  },
  {
    watch: [orgId],
    server: false,
  }
);

// Fetch pending join requests
const { data: joinRequests, refresh: refreshJoinRequests } = await useAsyncData(
  `hoa-join-requests-${orgId.value}`,
  async () => {
    if (!orgId.value) return [];

    try {
      const result = (await listJoinRequests({
        fields: [
          "id",
          "status",
          "unit_number",
          "member_type",
          "message",
          "date_created",
          "user.id",
          "user.email",
          "user.first_name",
          "user.last_name",
        ],
        filter: {
          organization: { _eq: orgId.value },
          status: { _eq: "pending" },
        },
        sort: ["-date_created"],
      })) as any[];

      return result || [];
    } catch (error) {
      console.error("Error fetching join requests:", error);
      return [];
    }
  },
  {
    watch: [orgId],
    server: false,
  }
);

// Fetch available units for dropdown
const { data: units } = await useAsyncData(
  `units-dropdown-users-${orgId.value}`,
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

// Search and filter
const searchQuery = ref("");

const filteredMembersWithAccounts = computed(() => {
  if (!membersWithAccounts.value) return [];
  if (!searchQuery.value) return membersWithAccounts.value;

  const query = searchQuery.value.toLowerCase();
  return membersWithAccounts.value.filter(
    (m: any) =>
      m.first_name?.toLowerCase().includes(query) ||
      m.last_name?.toLowerCase().includes(query) ||
      m.email?.toLowerCase().includes(query) ||
      m.user?.email?.toLowerCase().includes(query)
  );
});

// Approve join request modal
const showApproveModal = ref(false);
const selectedRequest = ref<any>(null);
const approveForm = reactive({
  roleId: config.public.directusRoleMember as string,
  unitId: null as string | null,
});
const isApproving = ref(false);

const openApproveModal = (request: any) => {
  selectedRequest.value = request;
  approveForm.roleId = config.public.directusRoleMember;
  approveForm.unitId = null;
  showApproveModal.value = true;
};

const handleApproveRequest = async () => {
  if (!selectedRequest.value) return;

  isApproving.value = true;
  try {
    await $fetch("/api/hoa/approve-join-request", {
      method: "POST",
      body: {
        requestId: selectedRequest.value.id,
        roleId: approveForm.roleId,
        unitId: approveForm.unitId,
      },
    });

    toast.success("Join request approved", {
      description: `${selectedRequest.value.user?.first_name} ${selectedRequest.value.user?.last_name} is now a member.`,
    });

    showApproveModal.value = false;
    await Promise.all([refreshJoinRequests(), refreshMembers()]);
  } catch (error: any) {
    toast.error("Failed to approve request", {
      description: error?.data?.message || error?.message || "Please try again.",
    });
  } finally {
    isApproving.value = false;
  }
};

// Reject join request
const isRejecting = ref<string | null>(null);
const handleRejectRequest = async (request: any) => {
  if (!confirm(`Are you sure you want to reject the request from ${request.user?.first_name} ${request.user?.last_name}?`)) {
    return;
  }

  isRejecting.value = request.id;
  try {
    await $fetch("/api/hoa/reject-join-request", {
      method: "POST",
      body: {
        requestId: request.id,
        reason: "Request rejected by administrator",
      },
    });

    toast.success("Join request rejected");
    await refreshJoinRequests();
  } catch (error: any) {
    toast.error("Failed to reject request", {
      description: error?.data?.message || error?.message || "Please try again.",
    });
  } finally {
    isRejecting.value = null;
  }
};

// Connect user to member modal
const showConnectModal = ref(false);
const selectedMemberForConnect = ref<any>(null);
const connectForm = reactive({
  userEmail: "",
});
const isConnecting = ref(false);
const searchingUsers = ref(false);
const foundUsers = ref<any[]>([]);

const openConnectModal = (member: any) => {
  selectedMemberForConnect.value = member;
  connectForm.userEmail = member.email || "";
  foundUsers.value = [];
  showConnectModal.value = true;
};

const searchUsers = async () => {
  if (!connectForm.userEmail || connectForm.userEmail.length < 3) {
    foundUsers.value = [];
    return;
  }

  searchingUsers.value = true;
  try {
    // Use the directus items API to search users
    const response = await $fetch("/api/directus/items", {
      method: "POST",
      body: {
        collection: "directus_users",
        operation: "list",
        query: {
          fields: ["id", "email", "first_name", "last_name", "status"],
          filter: {
            email: { _contains: connectForm.userEmail.toLowerCase() },
            status: { _eq: "active" },
          },
          limit: 10,
        },
      },
    });

    foundUsers.value = (response as any) || [];
  } catch (error) {
    console.error("Error searching users:", error);
    foundUsers.value = [];
  } finally {
    searchingUsers.value = false;
  }
};

const handleConnectUser = async (userId: string) => {
  if (!selectedMemberForConnect.value) return;

  isConnecting.value = true;
  try {
    await $fetch("/api/hoa/connect-user-to-member", {
      method: "POST",
      body: {
        memberId: selectedMemberForConnect.value.id,
        userId,
      },
    });

    toast.success("User connected to member", {
      description: `Account linked to ${selectedMemberForConnect.value.first_name} ${selectedMemberForConnect.value.last_name}.`,
    });

    showConnectModal.value = false;
    await Promise.all([refreshMembers(), refreshMembersWithoutAccounts()]);
  } catch (error: any) {
    toast.error("Failed to connect user", {
      description: error?.data?.message || error?.message || "Please try again.",
    });
  } finally {
    isConnecting.value = false;
  }
};

// Update member status
const handleUpdateStatus = async (member: any, newStatus: string) => {
  try {
    await updateMember(member.id, { status: newStatus });
    toast.success("Member status updated");
    await refreshMembers();
  } catch (error: any) {
    toast.error("Failed to update status", {
      description: error?.message || "Please try again.",
    });
  }
};

// Utility functions
const formatDate = (date: string) => {
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

const formatLastAccess = (date: string | null) => {
  if (!date) return "Never";
  const d = new Date(date);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  return formatDate(date);
};

const getStatusBadgeClass = (status: string) => {
  const classes: Record<string, string> = {
    active: "bg-green-100 text-green-800",
    inactive: "bg-gray-100 text-gray-800",
    pending: "bg-yellow-100 text-yellow-800",
    suspended: "bg-red-100 text-red-800",
    archived: "bg-gray-100 text-gray-600",
  };
  return classes[status] || "bg-gray-100 text-gray-800";
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

useSeoMeta({
  title: "User Management",
  description: "Manage user access and accounts for your HOA",
});
</script>

<template>
  <div class="min-h-screen t-bg">
    <div class="p-6">
      <div class="max-w-7xl mx-auto">
        <div class="mb-8">
          <h1 class="text-3xl font-bold mb-2">User Management</h1>
          <p class="t-text-secondary">
            Manage user accounts, approve join requests, and connect users to members
          </p>
        </div>

        <!-- Loading State -->
        <div v-if="isLoading" class="text-center py-12">
          <Icon
            name="lucide:loader-2"
            class="w-8 h-8 animate-spin mx-auto mb-4"
          />
          <p class="text-sm t-text-secondary">Loading your organization...</p>
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
          <div class="border-b t-border">
            <nav class="flex space-x-8">
              <button
                @click="activeTab = 'users'"
                :class="[
                  'py-4 px-1 border-b-2 font-medium text-sm transition-colors',
                  activeTab === 'users'
                    ? 'border-primary text-primary'
                    : 'border-transparent t-text-secondary hover:t-text hover:border-muted',
                ]"
              >
                <Icon name="lucide:users" class="w-4 h-4 inline mr-1" />
                Users with Accounts ({{ membersWithAccounts?.length || 0 }})
              </button>
              <button
                @click="activeTab = 'requests'"
                :class="[
                  'py-4 px-1 border-b-2 font-medium text-sm transition-colors',
                  activeTab === 'requests'
                    ? 'border-primary text-primary'
                    : 'border-transparent t-text-secondary hover:t-text hover:border-muted',
                ]"
              >
                <Icon name="lucide:user-plus" class="w-4 h-4 inline mr-1" />
                Join Requests
                <span
                  v-if="joinRequests?.length"
                  class="ml-1 bg-amber-100 text-amber-800 text-xs px-2 py-0.5 rounded-full"
                >
                  {{ joinRequests.length }}
                </span>
              </button>
              <button
                @click="activeTab = 'connect'"
                :class="[
                  'py-4 px-1 border-b-2 font-medium text-sm transition-colors',
                  activeTab === 'connect'
                    ? 'border-primary text-primary'
                    : 'border-transparent t-text-secondary hover:t-text hover:border-muted',
                ]"
              >
                <Icon name="lucide:link" class="w-4 h-4 inline mr-1" />
                Connect Users ({{ membersWithoutAccounts?.length || 0 }})
              </button>
            </nav>
          </div>

          <!-- Users with Accounts Tab -->
          <div v-if="activeTab === 'users'" class="space-y-4">
            <!-- Search -->
            <div class="flex justify-between items-center">
              <div class="relative">
                <Icon
                  name="lucide:search"
                  class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 t-text-muted"
                />
                <Input
                  v-model="searchQuery"
                  placeholder="Search users..."
                  class="pl-10 w-64"
                />
              </div>
              <Button @click="navigateToOrg('/admin/members')" variant="outline">
                <Icon name="lucide:users" class="w-4 h-4 mr-2" />
                Manage Members
              </Button>
            </div>

            <!-- Users Table -->
            <Card>
              <CardContent class="pt-6">
                <div class="overflow-x-auto">
                  <table class="w-full">
                    <thead>
                      <tr class="border-b">
                        <th class="text-left p-3">Name</th>
                        <th class="text-left p-3">Email</th>
                        <th class="text-left p-3">Role</th>
                        <th class="text-left p-3">Unit(s)</th>
                        <th class="text-left p-3">Status</th>
                        <th class="text-left p-3">Last Access</th>
                        <th class="text-right p-3">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr
                        v-for="member in filteredMembersWithAccounts"
                        :key="member.id"
                        class="border-b hover:t-bg-subtle"
                      >
                        <td class="p-3">
                          <div class="flex items-center gap-2">
                            <div
                              class="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium text-primary"
                            >
                              {{ member.first_name?.[0] || '' }}{{ member.last_name?.[0] || '' }}
                            </div>
                            <span>{{ member.first_name }} {{ member.last_name }}</span>
                          </div>
                        </td>
                        <td class="p-3">{{ member.user?.email || member.email }}</td>
                        <td class="p-3">
                          <span
                            class="text-xs px-2 py-1 rounded font-medium"
                            :class="getRoleBadgeClass(member.role)"
                          >
                            {{ getRoleDisplay(member.role) }}
                          </span>
                        </td>
                        <td class="p-3">{{ formatUnits(member) }}</td>
                        <td class="p-3">
                          <span
                            class="text-xs px-2 py-1 rounded font-medium"
                            :class="getStatusBadgeClass(member.status)"
                          >
                            {{ member.status }}
                          </span>
                        </td>
                        <td class="p-3 text-sm t-text-secondary">
                          {{ formatLastAccess(member.user?.last_access) }}
                        </td>
                        <td class="p-3 text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger as-child>
                              <Button variant="ghost" size="sm">
                                <Icon name="lucide:more-horizontal" class="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                v-if="member.status !== 'active'"
                                @click="handleUpdateStatus(member, 'active')"
                              >
                                <Icon name="lucide:check" class="w-4 h-4 mr-2" />
                                Activate
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                v-if="member.status !== 'inactive'"
                                @click="handleUpdateStatus(member, 'inactive')"
                              >
                                <Icon name="lucide:pause" class="w-4 h-4 mr-2" />
                                Deactivate
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem @click="navigateToOrg('/admin/members')">
                                <Icon name="lucide:edit" class="w-4 h-4 mr-2" />
                                Edit Member
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div
                  v-if="!filteredMembersWithAccounts?.length"
                  class="text-center py-12 t-text-muted"
                >
                  <Icon
                    name="lucide:users"
                    class="w-12 h-12 mx-auto mb-4 t-text-muted"
                  />
                  <p class="font-medium">No users with accounts</p>
                  <p class="text-sm mt-1">
                    Members with linked accounts will appear here
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          <!-- Join Requests Tab -->
          <div v-if="activeTab === 'requests'" class="space-y-4">
            <!-- Info Box -->
            <Card class="bg-amber-50 border-amber-200">
              <CardContent class="pt-6">
                <p class="text-sm text-amber-900">
                  <strong>Join Requests:</strong>
                  Users who have registered and requested to join your HOA will appear here.
                  Review their details and approve or reject their request.
                </p>
              </CardContent>
            </Card>

            <!-- Requests List -->
            <Card>
              <CardHeader>
                <CardTitle>Pending Join Requests</CardTitle>
                <CardDescription>
                  Review and process requests from users who want to join your HOA
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div v-if="joinRequests?.length" class="space-y-4">
                  <div
                    v-for="request in joinRequests"
                    :key="request.id"
                    class="flex items-start justify-between p-4 border rounded-lg hover:t-bg-subtle"
                  >
                    <div class="flex-1">
                      <div class="flex items-center gap-3 mb-2">
                        <div
                          class="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary"
                        >
                          {{ request.user?.first_name?.[0] || '' }}{{ request.user?.last_name?.[0] || '' }}
                        </div>
                        <div>
                          <p class="font-medium">
                            {{ request.user?.first_name }} {{ request.user?.last_name }}
                          </p>
                          <p class="text-sm t-text-secondary">{{ request.user?.email }}</p>
                        </div>
                      </div>
                      <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mt-3">
                        <div>
                          <span class="t-text-muted">Unit:</span>
                          <span class="ml-2 font-medium">{{ request.unit_number || 'Not specified' }}</span>
                        </div>
                        <div>
                          <span class="t-text-muted">Type:</span>
                          <span class="ml-2 font-medium capitalize">{{ request.member_type || 'Not specified' }}</span>
                        </div>
                        <div>
                          <span class="t-text-muted">Requested:</span>
                          <span class="ml-2">{{ formatDate(request.date_created) }}</span>
                        </div>
                      </div>
                      <p v-if="request.message" class="text-sm t-text-secondary mt-2 italic">
                        "{{ request.message }}"
                      </p>
                    </div>
                    <div class="flex gap-2 ml-4">
                      <Button
                        @click="openApproveModal(request)"
                        size="sm"
                        variant="default"
                      >
                        <Icon name="lucide:check" class="w-4 h-4 mr-1" />
                        Approve
                      </Button>
                      <Button
                        @click="handleRejectRequest(request)"
                        size="sm"
                        variant="destructive"
                        :disabled="isRejecting === request.id"
                      >
                        <Icon
                          v-if="isRejecting === request.id"
                          name="lucide:loader-2"
                          class="w-4 h-4 animate-spin"
                        />
                        <Icon v-else name="lucide:x" class="w-4 h-4 mr-1" />
                        Reject
                      </Button>
                    </div>
                  </div>
                </div>

                <div
                  v-else
                  class="text-center py-12 t-text-muted"
                >
                  <Icon
                    name="lucide:inbox"
                    class="w-12 h-12 mx-auto mb-4 t-text-muted"
                  />
                  <p class="font-medium">No pending requests</p>
                  <p class="text-sm mt-1">
                    New join requests will appear here for your review
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          <!-- Connect Users Tab -->
          <div v-if="activeTab === 'connect'" class="space-y-4">
            <!-- Info Box -->
            <Card class="bg-blue-50 border-blue-200">
              <CardContent class="pt-6">
                <p class="text-sm text-blue-900">
                  <strong>Connect Users:</strong>
                  These are member records that don't have a linked user account.
                  You can connect them to existing user accounts so members can log in.
                </p>
              </CardContent>
            </Card>

            <!-- Members without accounts list -->
            <Card>
              <CardHeader>
                <CardTitle>Members Without Accounts</CardTitle>
                <CardDescription>
                  Connect these members to existing user accounts to give them login access
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div v-if="membersWithoutAccounts?.length" class="space-y-3">
                  <div
                    v-for="member in membersWithoutAccounts"
                    :key="member.id"
                    class="flex items-center justify-between p-4 border rounded-lg hover:t-bg-subtle"
                  >
                    <div class="flex items-center gap-3">
                      <div
                        class="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-sm font-semibold t-text-secondary"
                      >
                        {{ member.first_name?.[0] || '' }}{{ member.last_name?.[0] || '' }}
                      </div>
                      <div>
                        <p class="font-medium">
                          {{ member.first_name }} {{ member.last_name }}
                        </p>
                        <p class="text-sm t-text-secondary">{{ member.email || 'No email' }}</p>
                      </div>
                    </div>
                    <div class="flex items-center gap-4">
                      <span
                        class="text-xs px-2 py-1 rounded font-medium capitalize"
                        :class="getStatusBadgeClass(member.status)"
                      >
                        {{ member.status }}
                      </span>
                      <Button @click="openConnectModal(member)" size="sm" variant="outline">
                        <Icon name="lucide:link" class="w-4 h-4 mr-1" />
                        Connect Account
                      </Button>
                    </div>
                  </div>
                </div>

                <div
                  v-else
                  class="text-center py-12 t-text-muted"
                >
                  <Icon
                    name="lucide:check-circle"
                    class="w-12 h-12 mx-auto mb-4 t-text-muted"
                  />
                  <p class="font-medium">All members have accounts</p>
                  <p class="text-sm mt-1">
                    Every member record is linked to a user account
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          <!-- Approve Join Request Modal -->
          <Dialog v-model:open="showApproveModal">
            <DialogContent class="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>Approve Join Request</DialogTitle>
                <DialogDescription>
                  Approve this request and create a member record for the user.
                </DialogDescription>
              </DialogHeader>
              <div v-if="selectedRequest" class="grid gap-4 py-4">
                <!-- User Info -->
                <div class="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
                  <div
                    class="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-lg font-semibold text-primary"
                  >
                    {{ selectedRequest.user?.first_name?.[0] || '' }}{{ selectedRequest.user?.last_name?.[0] || '' }}
                  </div>
                  <div>
                    <p class="font-medium">
                      {{ selectedRequest.user?.first_name }} {{ selectedRequest.user?.last_name }}
                    </p>
                    <p class="text-sm t-text-secondary">{{ selectedRequest.user?.email }}</p>
                  </div>
                </div>

                <!-- Request Details -->
                <div v-if="selectedRequest.unit_number || selectedRequest.member_type" class="grid grid-cols-2 gap-4 text-sm">
                  <div v-if="selectedRequest.unit_number">
                    <span class="t-text-muted">Requested Unit:</span>
                    <span class="ml-2 font-medium">{{ selectedRequest.unit_number }}</span>
                  </div>
                  <div v-if="selectedRequest.member_type">
                    <span class="t-text-muted">Member Type:</span>
                    <span class="ml-2 font-medium capitalize">{{ selectedRequest.member_type }}</span>
                  </div>
                </div>

                <!-- Role Selection -->
                <div class="grid gap-2">
                  <Label for="approve-role">Assign Role</Label>
                  <select
                    id="approve-role"
                    v-model="approveForm.roleId"
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

                <!-- Unit Selection -->
                <div class="grid gap-2">
                  <Label for="approve-unit">Assign to Unit (Optional)</Label>
                  <select
                    id="approve-unit"
                    v-model="approveForm.unitId"
                    class="w-full p-2 border rounded"
                  >
                    <option :value="null">No Unit</option>
                    <option
                      v-for="unit in units"
                      :key="unit.id"
                      :value="unit.id"
                    >
                      {{ unit.unit_number }}
                    </option>
                  </select>
                </div>
              </div>
              <DialogFooter>
                <Button
                  @click="showApproveModal = false"
                  variant="outline"
                  :disabled="isApproving"
                >
                  Cancel
                </Button>
                <Button @click="handleApproveRequest" :disabled="isApproving">
                  <Icon
                    v-if="isApproving"
                    name="lucide:loader-2"
                    class="w-4 h-4 mr-2 animate-spin"
                  />
                  Approve & Create Member
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <!-- Connect User Modal -->
          <Dialog v-model:open="showConnectModal">
            <DialogContent class="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>Connect User Account</DialogTitle>
                <DialogDescription>
                  Search for an existing user account to link to this member.
                </DialogDescription>
              </DialogHeader>
              <div v-if="selectedMemberForConnect" class="grid gap-4 py-4">
                <!-- Member Info -->
                <div class="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
                  <div
                    class="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center text-lg font-semibold t-text-secondary"
                  >
                    {{ selectedMemberForConnect.first_name?.[0] || '' }}{{ selectedMemberForConnect.last_name?.[0] || '' }}
                  </div>
                  <div>
                    <p class="font-medium">
                      {{ selectedMemberForConnect.first_name }} {{ selectedMemberForConnect.last_name }}
                    </p>
                    <p class="text-sm t-text-secondary">{{ selectedMemberForConnect.email || 'No email on record' }}</p>
                  </div>
                </div>

                <!-- Search Users -->
                <div class="grid gap-2">
                  <Label for="search-email">Search by Email</Label>
                  <div class="flex gap-2">
                    <Input
                      id="search-email"
                      v-model="connectForm.userEmail"
                      placeholder="Enter email to search..."
                      class="flex-1"
                      @keyup.enter="searchUsers"
                    />
                    <Button @click="searchUsers" :disabled="searchingUsers" variant="outline">
                      <Icon
                        v-if="searchingUsers"
                        name="lucide:loader-2"
                        class="w-4 h-4 animate-spin"
                      />
                      <Icon v-else name="lucide:search" class="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                <!-- Search Results -->
                <div v-if="foundUsers.length" class="space-y-2">
                  <Label>Select User Account</Label>
                  <div class="max-h-48 overflow-y-auto space-y-2">
                    <div
                      v-for="user in foundUsers"
                      :key="user.id"
                      class="flex items-center justify-between p-3 border rounded-lg hover:t-bg-subtle cursor-pointer"
                      @click="handleConnectUser(user.id)"
                    >
                      <div>
                        <p class="font-medium">{{ user.first_name }} {{ user.last_name }}</p>
                        <p class="text-sm t-text-secondary">{{ user.email }}</p>
                      </div>
                      <Button size="sm" variant="ghost" :disabled="isConnecting">
                        <Icon
                          v-if="isConnecting"
                          name="lucide:loader-2"
                          class="w-4 h-4 animate-spin"
                        />
                        <Icon v-else name="lucide:link" class="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>

                <div
                  v-else-if="connectForm.userEmail.length >= 3 && !searchingUsers"
                  class="text-center py-4 t-text-muted"
                >
                  <p class="text-sm">No users found matching "{{ connectForm.userEmail }}"</p>
                </div>
              </div>
              <DialogFooter>
                <Button @click="showConnectModal = false" variant="outline">
                  Cancel
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </div>
  </div>
</template>
