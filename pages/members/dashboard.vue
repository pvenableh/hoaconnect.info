<script setup lang="ts">
import { useDirectusAuth, useDirectusItems } from "#imports";
import { toast } from "vue-sonner";
definePageMeta({
  middleware: "auth", // Requires authentication
});

const { user } = useDirectusAuth();
const { fetchItems } = useDirectusItems();

// Get user's organization
const organization = ref<any>(null);
const loading = ref(true);

onMounted(async () => {
  try {
    // Get the user's HOA membership
    const { data: members } = await fetchItems("hoa_members", {
      filter: {
        user: { _eq: user.value?.id },
      },
      fields: ["id", "organization.*"],
      limit: 1,
    });

    if (members.value && members.value.length > 0) {
      organization.value = members.value[0].organization;
    }
  } catch (err) {
    console.error("Error loading organization:", err);
  } finally {
    loading.value = false;
  }
});

const handleInviteSuccess = () => {
  toast.success("Invitation sent successfully!");
};

useSeoMeta({
  title: "Manage Members",
  description: "Invite and manage members of your HOA",
});
</script>

<template>
  <div class="container mx-auto p-6">
    <div class="mb-8">
      <h1 class="text-3xl font-bold mb-2">Manage Members</h1>
      <p class="text-muted-foreground">
        Invite new members and manage existing memberships
      </p>
    </div>

    <div v-if="loading" class="text-center py-12">
      <Icon name="lucide:loader-2" class="w-8 h-8 animate-spin mx-auto mb-4" />
      <p class="text-sm text-muted-foreground">Loading...</p>
    </div>

    <div v-else-if="!organization" class="text-center py-12">
      <Alert variant="destructive" class="max-w-md mx-auto">
        <Icon name="lucide:alert-circle" class="w-4 h-4" />
        <AlertTitle>No Organization Found</AlertTitle>
        <AlertDescription>
          You are not associated with any HOA organization.
        </AlertDescription>
      </Alert>
    </div>

    <div v-else class="max-w-4xl mx-auto space-y-6">
      <!-- Organization Info -->
      <Card>
        <CardHeader>
          <CardTitle>{{ organization.name }}</CardTitle>
          <CardDescription v-if="organization.address">
            {{ organization.address }}
          </CardDescription>
        </CardHeader>
      </Card>

      <!-- Invite Member Form -->
      <InviteMemberForm
        :organization-id="organization.id"
        @success="handleInviteSuccess"
      />

      <!-- TODO: Add a table/list of existing members and pending invitations -->
    </div>
  </div>
</template>
