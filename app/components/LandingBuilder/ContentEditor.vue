<script setup lang="ts">
// Inline editor for a flexible "content" section — the editorial block that
// carries its own copy + imagery + features/stats. Binds the LandingBlock in
// place (it lives in landing.value.blocks, so mutations are reactive and flow to
// the live preview). Ported from the old SettingsDomainsPage content editor.
import {
  CONTENT_LAYOUTS,
  FEATURE_STYLES,
  type LandingBlock,
  type FeatureStyle,
} from "#core/shared/utils/landing";

const props = defineProps<{ block: LandingBlock }>();

const LAYOUT_LABELS: Record<string, string> = {
  "text-image": "Text + image (image right)",
  "image-text": "Image + text (image left)",
  "image-grid": "Image grid",
  stats: "Stat band",
  gallery: "Gallery / marquee",
};
const FEATURE_STYLE_LABELS: Record<FeatureStyle, string> = {
  list: "List (icon + text)",
  bullets: "Bullets (dot + text)",
  cards: "Cards (icon + title + text)",
  tiles: "Icon tiles",
};
const MENU_ICON_SUGGESTIONS = [
  "lucide:sparkles", "lucide:home", "lucide:building-2", "lucide:image",
  "lucide:map-pin", "lucide:scroll-text", "lucide:heart", "lucide:star",
  "lucide:leaf", "lucide:waves", "lucide:sun", "lucide:key-round",
];

const b = computed(() => props.block);

function addImage() {
  if (!Array.isArray(b.value.images)) b.value.images = [];
  b.value.images.push({ file: null, caption_title: "", caption_body: "", fit: "cover" });
}
const removeImage = (i: number) => b.value.images?.splice(i, 1);

function addStat() {
  if (!Array.isArray(b.value.stats)) b.value.stats = [];
  b.value.stats.push({ value: "", unit: "", label: "" });
}
const removeStat = (i: number) => b.value.stats?.splice(i, 1);

function addFeature() {
  if (!Array.isArray(b.value.features)) b.value.features = [];
  b.value.features.push({ icon: "", title: "", text: "", wide: false });
}
const removeFeature = (i: number) => b.value.features?.splice(i, 1);
function moveFeature(i: number, dir: -1 | 1) {
  const arr = b.value.features;
  if (!arr) return;
  const j = i + dir;
  if (j < 0 || j >= arr.length) return;
  [arr[i], arr[j]] = [arr[j]!, arr[i]!];
}
</script>

<template>
  <div class="space-y-3">
    <div class="flex items-center justify-between gap-3 rounded-lg border t-border px-3 py-2">
      <div>
        <Label class="block">Full width</Label>
        <p class="text-xs t-text-muted">Drop the side label column and run edge-to-edge.</p>
      </div>
      <Switch v-model="b.full_width" />
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div class="space-y-1.5">
        <Label>Layout</Label>
        <select
          v-model="b.layout"
          class="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <option v-for="l in CONTENT_LAYOUTS" :key="l" :value="l">{{ LAYOUT_LABELS[l] }}</option>
        </select>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div class="space-y-1.5">
          <Label>Number</Label>
          <Input v-model="b.number_label" placeholder="01" />
        </div>
        <div class="space-y-1.5">
          <Label>Category</Label>
          <Input v-model="b.category" placeholder="Philosophy" />
        </div>
      </div>
    </div>

    <div class="space-y-1.5">
      <Label>Eyebrow</Label>
      <Input v-model="b.eyebrow" placeholder="Fully renovated — turnkey" />
    </div>
    <div class="space-y-1.5">
      <Label>Title</Label>
      <Input v-model="b.title" placeholder="The Anti-High-Rise" />
    </div>
    <div class="space-y-1.5">
      <Label>Body</Label>
      <textarea
        v-model="b.body"
        rows="4"
        placeholder="Write the section copy…"
        class="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      />
    </div>
    <div class="space-y-1.5">
      <Label>Tagline</Label>
      <Input v-model="b.tagline" placeholder="Boutique scale. Big beach lifestyle." />
    </div>

    <!-- Menu link -->
    <div class="rounded-lg border t-border p-3 space-y-3">
      <div class="flex items-center justify-between gap-3">
        <div>
          <Label class="block">Show as menu link</Label>
          <p class="text-xs t-text-muted">Add this section to the public navigation menu.</p>
        </div>
        <Switch v-model="b.show_in_menu" />
      </div>
      <div v-if="b.show_in_menu" class="space-y-2">
        <Label>Menu icon</Label>
        <div class="flex items-center gap-2">
          <span class="inline-flex items-center justify-center w-9 h-9 rounded-md border t-border shrink-0">
            <Icon :name="b.menu_icon || 'lucide:minus'" class="w-4 h-4 t-text-muted" />
          </span>
          <Input v-model="b.menu_icon" placeholder="lucide:sparkles" />
        </div>
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="ic in MENU_ICON_SUGGESTIONS"
            :key="ic"
            type="button"
            class="inline-flex items-center justify-center w-8 h-8 rounded-md border transition-colors"
            :class="b.menu_icon === ic ? 't-border-accent t-text-accent' : 't-border t-text-muted hover:t-bg-subtle'"
            :title="ic"
            @click="b.menu_icon = ic"
          >
            <Icon :name="ic" class="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>

    <!-- Images (every layout except the stat band) -->
    <div v-if="b.layout !== 'stats'" class="space-y-2">
      <div class="flex items-center justify-between">
        <Label>Images</Label>
        <Button variant="outline" size="sm" @click="addImage">
          <Icon name="lucide:plus" class="w-4 h-4 mr-1.5" /> Add image
        </Button>
      </div>
      <div v-if="!b.images?.length" class="text-xs t-text-muted">No images yet.</div>
      <div v-for="(img, j) in b.images" :key="j" class="rounded-lg border t-border p-3 space-y-2">
        <div class="flex items-start justify-between gap-3">
          <LandingBuilderImageField v-model="img.file" thumb-class="h-16 w-24" title="Section image" />
          <Button variant="ghost" size="sm" class="w-8 h-8 p-0" @click="removeImage(j)">
            <Icon name="lucide:trash-2" class="w-4 h-4 text-red-500" />
          </Button>
        </div>
        <Input v-model="img.caption_title" placeholder="Caption title (optional)" />
        <Input v-model="img.caption_body" placeholder="Caption description (optional)" />
        <label class="text-xs t-text-muted inline-flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            :checked="img.fit === 'contain'"
            @change="img.fit = ($event.target as HTMLInputElement).checked ? 'contain' : 'cover'"
          />
          Fit whole image (contain) instead of fill
        </label>
      </div>
    </div>

    <!-- Stats (stat-band layout only) -->
    <div v-if="b.layout === 'stats'" class="space-y-2">
      <div class="flex items-center justify-between">
        <Label>Stats</Label>
        <Button variant="outline" size="sm" @click="addStat">
          <Icon name="lucide:plus" class="w-4 h-4 mr-1.5" /> Add stat
        </Button>
      </div>
      <div v-if="!b.stats?.length" class="text-xs t-text-muted">No stats yet.</div>
      <div v-for="(s, k) in b.stats" :key="k" class="flex items-center gap-2">
        <span class="inline-flex items-center justify-center w-8 h-8 rounded-md border t-border shrink-0">
          <Icon :name="s.icon || 'lucide:minus'" class="w-4 h-4 t-text-muted" />
        </span>
        <Input v-model="s.icon" placeholder="lucide: (optional)" class="w-32" />
        <Input v-model="s.value" placeholder="6" class="w-16" />
        <Input v-model="s.unit" placeholder="min" class="w-20" />
        <Input v-model="s.label" placeholder="Beach" class="flex-1" />
        <Button variant="ghost" size="sm" class="w-8 h-8 p-0" @click="removeStat(k)">
          <Icon name="lucide:trash-2" class="w-4 h-4 text-red-500" />
        </Button>
      </div>
    </div>

    <!-- Feature list -->
    <div class="space-y-3 rounded-lg border t-border p-3">
      <div class="flex items-center justify-between gap-2">
        <Label class="block">Feature list</Label>
        <Button variant="outline" size="sm" @click="addFeature">
          <Icon name="lucide:plus" class="w-4 h-4 mr-1.5" /> Add feature
        </Button>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div class="space-y-1.5">
          <Label>Style</Label>
          <select
            v-model="b.feature_style"
            class="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option v-for="s in FEATURE_STYLES" :key="s" :value="s">{{ FEATURE_STYLE_LABELS[s] }}</option>
          </select>
        </div>
        <div class="space-y-1.5">
          <Label>Columns</Label>
          <select
            v-model.number="b.feature_columns"
            class="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option :value="1">1</option>
            <option :value="2">2</option>
            <option :value="3">3</option>
            <option :value="4">4</option>
          </select>
        </div>
      </div>
      <div v-if="!b.features?.length" class="text-xs t-text-muted">No features yet.</div>
      <div v-for="(f, k) in b.features" :key="k" class="rounded-md border t-border p-2.5 space-y-2">
        <div class="flex items-center gap-2">
          <div class="flex flex-col">
            <button class="t-text-muted hover:t-text disabled:opacity-30" :disabled="k === 0" @click="moveFeature(k, -1)">
              <Icon name="lucide:chevron-up" class="w-4 h-4" />
            </button>
            <button class="t-text-muted hover:t-text disabled:opacity-30" :disabled="k === (b.features?.length || 0) - 1" @click="moveFeature(k, 1)">
              <Icon name="lucide:chevron-down" class="w-4 h-4" />
            </button>
          </div>
          <span class="inline-flex items-center justify-center w-8 h-8 rounded-md border t-border shrink-0">
            <Icon :name="f.icon || 'lucide:minus'" class="w-4 h-4 t-text-muted" />
          </span>
          <Input v-model="f.icon" placeholder="lucide:sparkles" class="w-40" />
          <label class="ml-auto flex items-center gap-1.5 text-xs t-text-muted whitespace-nowrap">
            <input type="checkbox" :checked="f.wide" @change="f.wide = ($event.target as HTMLInputElement).checked" />
            Wide
          </label>
          <Button variant="ghost" size="sm" class="w-8 h-8 p-0" @click="removeFeature(k)">
            <Icon name="lucide:trash-2" class="w-4 h-4 text-red-500" />
          </Button>
        </div>
        <Input v-model="f.title" placeholder="Title (optional — used by cards & tiles)" />
        <Input v-model="f.text" placeholder="Feature text" />
      </div>
      <p class="text-xs t-text-muted">
        Icons use any
        <a href="https://lucide.dev/icons" target="_blank" rel="noopener" class="t-link">lucide</a>
        name. "Wide" spans all columns.
      </p>
    </div>
  </div>
</template>
