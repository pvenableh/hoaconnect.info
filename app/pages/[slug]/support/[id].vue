<script setup lang="ts">
// A bell, push or email link to a support request lands here; the request
// lives at /support/:id whatever the community.
definePageMeta({ middleware: ["auth"] });
const route = useRoute();
await navigateTo(`/support/${encodeURIComponent(String(route.params.id))}`, { replace: true });
</script>

<template><div /></template>
