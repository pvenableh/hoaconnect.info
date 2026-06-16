<script setup lang="ts">
// People hub — everyone connected to the community: members, units, board,
// committees, and vendors. Cards gate on their module toggles.
import type { HubGroup } from "~/components/Admin/SectionHub.vue";

const { buildOrgPath } = useOrgNavigation();
const { isEnabled } = useModules();

const groups = computed<HubGroup[]>(() => [
  {
    items: [
      { label: "Members", description: "Owners, tenants, and their contact details.", icon: "users-round", to: buildOrgPath("/admin/members"), show: isEnabled("directory") },
      { label: "Units", description: "Units, addresses, and occupancy.", icon: "door-closed", to: buildOrgPath("/admin/units"), show: isEnabled("directory") },
      { label: "Board", description: "Board roster and current terms.", icon: "award", to: buildOrgPath("/board"), show: isEnabled("board") },
      { label: "Teams", description: "Committees and working groups.", icon: "users", to: buildOrgPath("/admin/teams") },
      { label: "Vendors & management", description: "Service providers and property-manager access.", icon: "contact", to: buildOrgPath("/admin/settings/property-management"), show: isEnabled("vendors") },
    ],
  },
]);
</script>

<template>
  <AdminSectionHub
    eyebrow="Admin"
    title="People"
    subtitle="Members, units, board, committees, and the vendors who serve your community."
    :groups="groups"
  />
</template>
