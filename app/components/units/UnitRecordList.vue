<script setup lang="ts">
// Presentational section for a category of unit records (occupants / pets /
// vehicles / leases). Renders a Current group and a collapsible History group,
// each item via the scoped #item slot. Emits add/edit/end for the parent to
// persist (writes are admin-only — controls only show when canManage).
const props = defineProps<{
  title: string;
  icon: string;
  current: any[];
  history: any[];
  canManage?: boolean;
  addLabel?: string;
  /** Occupants use end-date for move-out; their "end" is handled elsewhere. */
  hideEnd?: boolean;
}>();
const emit = defineEmits<{
  (e: "add"): void;
  (e: "edit", item: any): void;
  (e: "end", item: any): void;
}>();

const showHistory = ref(false);
</script>

<template>
  <section class="ios-card p-5">
    <div class="flex items-center justify-between gap-2 mb-4">
      <div class="flex items-center gap-2">
        <Icon :name="`lucide:${icon}`" class="w-5 h-5 t-text-secondary" />
        <h2 class="text-base font-semibold t-text">{{ title }}</h2>
        <span class="text-xs t-text-muted">{{ current.length }} current</span>
      </div>
      <Button v-if="canManage" size="sm" variant="outline" class="rounded-full" @click="emit('add')">
        <Icon name="lucide:plus" class="w-4 h-4 mr-1" /> {{ addLabel || "Add" }}
      </Button>
    </div>

    <!-- Current -->
    <div v-if="current.length" class="space-y-2">
      <div
        v-for="item in current"
        :key="item.id"
        class="ios-card group flex items-center gap-3 rounded-xl px-3 py-2.5 t-bg-subtle"
      >
        <div class="flex-1 min-w-0">
          <slot name="item" :item="item" :is-history="false" />
        </div>
        <div v-if="canManage" class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button class="p-1.5 rounded-lg hover:t-bg t-text-muted hover:t-text" title="Edit" @click="emit('edit', item)">
            <Icon name="lucide:pencil" class="w-4 h-4" />
          </button>
          <button v-if="!hideEnd" class="p-1.5 rounded-lg hover:t-bg t-text-muted hover:text-amber-600" title="End / move out" @click="emit('end', item)">
            <Icon name="lucide:log-out" class="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
    <p v-else class="text-sm t-text-muted py-2">None currently registered.</p>

    <!-- History -->
    <div v-if="history.length" class="mt-3 pt-3 border-t t-border">
      <button
        class="flex items-center gap-1.5 text-xs font-medium t-text-muted hover:t-text"
        @click="showHistory = !showHistory"
      >
        <Icon :name="showHistory ? 'lucide:chevron-down' : 'lucide:chevron-right'" class="w-3.5 h-3.5" />
        History ({{ history.length }})
      </button>
      <div v-if="showHistory" class="space-y-2 mt-2">
        <div
          v-for="item in history"
          :key="item.id"
          class="flex items-center gap-3 rounded-xl border t-border border-dashed px-3 py-2.5 opacity-75"
        >
          <div class="flex-1 min-w-0">
            <slot name="item" :item="item" :is-history="true" />
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
