<script setup lang="ts">
// Where every invitation email links: /{slug}/accept-invite?token=…
// (core/server/utils/invitations.ts). There was no page here, so the link
// was a 404 and no invitation could be accepted.
const route = useRoute();
const token = route.query.token as string;

if (!token) {
  throw createError({ statusCode: 400, message: "Invalid invitation link" });
}

definePageMeta({ layout: "auth" });

useSeoMeta({
  title: "Accept Invitation",
  description: "Accept your invitation to join your community on HOA Connect",
});
</script>

<template>
  <div class="min-h-screen flex items-center justify-center p-4">
    <InvitationAcceptForm :token="token" />
  </div>
</template>
