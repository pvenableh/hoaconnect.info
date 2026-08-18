<script setup lang="ts">
// People hub — everyone connected to the community: members, units, board,
// committees, and vendors. Child links come from useSectionNav (the shared
// source the grouped sidebar + modern sub-nav also read) so they can't drift.

const groups = useSectionHubGroups("people");
</script>

<template>
  <AdminSectionHub
    eyebrow="Admin"
    title="People"
    subtitle="Members, units, board, committees, and the vendors who serve your community."
    :groups="groups"
  />
</template>
