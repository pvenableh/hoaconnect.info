<!--
  RestrictionsPostingPausedBanner — on every workspace page of a community
  where the signed-in member's posting is paused
  (docs/spec-member-restrictions.md): until when, the note the board wrote
  them, and a way to reach the board (their requests page). Renders nothing
  for anyone else. Says "paused", never "banned".
-->
<script setup lang="ts">
defineProps<{ organizationName?: string | null }>();

const { paused, until, memberNote } = usePostingPause();
const { buildOrgPath } = useOrgNavigation();
</script>

<template>
  <div v-if="paused" class="border-b t-border bg-warning/15 px-4 py-3" role="status" data-posting-paused-banner>
    <div class="mx-auto flex max-w-7xl flex-wrap items-start justify-between gap-3">
      <div class="flex items-start gap-3">
        <Icon name="i-lucide-message-square-off" class="mt-0.5 size-5 shrink-0 text-warning" />
        <div class="grid gap-0.5">
          <p class="text-sm font-medium t-text">Posting is paused in {{ organizationName || "this community" }} {{ until }}</p>
          <p v-if="memberNote" class="text-sm t-text-secondary">{{ memberNote }}</p>
          <p class="text-xs t-text-muted">You can still read everything, pay dues, and send requests to the board.</p>
        </div>
      </div>
      <AppButton as="a" :href="buildOrgPath('/requests?ask=1')" variant="outline" size="sm">Contact the board</AppButton>
    </div>
  </div>
</template>
