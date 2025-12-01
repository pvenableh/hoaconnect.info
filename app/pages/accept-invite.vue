<script setup lang="ts">
const route = useRoute();
const token = route.query.token as string;

if (!token) {
  throw createError({
    statusCode: 400,
    message: "Invalid invitation link",
  });
}

definePageMeta({
  middleware: "guest", // Only accessible to non-logged-in users
  layout: "auth",
});

useSeoMeta({
  title: "Accept Invitation",
  description: "Accept your invitation to join your HOA",
});
</script>

<template>
  <div class="min-h-screen flex items-center justify-center p-4">
    <HoaInvitationAcceptForm :token="token" redirect-to="/dashboard" />
  </div>
</template>
