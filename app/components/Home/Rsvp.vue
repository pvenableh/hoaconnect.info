<script setup lang="ts">
/**
 * HomeRsvp — answer "are you coming?" for one meeting without leaving the home
 * (docs/plan-unified-experience.md §5, owner "RSVP"). Going, Maybe or Can't go,
 * changeable until the meeting starts; the count of people going shows beside it.
 */
import { toast } from "vue-sonner";
import { RSVP_LABEL, RSVP_RESPONSES, type RsvpResponse } from "#core/shared/meetings/rsvp";

const props = defineProps<{ meetingId: string }>();
const orgId = useState<string | null>("selectedOrgId", () => null);

interface RsvpState { mine: RsvpResponse | null; counts: Record<RsvpResponse, number>; open: boolean }
const { data, status } = useAsyncData(
  () => `home-rsvp-${props.meetingId}-${orgId.value}`,
  async () =>
    orgId.value
      ? await $fetch<RsvpState>(`/api/org/meetings/${props.meetingId}/rsvp`, { query: { orgId: orgId.value } }).catch(() => null)
      : null,
  { watch: [orgId, () => props.meetingId], server: false },
);
// server: false renders "idle" on the server: count it as loading so hydration agrees.
const pending = computed(() => status.value === "idle" || status.value === "pending");
const busy = ref(false);

async function answer(response: RsvpResponse) {
  if (busy.value || data.value?.mine === response) return;
  busy.value = true;
  try {
    data.value = await $fetch<RsvpState>(`/api/org/meetings/${props.meetingId}/rsvp`, { method: "POST", body: { orgId: orgId.value, response } });
    toast.success(response === "going" ? "See you there" : response === "maybe" ? "Marked as maybe" : "Marked as not going");
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || e?.data?.message || "That didn't work");
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="mt-3 space-y-2" data-testid="home-rsvp">
    <div v-if="data?.open" class="flex flex-wrap gap-2" role="group" aria-label="RSVP">
      <AppButton
        v-for="r in RSVP_RESPONSES"
        :key="r"
        size="sm"
        :variant="data.mine === r ? 'default' : 'outline'"
        :aria-pressed="data.mine === r"
        :disabled="busy"
        @click="answer(r)"
      >
        {{ RSVP_LABEL[r] }}
      </AppButton>
    </div>
    <p class="text-xs t-text-muted" aria-live="polite">
      <template v-if="pending">Loading RSVPs…</template>
      <template v-else-if="data">{{ data.counts.going }} going<template v-if="data.counts.maybe"> · {{ data.counts.maybe }} maybe</template></template>
    </p>
  </div>
</template>
