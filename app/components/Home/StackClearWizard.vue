<script setup lang="ts">
/**
 * The guided walk through one pile: one card at a time, evidence large, one
 * verb, the next card springing in behind it. Inbox-zero mechanics for the
 * moment a list of twelve reads as "not today".
 *
 * Purely presentational. It renders the SAME `<HomeStackItemRow>` the pile
 * does and forwards the same events, so there is not one side effect here that
 * the pile does not already have — acting on a card removes it from the source
 * list, which advances the walk on its own. "Skip for now" steps past without
 * touching data.
 *
 * The surface is `<AppBottomSheet>` — the app's established create/edit sheet
 * (drag-dismiss on a phone, centred dialog above `md`), the same call Session 1
 * made for "What's new" rather than inventing a second modal material.
 */
import type { StackItem } from "#core/app/composables/useStackItems";

const props = defineProps<{
  title: string;
  items: StackItem[];
  busyId?: string | null;
  proposingId?: string | null;
}>();

const emit = defineEmits<{
  (e: "handled", key: string): void;
  (e: "approve", id: string): void;
  (e: "reject", id: string): void;
  (e: "undo", id: string): void;
  (e: "edit", id: string, payload: Record<string, any>): void;
  (e: "dismiss", noticeId: string): void;
  (e: "propose", noticeId: string): void;
}>();

const open = defineModel<boolean>({ default: false });

/** Cards stepped past this session — deferred, not handled. */
const skipped = ref<Set<string>>(new Set());
const doneCount = ref(0);

watch(open, (o) => {
  if (!o) return;
  skipped.value = new Set();
  doneCount.value = 0;
});

const queue = computed(() => props.items.filter((i) => !skipped.value.has(i.key)));
const current = computed(() => queue.value[0] || null);

// A handled row leaves `items` entirely, so the denominator has to remember it
// or the progress bar would shrink instead of filling.
watch(
  () => props.items.length,
  (n, prev) => {
    if (open.value && prev !== undefined && n < prev) doneCount.value += prev - n;
  }
);

const total = computed(() => props.items.length + doneCount.value);
const settled = computed(() => doneCount.value + skipped.value.size);
const position = computed(() => Math.min(settled.value + 1, Math.max(total.value, 1)));
const percent = computed(() => (total.value ? (settled.value / total.value) * 100 : 0));

function skip() {
  if (!current.value) return;
  skipped.value = new Set(skipped.value).add(current.value.key);
}
</script>

<template>
  <AppBottomSheet
    :open="open"
    :title="title"
    description="One card at a time. Leaving is fine — nothing is lost."
    @update:open="open = $event"
  >
    <div class="space-y-4 p-1">
      <div v-if="current" class="flex justify-end">
        <span class="text-[11px] tabular-nums t-text-muted">
          {{ position }} of {{ total }}
        </span>
      </div>

      <div class="h-1 rounded-full t-bg-subtle overflow-hidden" aria-hidden="true">
        <div
          class="h-full rounded-full bg-primary transition-all duration-300"
          :style="{ width: `${percent}%` }"
        />
      </div>

      <template v-if="current">
        <Transition name="wizard-card" mode="out-in">
          <HomeStackItemRow
            :key="current.key"
            :item="current"
            :busy-id="busyId"
            :proposing-id="proposingId"
            big
            @handled="(k: string) => emit('handled', k)"
            @approve="(id: string) => emit('approve', id)"
            @reject="(id: string) => emit('reject', id)"
            @undo="(id: string) => emit('undo', id)"
            @edit="(id: string, payload: Record<string, any>) => emit('edit', id, payload)"
            @dismiss="(id: string) => emit('dismiss', id)"
            @propose="(id: string) => emit('propose', id)"
          />
        </Transition>

        <div class="flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" class="rounded-full" @click="open = false">
            Done for now
          </Button>
          <Button variant="outline" size="sm" class="rounded-full" @click="skip">
            <Icon name="i-lucide-fast-forward" class="w-3.5 h-3.5 mr-1.5" />
            Skip for now
          </Button>
        </div>
      </template>

      <div v-else class="py-8 text-center space-y-2">
        <Icon name="i-lucide-check-circle-2" class="w-10 h-10 mx-auto text-success" />
        <p class="text-sm font-medium t-text">
          {{ doneCount ? "Pile cleared — nice work." : "Nothing left to walk through." }}
        </p>
        <Button size="sm" class="rounded-full" @click="open = false">Close</Button>
      </div>
    </div>
  </AppBottomSheet>
</template>

<style scoped>
.wizard-card-enter-active {
  transition:
    opacity 0.3s ease,
    transform 0.35s cubic-bezier(0.36, 0.66, 0.04, 1);
}
.wizard-card-leave-active {
  transition: opacity 0.15s ease;
}
.wizard-card-enter-from {
  opacity: 0;
  transform: translateY(14px) scale(0.98);
}
.wizard-card-leave-to {
  opacity: 0;
}
@media (prefers-reduced-motion: reduce) {
  .wizard-card-enter-active,
  .wizard-card-leave-active {
    transition: opacity 0.2s ease;
  }
  .wizard-card-enter-from {
    transform: none;
  }
}
</style>
