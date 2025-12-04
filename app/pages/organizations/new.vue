<script setup lang="ts">
definePageMeta({
  middleware: "auth", // Requires logged-in user
  layout: "auth",
});

useSeoMeta({
  title: "Create New Organization",
  description: "Create an additional organization to manage",
});

const session = useUserSession();
</script>

<template>
  <div class="min-h-screen flex items-center justify-center p-4">
    <div class="w-full max-w-2xl">
      <div class="mb-6 text-center">
        <p class="text-muted-foreground">
          Logged in as {{ session.user.value?.email }}
        </p>
      </div>
      <OrganizationSetupForm
        title="Create New Organization"
        description="Set up an additional organization"
        redirect-to="/dashboard"
        :beta-mode="false"
        :is-logged-in="true"
      />
    </div>
  </div>
</template>
