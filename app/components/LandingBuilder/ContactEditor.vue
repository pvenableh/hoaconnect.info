<script setup lang="ts">
// Inline editor for the Contact section — the org's public phone/email (org
// fields on site.phone/site.email). Inquiry routing lives in Site settings.
import { useLandingBuilderContext } from "#core/app/composables/useLandingBuilder";

const { site } = useLandingBuilderContext();
</script>

<template>
  <div class="space-y-3">
    <p class="text-sm t-text-muted">Contact details shown in the "Get in Touch" section.</p>
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div class="space-y-1.5">
        <Label>Phone</Label>
        <Input v-model="site.phone" placeholder="(555) 555-5555" />
      </div>
      <div class="space-y-1.5">
        <Label>Email</Label>
        <Input v-model="site.email" placeholder="info@yourbuilding.com" />
      </div>
    </div>
  </div>
</template>
