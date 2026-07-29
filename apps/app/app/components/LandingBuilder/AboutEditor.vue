<script setup lang="ts">
// Inline editor for the About section — a short description of the community.
// The text lives on settings.description (site.description), rendered by the
// public About block.
import { useLandingBuilderContext } from "#core/app/composables/useLandingBuilder";

const { site } = useLandingBuilderContext();
</script>

<template>
  <div class="space-y-1.5">
    <p class="text-sm t-text-muted">A short description of your community, shown in the About section.</p>
    <textarea
      v-model="site.description"
      rows="5"
      placeholder="Tell visitors about your community…"
      class="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
    />
  </div>
</template>
