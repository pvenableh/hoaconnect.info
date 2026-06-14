<script setup lang="ts">
// "More" hub — only the admin tasks that don't already live in another hub.
// People (Members/Units/Board/Teams/Vendors) and Reporting (Documents/Storage/
// Rules/…) own those cards, so they are NOT duplicated here — this keeps to the
// genuinely "More"-only review queues. Cards gate on their module toggles.
import type { HubGroup } from "~/components/Admin/SectionHub.vue";

const { buildOrgPath } = useOrgNavigation();
const { isEnabled } = useModules();

const groups = computed<HubGroup[]>(() => [
  {
    label: "Member requests",
    items: [
      { label: "Approvals", description: "Review resident-submitted changes to contact info, mailing address, vehicles, and pets.", icon: "clipboard-check", to: buildOrgPath("/admin/approvals") },
    ],
  },
  {
    label: "Moderation",
    items: [
      { label: "Moderation", description: "Review flagged posts, comments, and reports.", icon: "shield-alert", to: buildOrgPath("/admin/moderation"), show: isEnabled("moderation") },
    ],
  },
]);
</script>

<template>
  <AdminSectionHub
    eyebrow="Admin"
    title="More"
    subtitle="Member-request approvals and moderation — admin tasks beyond the daily apps."
    :groups="groups"
  />
</template>
