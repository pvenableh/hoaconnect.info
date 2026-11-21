<script setup lang="ts">
/**
 * HomeAcknowledge — "Needs you" rows for notices the community asked the person
 * to acknowledge (docs/scope-notices-and-forms.md, step 2). The list is the
 * server's (`/api/org/acknowledgments/mine`, org- and hat-aware); an
 * acknowledgment goes through `POST /api/org/acknowledgments`, which sets the
 * unique key. The row leaves the list when the server says ok. Renders nothing
 * when nothing is owed.
 */
import { toast } from "vue-sonner";
import type { AckNotice } from "#core/shared/home/acknowledgments";

const props = defineProps<{ organizationId: string | null | undefined; swipe?: boolean }>();
const emit = defineEmits<{ done: [id: string] }>();

let refreshAcks: () => Promise<void> = async () => {};
defineExpose({ refresh: () => refreshAcks() });

const { data, refresh } = await useAsyncData(
  () => `home-acks-${props.organizationId}`,
  async () =>
    props.organizationId
      ? await $fetch<{ notices: AckNotice[] }>("/api/org/acknowledgments/mine", { query: { orgId: props.organizationId } }).catch(() => ({ notices: [] }))
      : { notices: [] },
  { watch: [() => props.organizationId], server: false, default: () => ({ notices: [] as AckNotice[] }) }
);
refreshAcks = refresh;
const gone = ref(new Set<string>());
const rows = computed(() => (data.value?.notices ?? []).filter((n) => !gone.value.has(n.id)));
const busy = ref<string | null>(null);
const live = ref("");

async function acknowledge(id: string, method: "swipe" | "button") {
  const notice = rows.value.find((n) => n.id === id);
  busy.value = id;
  try {
    await $fetch("/api/org/acknowledgments", { method: "POST", body: { orgId: props.organizationId, announcementId: id, method } });
    gone.value = new Set([...gone.value, id]);
    live.value = `Acknowledged ${notice?.title ?? "notice"}`;
    toast.success(live.value);
    emit("done", id);
  } catch {
    toast.error("Could not record that. Try again.");
  } finally {
    busy.value = null;
  }
}
</script>

<template>
  <div v-if="rows.length" class="space-y-3" data-testid="home-acknowledge">
    <h2 class="t-eyebrow">Acknowledge</h2>
    <AppCard class="overflow-hidden py-0">
      <ul class="divide-y">
        <HomeAcknowledgeRow
          v-for="n in rows"
          :id="n.id"
          :key="n.id"
          :title="n.title ?? 'Notice'"
          :due="n.ack_due ?? null"
          :swipe="!!swipe"
          :busy="busy === n.id"
          @acknowledge="acknowledge"
        />
      </ul>
    </AppCard>
    <p class="sr-only" aria-live="polite">{{ live }}</p>
  </div>
</template>
