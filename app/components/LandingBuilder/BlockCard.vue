<script setup lang="ts">
// One section on the builder canvas: drag handle, type badge, show/hide toggle,
// duplicate (content only), remove, and an expand-to-edit inline editor chosen by
// block type. The hero is a separate pinned card (HeroCard) — this handles every
// reorderable section. Mirrors EmailBuilder/BlockItem.
import type { LandingBlock, LandingBlockType } from "#core/shared/utils/landing";

const props = defineProps<{
  block: LandingBlock;
  isFirst: boolean;
  isLast: boolean;
  expanded: boolean;
}>();
const emit = defineEmits<{
  (e: "remove", id: string): void;
  (e: "move", payload: { id: string; direction: "up" | "down" }): void;
  (e: "duplicate", id: string): void;
  (e: "update:expanded", value: boolean): void;
}>();

const BLOCK_META: Record<LandingBlockType, { label: string; icon: string; hint: string }> = {
  about: { label: "About", icon: "lucide:text", hint: "A short description of your community." },
  content: { label: "Custom section", icon: "lucide:layout-template", hint: "" },
  amenities: { label: "Amenities", icon: "lucide:sparkles", hint: "Highlights shown in a grid." },
  listings: { label: "Listings", icon: "lucide:home", hint: "Units for sale or rent." },
  faq: { label: "FAQ", icon: "lucide:circle-help", hint: "Questions and answers." },
  board: { label: "Board", icon: "lucide:users", hint: "Toggle the board section." },
  contact: { label: "Contact", icon: "lucide:mail", hint: "Public phone & email." },
  location: { label: "Location", icon: "lucide:map-pin", hint: "Map, scores & nearby places." },
  gallery: { label: "Gallery", icon: "lucide:images", hint: "Full-bleed image gallery." },
};
const LAYOUT_LABELS: Record<string, string> = {
  "text-image": "Text + image", "image-text": "Image + text", "image-grid": "Image grid",
  stats: "Stat band", gallery: "Gallery / marquee",
};

const meta = computed(() => BLOCK_META[props.block.type]);
const title = computed(() =>
  props.block.type === "content" ? props.block.title || "Custom section" : meta.value.label
);
const subtitle = computed(() =>
  props.block.type === "content" ? LAYOUT_LABELS[props.block.layout || "text-image"] : meta.value.hint
);
</script>

<template>
  <div class="rounded-xl border t-border t-bg overflow-hidden" :class="{ 'opacity-60': !block.enabled }">
    <div class="flex items-center gap-2 px-2.5 py-2">
      <span class="drag-handle cursor-grab active:cursor-grabbing t-text-muted shrink-0" title="Drag to reorder">
        <Icon name="lucide:grip-vertical" class="w-4 h-4" />
      </span>
      <Icon :name="meta.icon" class="w-4 h-4 t-text-accent shrink-0" />
      <div class="min-w-0 flex-1">
        <div class="text-sm font-medium t-text truncate">{{ title }}</div>
        <div class="text-xs t-text-muted truncate">{{ subtitle }}</div>
      </div>

      <div class="flex items-center gap-0.5 shrink-0">
        <Switch v-model="block.enabled" class="mr-1" title="Show / hide" />
        <button
          type="button"
          class="p-1.5 rounded-md hover:t-bg-subtle"
          :class="expanded ? 'text-primary' : 't-text-secondary'"
          title="Edit"
          @click="emit('update:expanded', !expanded)"
        >
          <Icon name="lucide:pencil" class="w-4 h-4" />
        </button>
        <button
          type="button"
          class="p-1.5 rounded-md hover:bg-red-50 hover:text-red-600 t-text-secondary dark:hover:bg-red-500/10"
          title="Remove"
          @click="emit('remove', block.id)"
        >
          <Icon name="lucide:trash-2" class="w-4 h-4" />
        </button>
      </div>
    </div>

    <div v-if="expanded" class="border-t t-border px-3 py-3 t-bg-subtle/50">
      <LandingBuilderContentEditor v-if="block.type === 'content'" :block="block" />
      <LandingBuilderLocationEditor v-else-if="block.type === 'location'" />
      <LandingBuilderGalleryEditor v-else-if="block.type === 'gallery'" />
      <LandingBuilderListingsEditor v-else-if="block.type === 'listings'" />
      <LandingBuilderFaqEditor v-else-if="block.type === 'faq'" />
      <LandingBuilderAmenitiesEditor v-else-if="block.type === 'amenities'" />
      <LandingBuilderAboutEditor v-else-if="block.type === 'about'" />
      <LandingBuilderContactEditor v-else-if="block.type === 'contact'" />
      <LandingBuilderBoardEditor v-else-if="block.type === 'board'" />
    </div>
  </div>
</template>
