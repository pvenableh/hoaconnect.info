<script setup lang="ts">
// "More" hub — the long tail that doesn't earn a daily dock slot. The dock now
// surfaces the high-frequency apps directly (Members, Meetings, Documents,
// Requests); everything else lives here. Cards gate on their module toggles.
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
    label: "People & roles",
    items: [
      { label: "Units", description: "Units, addresses, and occupancy.", icon: "door-closed", to: buildOrgPath("/admin/units"), show: isEnabled("directory") },
      { label: "Board", description: "Board roster and current terms.", icon: "award", to: buildOrgPath("/board"), show: isEnabled("board") },
      { label: "Teams", description: "Committees and working groups.", icon: "users", to: buildOrgPath("/admin/teams") },
      { label: "Vendors & management", description: "Service providers and property-manager access.", icon: "contact", to: buildOrgPath("/admin/settings/property-management"), show: isEnabled("vendors") },
    ],
  },
  {
    label: "Governance & records",
    items: [
      { label: "Rules", description: "By-laws, CC&Rs, and searchable governance.", icon: "scale", to: buildOrgPath("/rules"), show: isEnabled("rules") },
      { label: "Storage", description: "Dropbox-style manager for raw folders and files.", icon: "folder", to: buildOrgPath("/admin/files"), show: isEnabled("files") },
      { label: "Moderation", description: "Review flagged posts, comments, and reports.", icon: "shield-alert", to: buildOrgPath("/admin/moderation"), show: isEnabled("moderation") },
    ],
  },
]);
</script>

<template>
  <AdminSectionHub
    eyebrow="Admin"
    title="More"
    subtitle="Units, board, committees, vendors, governance, and records — everything beyond the daily apps."
    :groups="groups"
  />
</template>
