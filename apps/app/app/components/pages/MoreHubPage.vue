<script setup lang="ts">
// Requests hub — the community's action queue: resident requests, projects, the
// member-change approval queue, and moderation. The dock "Requests" slot opens
// this (route /admin/more). Child links + groups come from useSectionNav.

const groups = useSectionHubGroups("requests");
</script>

<template>
  <AdminSectionHub
    eyebrow="Admin"
    title="Requests"
    subtitle="Resident requests, projects, approvals, and moderation — your community's action queue."
    :groups="groups"
  />
</template>
