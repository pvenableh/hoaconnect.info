<script setup lang="ts">
// The invitation email links to /{slug}/accept-invite ([slug]/accept-invite.vue);
// this path takes the same token. Not guest-only: someone who already has an
// account may be signed in when they open it (InvitationAcceptForm).
const route = useRoute();
const token = route.query.token as string;

if (!token) {
  throw createError({ statusCode: 400, message: "Invalid invitation link" });
}

definePageMeta({ layout: "auth" });

useSeoMeta({
  title: "Accept Invitation",
  description: "Accept your invitation to join your HOA",
});
</script>

<template>
  <div class="min-h-screen flex items-center justify-center p-4">
    <InvitationAcceptForm :token="token" />
  </div>
</template>
