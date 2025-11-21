<script setup lang="ts">
definePageMeta({
  middleware: "auth",
  layout: "auth",
});

const { user } = useDirectusAuth();
const { list: listDocuments } = useDirectusItems("hoa_documents");
const { list: listMembers } = useDirectusItems("hoa_members");
const { list: listUnits } = useDirectusItems("hoa_units");

// Await to ensure org is loaded during SSR
const { selectedOrgId, currentOrg, currentRole } = await useSelectedOrg();

// Watch for org changes and refresh data
const orgId = computed(() => selectedOrgId.value);

// Fetch recent documents
const { data: documents, refresh: refreshDocs } = await useAsyncData(
  `dashboard-docs-${orgId.value}`,
  async () => {
    if (!orgId.value) return [];
    const result = await listDocuments({
      fields: ["id", "title", "category", "date_published"],
      filter: {
        organization: { _eq: orgId.value },
        status: { _eq: "published" },
      },
      sort: ["sort", "-date_published"],
      limit: 5,
    });
    return result || [];
  },
  {
    watch: [orgId],
  }
);

// Fetch members count
const { data: members, refresh: refreshMembers } = await useAsyncData(
  `dashboard-members-${orgId.value}`,
  async () => {
    if (!orgId.value) return [];
    const result = await listMembers({
      fields: ["id"],
      filter: {
        organization: { _eq: orgId.value },
        status: { _in: ["active", "inactive"] },
      },
    });
    return result || [];
  },
  {
    watch: [orgId],
  }
);

// Fetch units count
const { data: units, refresh: refreshUnits } = await useAsyncData(
  `dashboard-units-${orgId.value}`,
  async () => {
    if (!orgId.value) return [];
    const result = await listUnits({
      fields: ["id"],
      filter: {
        organization: { _eq: orgId.value },
        status: { _in: ["active", "inactive"] },
      },
    });
    return result || [];
  },
  {
    watch: [orgId],
  }
);

const stats = computed(() => ({
  documents: documents.value?.length || 0,
  members: members.value?.length || 0,
  units: units.value?.length || 0,
  organization:
    (typeof currentOrg.value?.organization === "object"
      ? currentOrg.value?.organization?.name
      : null) || "N/A",
  role: currentRole.value,
}));
</script>

<template>
  <div class="min-h-screen bg-stone-50">
    <div class="p-6">
      <div class="max-w-7xl mx-auto space-y-6">
        <!-- Debug Component -->
        <DebugOrgData />

        <!-- Permissions Diagnostic -->
        <PermissionsDiagnostic />

        <!-- Header -->
        <div>
          <h1 class="text-3xl font-bold">Dashboard</h1>
          <p class="text-stone-600">{{ stats.organization }}</p>
        </div>

        <!-- Stats -->
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Documents</CardTitle>
              <CardDescription>Published</CardDescription>
            </CardHeader>
            <CardContent>
              <p class="text-4xl font-bold">{{ stats.documents }}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Units</CardTitle>
              <CardDescription>Total</CardDescription>
            </CardHeader>
            <CardContent>
              <p class="text-4xl font-bold">{{ stats.units }}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Members</CardTitle>
              <CardDescription>Owners & Tenants</CardDescription>
            </CardHeader>
            <CardContent>
              <p class="text-4xl font-bold">{{ stats.members }}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Your Role</CardTitle>
              <CardDescription>Access Level</CardDescription>
            </CardHeader>
            <CardContent>
              <p class="text-2xl font-semibold capitalize">{{ stats.role }}</p>
            </CardContent>
          </Card>
        </div>

        <!-- Quick Actions -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Recent Documents</CardTitle>
            </CardHeader>
            <CardContent>
              <div v-if="documents?.length" class="space-y-2">
                <NuxtLink
                  v-for="doc in documents"
                  :key="doc.id"
                  :to="`/documents/${doc.id}`"
                  class="block p-3 hover:bg-stone-100 rounded"
                >
                  <p class="font-medium">{{ doc.title }}</p>
                  <p class="text-sm text-stone-500">{{ doc.category }}</p>
                </NuxtLink>
              </div>
              <p v-else class="text-stone-500">No documents yet</p>
            </CardContent>
            <CardFooter>
              <Button
                @click="navigateTo('/documents')"
                variant="outline"
                class="w-full"
              >
                View All Documents
              </Button>
            </CardFooter>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
            </CardHeader>
            <CardContent class="space-y-2">
              <Button @click="navigateTo('/documents/upload')" class="w-full">
                Upload Document
              </Button>
              <Button
                @click="navigateTo('/units')"
                variant="outline"
                class="w-full"
              >
                Manage Units
              </Button>
              <Button
                @click="navigateTo('/members/invite')"
                variant="outline"
                class="w-full"
              >
                Invite Member
              </Button>
              <Button
                @click="navigateTo('/members')"
                variant="outline"
                class="w-full"
              >
                Manage Members
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  </div>
</template>
