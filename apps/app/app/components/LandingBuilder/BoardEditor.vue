<script setup lang="ts">
// Inline editor for the Board section. The roster lives under Members; here the
// admin only toggles whether the "Meet the board" section shows.
import { useLandingBuilderContext } from "#core/app/composables/useLandingBuilder";

const { site } = useLandingBuilderContext();
</script>

<template>
  <div class="flex items-center justify-between gap-3">
    <div>
      <p class="font-medium t-text text-sm">Show board of directors</p>
      <p class="text-xs t-text-muted">
        Display the "Meet the board" section. Edit the roster under Members → Board.
      </p>
    </div>
    <Switch v-model="site.show_board" />
  </div>
</template>
