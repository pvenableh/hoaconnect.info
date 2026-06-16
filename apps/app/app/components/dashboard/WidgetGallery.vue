<script setup lang="ts">
import type { WidgetDef } from "#core/app/composables/useDashboardWidgets";

// The "Add widget" tray shown at the bottom of the dashboard while editing.
// Lists every hidden widget as an add-able tile; empty when nothing is hidden.
defineProps<{ hidden: WidgetDef[] }>();
const emit = defineEmits<{ add: [key: string]; reset: [] }>();
</script>

<template>
  <div class="ios-card p-5">
    <div class="flex items-center justify-between mb-3">
      <div>
        <h3 class="font-semibold t-text">Add a widget</h3>
        <p class="text-sm t-text-muted">Drag cards to rearrange, or tap a widget below to add it back.</p>
      </div>
      <Button variant="ghost" size="sm" class="rounded-full" @click="emit('reset')">
        <Icon name="lucide:rotate-ccw" class="w-4 h-4 mr-1.5" />
        Reset
      </Button>
    </div>

    <div v-if="hidden.length" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      <button
        v-for="w in hidden"
        :key="w.key"
        type="button"
        class="flex items-start gap-3 p-3 rounded-xl t-bg-subtle hover:opacity-80 transition text-left"
        @click="emit('add', w.key)"
      >
        <span
          class="flex items-center justify-center w-9 h-9 rounded-full shrink-0"
          :style="{
            backgroundColor: 'hsl(var(--app-accent-h) var(--app-accent-s) var(--app-accent-l) / 0.12)',
            color: 'hsl(var(--app-accent-h) var(--app-accent-s) var(--app-accent-l))',
          }"
        >
          <Icon :name="'i-lucide-' + w.icon" class="w-4 h-4" />
        </span>
        <span class="min-w-0 flex-1">
          <span class="block font-medium t-text text-sm">{{ w.title }}</span>
          <span class="block text-xs t-text-muted">{{ w.description }}</span>
        </span>
        <Icon name="lucide:plus" class="w-4 h-4 t-text-muted shrink-0 mt-1" />
      </button>
    </div>
    <p v-else class="text-sm t-text-muted py-2">All widgets are on your dashboard.</p>
  </div>
</template>
