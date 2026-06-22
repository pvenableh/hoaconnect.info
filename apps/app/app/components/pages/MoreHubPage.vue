<script setup lang="ts">
// Requests hub — the community's action queue: resident requests, projects, the
// member-change approval queue, and moderation. The dock "Requests" slot opens
// this (route /admin/more). Cards gate on their module toggles; Approvals is
// always available (resident self-service review).
import type { HubGroup } from "~/components/Admin/SectionHub.vue";

const { buildOrgPath } = useOrgNavigation();
const { isEnabled } = useModules();

const groups = computed<HubGroup[]>(() => [
  {
    label: "Work",
    items: [
      { label: "Requests", description: "Resident maintenance, architectural, and general requests.", icon: "clipboard-list", to: buildOrgPath("/admin/requests"), show: isEnabled("requests") },
      { label: "Projects", description: "Track community projects and tasks to completion.", icon: "kanban-square", to: buildOrgPath("/admin/projects"), show: isEnabled("projects") },
    ],
  },
  {
    label: "Review queues",
    items: [
      { label: "Approvals", description: "Review resident-submitted changes to contact info, mailing address, vehicles, and pets.", icon: "clipboard-check", to: buildOrgPath("/admin/approvals") },
      { label: "Moderation", description: "Review flagged posts, comments, and reports.", icon: "shield-alert", to: buildOrgPath("/admin/moderation"), show: isEnabled("moderation") },
    ],
  },
]);
</script>

<template>
  <AdminSectionHub
    eyebrow="Admin"
    title="Requests"
    subtitle="Resident requests, projects, approvals, and moderation — your community's action queue."
    :groups="groups"
  />
</template>
