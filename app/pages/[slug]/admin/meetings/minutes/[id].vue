<script setup lang="ts">
// One decision record. Filed under Meetings rather than under the Board Room:
// minutes are the association's record of itself, and a governance record you
// have to know about an AI feature to find is not one.
definePageMeta({
  middleware: ["admin", "subscription"],
  layout: "auth",
});
</script>

<template>
  <PagesBoardroomMinutesPage />
</template>
