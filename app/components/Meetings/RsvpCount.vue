<script setup lang="ts">
/** MeetingsRsvpCount — "3 going · 1 maybe · 2 can't go" for one upcoming meeting, for the board's list. */
const props = defineProps<{ meetingId: string; organizationId?: string | null }>();
const fallbackOrg = useState<string | null>("selectedOrgId", () => null);
const orgId = computed(() => props.organizationId || fallbackOrg.value);

const { data } = useAsyncData(
  () => `meeting-rsvp-count-${props.meetingId}-${orgId.value}`,
  async () =>
    orgId.value
      ? await $fetch<{ counts: { going: number; maybe: number; not_going: number } }>(`/api/org/meetings/${props.meetingId}/rsvp`, { query: { orgId: orgId.value } }).catch(() => null)
      : null,
  { watch: [orgId], server: false },
);
const text = computed(() => {
  const c = data.value?.counts;
  if (!c || c.going + c.maybe + c.not_going === 0) return "";
  return [`${c.going} going`, c.maybe ? `${c.maybe} maybe` : "", c.not_going ? `${c.not_going} can't go` : ""].filter(Boolean).join(" · ");
});
</script>

<template>
  <p v-if="text" class="text-xs t-text-muted mt-1" data-testid="meeting-rsvp-count">
    <Icon name="i-lucide-calendar-check" class="size-3.5 inline -mt-0.5 mr-1" />RSVPs: {{ text }}
  </p>
</template>
