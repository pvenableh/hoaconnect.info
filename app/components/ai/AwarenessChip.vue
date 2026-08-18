<script setup lang="ts">
// "What the AI can see" — a collapsible bar at the top of the assistant panel
// that lists the grounding sources for this conversation and lets the user
// switch any of them off. The server enforces the toggles (excludedContext), so
// this is real control, not just a label. Folds in the focus indicator: when a
// record is focused, the collapsed header names it.
const { knowledge, toggle } = useAiAwareness();
const { currentContext } = useAiContext();

const open = ref(false);
const includedCount = computed(() => knowledge.value.filter((k) => k.included).length);
const focusLabel = computed(() => {
  const c = currentContext.value;
  return c.entityType && (c.label || c.entityId) ? c.label || c.entityType : null;
});
</script>

<template>
  <div v-if="knowledge.length" class="border-b t-border shrink-0">
    <button
      type="button"
      class="w-full flex items-center gap-2 px-4 py-2 t-bg-subtle hover:t-bg text-left transition-colors"
      @click="open = !open"
    >
      <Icon name="lucide:eye" class="w-3.5 h-3.5 t-text-accent shrink-0" />
      <span class="text-xs t-text-secondary flex-1 truncate">
        Grounded in <span class="font-medium t-text">{{ includedCount }}</span> of {{ knowledge.length }} sources<template v-if="focusLabel">
          · focused on <span class="font-medium t-text">{{ focusLabel }}</span></template>
      </span>
      <Icon :name="open ? 'lucide:chevron-up' : 'lucide:chevron-down'" class="w-3.5 h-3.5 t-text-muted shrink-0" />
    </button>

    <Transition name="ai-fade">
      <div v-if="open" class="px-3 pb-2.5 pt-1 space-y-1 t-bg-subtle">
        <button
          v-for="k in knowledge"
          :key="k.key"
          type="button"
          class="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left hover:t-bg transition-colors"
          @click="toggle(k.key)"
        >
          <Icon
            :name="k.icon"
            class="w-3.5 h-3.5 shrink-0"
            :class="k.included ? 't-text-accent' : 't-text-muted'"
          />
          <span
            class="text-xs flex-1"
            :class="k.included ? 't-text-secondary' : 't-text-muted line-through'"
          >
            {{ k.label }}
          </span>
          <Icon
            :name="k.included ? 'lucide:toggle-right' : 'lucide:toggle-left'"
            class="w-4 h-4 shrink-0"
            :class="k.included ? 't-text-accent' : 't-text-muted'"
          />
        </button>
        <p class="text-[11px] t-text-muted px-2.5 pt-1">
          Grounded only in your association's own data. Tap a source to exclude it from this conversation.
        </p>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.ai-fade-enter-active,
.ai-fade-leave-active {
  transition: opacity 160ms ease;
}
.ai-fade-enter-from,
.ai-fade-leave-to {
  opacity: 0;
}
@media (prefers-reduced-motion: reduce) {
  .ai-fade-enter-active,
  .ai-fade-leave-active {
    transition: opacity 100ms ease;
  }
}
</style>
