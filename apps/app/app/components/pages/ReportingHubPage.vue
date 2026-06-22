<script setup lang="ts">
// Records hub — the community's records and governance: meetings (and their
// minutes), the published document library, raw file storage, the rules, and
// resident activity. The dock "Records" slot opens this (route /admin/reporting).
import type { HubGroup } from "~/components/Admin/SectionHub.vue";

const { buildOrgPath } = useOrgNavigation();
const { isEnabled } = useModules();

const groups = computed<HubGroup[]>(() => [
  {
    items: [
      { label: "Meetings", description: "Agendas, minutes, RSVPs, and votes.", icon: "calendar-days", to: buildOrgPath("/admin/meetings"), show: isEnabled("meetings") },
      { label: "Documents", description: "The curated, published document library.", icon: "file-text", to: buildOrgPath("/admin/documents"), show: isEnabled("documents") },
      { label: "Storage", description: "Dropbox-style manager for raw folders and files.", icon: "folder", to: buildOrgPath("/admin/files"), show: isEnabled("files") },
      { label: "Rules", description: "By-laws, CC&Rs, and searchable governance.", icon: "scale", to: buildOrgPath("/rules"), show: isEnabled("rules") },
      { label: "Activity", description: "Resident page views, downloads, and logins.", icon: "activity", to: buildOrgPath("/admin/activity"), show: true },
    ],
  },
]);
</script>

<template>
  <AdminSectionHub
    eyebrow="Admin"
    title="Records"
    subtitle="Meetings, documents, files, and rules — the records your community runs on."
    :groups="groups"
  />
</template>
