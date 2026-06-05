<script setup lang="ts">
definePageMeta({
  middleware: ["admin", "subscription"],
  layout: "auth",
});
</script>

<template>
  <div class="min-h-screen t-bg t-text t-transition">
    <div class="p-6 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 class="text-2xl font-semibold t-text">Moderation</h1>
        <p class="text-sm t-text-muted mt-0.5">
          Review reported comments. Hiding a comment removes it from members.
        </p>
      </div>

      <ModerationModerationQueue />
    </div>
  </div>
</template>
