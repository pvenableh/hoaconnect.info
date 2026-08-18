<script setup lang="ts">
// The block palette. Click-to-add (matching Earnest — drag is reorder-only on the
// canvas). Search filters across name/category/description; blocks are grouped by
// category into collapsible sections.
import type { HoaNewsletterBlock } from "#core/types/directus";

const props = defineProps<{
  library: Record<string, HoaNewsletterBlock[]>;
  loading?: boolean;
}>();
const emit = defineEmits<{ (e: "add", block: HoaNewsletterBlock): void }>();

const search = ref("");

const CATEGORY_ICON: Record<string, string> = {
  header: "lucide:panel-top", hero: "lucide:image", content: "lucide:text",
  "two-column": "lucide:columns-2", cta: "lucide:mouse-pointer-click", image: "lucide:image",
  stats: "lucide:bar-chart-3", quote: "lucide:quote", list: "lucide:list",
  divider: "lucide:minus", social: "lucide:share-2", footer: "lucide:panel-bottom",
  other: "lucide:box",
};

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase();
  const out: Record<string, HoaNewsletterBlock[]> = {};
  for (const [cat, blocks] of Object.entries(props.library)) {
    const kept = q
      ? blocks.filter((b) =>
          [b.name, b.category, b.description].filter(Boolean).join(" ").toLowerCase().includes(q)
        )
      : blocks;
    if (kept.length) out[cat] = kept;
  }
  return out;
});
</script>

<template>
  <div class="flex flex-col h-full">
    <div class="p-3 border-b t-border">
      <div class="relative">
        <Icon name="lucide:search" class="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 t-text-muted" />
        <Input v-model="search" placeholder="Search blocks…" class="h-9 pl-8 text-sm" />
      </div>
    </div>

    <div class="flex-1 overflow-y-auto p-3 space-y-4">
      <div v-if="loading" class="flex items-center justify-center py-8 t-text-muted">
        <Icon name="lucide:loader-circle" class="w-5 h-5 animate-spin" />
      </div>
      <p v-else-if="!Object.keys(filtered).length" class="text-sm t-text-muted text-center py-8">No blocks found.</p>

      <div v-for="(blocks, cat) in filtered" :key="cat" class="space-y-1.5">
        <p class="text-[10px] uppercase tracking-wide font-semibold t-text-muted flex items-center gap-1.5">
          <Icon :name="CATEGORY_ICON[cat] || 'lucide:box'" class="w-3.5 h-3.5" />
          {{ cat }}
        </p>
        <button
          v-for="b in blocks"
          :key="b.id"
          type="button"
          class="w-full text-left rounded-lg border t-border px-3 py-2 hover:border-primary/50 hover:t-bg-subtle transition-colors group"
          @click="emit('add', b)"
        >
          <div class="flex items-center justify-between gap-2">
            <span class="text-sm font-medium t-text truncate">{{ b.name }}</span>
            <Icon name="lucide:plus" class="w-4 h-4 t-text-muted group-hover:text-primary shrink-0" />
          </div>
          <p v-if="b.description" class="text-xs t-text-muted truncate">{{ b.description }}</p>
        </button>
      </div>
    </div>
  </div>
</template>
