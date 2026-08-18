<script setup lang="ts">
// The section palette — a dialog that adds sections to the canvas. Flexible
// "content" sections come in layout presets; built-in sections (About, Amenities,
// Board, Contact, Listings, FAQ, Location, Gallery) are singletons shown as
// "Added" once present. Emits the new block id so the page can expand + scroll to it.
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useLandingBuilderContext } from "#core/app/composables/useLandingBuilder";
import type { ContentLayout, LandingBlockType } from "#core/shared/utils/landing";

const open = defineModel<boolean>("open", { default: false });
const emit = defineEmits<{ (e: "added", id: string): void }>();

const { builder } = useLandingBuilderContext();

const CONTENT_PRESETS: { layout: ContentLayout; label: string; icon: string; desc: string }[] = [
  { layout: "text-image", label: "Text + image", icon: "lucide:panel-right", desc: "Copy beside a photo — the editorial workhorse." },
  { layout: "image-text", label: "Image + text", icon: "lucide:panel-left", desc: "Photo on the left, copy on the right." },
  { layout: "image-grid", label: "Image grid", icon: "lucide:layout-grid", desc: "A grid of captioned photos." },
  { layout: "stats", label: "Stat band", icon: "lucide:bar-chart-3", desc: "Big numbers — walk score, year built, units." },
  { layout: "gallery", label: "Gallery / marquee", icon: "lucide:gallery-horizontal", desc: "A scrolling row of imagery." },
];

const BUILTINS: { type: LandingBlockType; label: string; icon: string; desc: string }[] = [
  { type: "about", label: "About", icon: "lucide:text", desc: "A short description of your community." },
  { type: "amenities", label: "Amenities", icon: "lucide:sparkles", desc: "Highlights shown in a grid." },
  { type: "location", label: "Location", icon: "lucide:map-pin", desc: "Map, walk/bike scores & nearby places." },
  { type: "gallery", label: "Gallery", icon: "lucide:images", desc: "A full-bleed image gallery." },
  { type: "listings", label: "Listings", icon: "lucide:home", desc: "Units for sale or rent." },
  { type: "board", label: "Board", icon: "lucide:users", desc: "Your board of directors." },
  { type: "faq", label: "FAQ", icon: "lucide:circle-help", desc: "Answer common questions." },
  { type: "contact", label: "Contact", icon: "lucide:mail", desc: "Phone, email & inquiry form." },
];

function addContent(layout: ContentLayout) {
  emit("added", builder.addContentBlock(layout));
  open.value = false;
}
function addBuiltin(type: LandingBlockType) {
  if (builder.has(type)) return;
  emit("added", builder.addBuiltinBlock(type));
  open.value = false;
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Add a section</DialogTitle>
        <DialogDescription>
          Build your page from custom editorial sections or your community's built-in sections.
        </DialogDescription>
      </DialogHeader>

      <div class="space-y-5">
        <div>
          <p class="text-[11px] uppercase tracking-wide font-semibold t-text-muted mb-2">Custom section</p>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              v-for="p in CONTENT_PRESETS"
              :key="p.layout"
              type="button"
              class="text-left rounded-lg border t-border p-3 hover:border-primary/50 hover:t-bg-subtle transition-colors flex items-start gap-3"
              @click="addContent(p.layout)"
            >
              <Icon :name="p.icon" class="w-5 h-5 t-text-accent shrink-0 mt-0.5" />
              <span class="min-w-0">
                <span class="block text-sm font-medium t-text">{{ p.label }}</span>
                <span class="block text-xs t-text-muted">{{ p.desc }}</span>
              </span>
            </button>
          </div>
        </div>

        <div>
          <p class="text-[11px] uppercase tracking-wide font-semibold t-text-muted mb-2">Built-in sections</p>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              v-for="b in BUILTINS"
              :key="b.type"
              type="button"
              :disabled="builder.has(b.type)"
              class="text-left rounded-lg border t-border p-3 transition-colors flex items-start gap-3"
              :class="builder.has(b.type) ? 'opacity-60 cursor-default' : 'hover:border-primary/50 hover:t-bg-subtle'"
              @click="addBuiltin(b.type)"
            >
              <Icon :name="b.icon" class="w-5 h-5 t-text-accent shrink-0 mt-0.5" />
              <span class="min-w-0 flex-1">
                <span class="block text-sm font-medium t-text">{{ b.label }}</span>
                <span class="block text-xs t-text-muted">{{ b.desc }}</span>
              </span>
              <span
                v-if="builder.has(b.type)"
                class="text-[10px] uppercase tracking-wide font-semibold t-text-muted shrink-0 inline-flex items-center gap-1"
              >
                <Icon name="lucide:check" class="w-3.5 h-3.5" /> Added
              </span>
            </button>
          </div>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>
