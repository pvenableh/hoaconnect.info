<script setup lang="ts">
// The AI trust dial — how much the assistant handles on its own. A 0–3 ladder;
// admins can change it, others see it read-only. Outbound actions always wait
// regardless of tier (stated on the card). (Phase 4.)
import { toast } from "vue-sonner";

const props = defineProps<{ orgId: string | null | undefined; canEdit?: boolean }>();

const orgIdRef = toRef(props, "orgId");
const { tier, tiers, saving, refresh, setTier } = useAiAutonomy(orgIdRef);
onMounted(refresh);
watch(orgIdRef, refresh);

const current = computed(() => tiers.find((t) => t.tier === tier.value) || tiers[0]);

async function choose(next: number) {
  if (!props.canEdit || next === tier.value) return;
  try {
    await setTier(next);
    toast.success("AI trust level updated");
  } catch (err: any) {
    toast.error(err?.status === 403 ? "Only an administrator can change this" : "Couldn't update");
  }
}
</script>

<template>
  <div class="rounded-xl border t-border t-bg p-3">
    <div class="flex items-center gap-2 mb-2">
      <Icon name="lucide:gauge" class="w-4 h-4 t-text-secondary" />
      <span class="text-sm font-medium t-text">How much the assistant handles on its own</span>
    </div>

    <div class="flex items-center gap-1 rounded-full t-bg-subtle p-1">
      <button
        v-for="t in tiers"
        :key="t.tier"
        type="button"
        class="flex-1 px-2 py-1 text-xs rounded-full transition-colors"
        :class="[
          t.tier === tier ? 'bg-white shadow-sm t-text dark:bg-white/10' : 't-text-secondary hover:t-text',
          canEdit ? 'cursor-pointer' : 'cursor-default',
        ]"
        :disabled="saving || !canEdit"
        @click="choose(t.tier)"
      >
        {{ t.tier }}
      </button>
    </div>

    <p class="mt-2 text-xs t-text">{{ current.label }}</p>
    <p class="text-[11px] t-text-muted">{{ current.blurb }}</p>
    <p v-if="!canEdit" class="mt-1 text-[11px] t-text-muted italic">Only an administrator can change this.</p>
  </div>
</template>
