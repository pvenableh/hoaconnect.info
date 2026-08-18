<script setup lang="ts">
// Records hub — the community's materials: meetings, documents, file storage,
// and rules. (Usage analytics — resident Activity, AI spend — live under the
// Dashboard.) The dock "Records" slot opens this (route /admin/reporting).
// Child links come from useSectionNav (shared source).

const groups = useSectionHubGroups("records");
</script>

<template>
  <AdminSectionHub
    eyebrow="Admin"
    title="Records"
    subtitle="Meetings, documents, files, and rules — the records your community runs on."
    :groups="groups"
  />
</template>
