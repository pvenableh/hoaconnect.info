<script setup lang="ts">
// The hero editor — pinned as the first, non-draggable card on the canvas. Edits
// the hero title/subtitle + background photo + transparent-PNG logo (site.hero).
// The hero always leads the public page, so it can't be removed or reordered.
import { useLandingBuilderContext } from "#core/app/composables/useLandingBuilder";

const { site, org, fileUrl } = useLandingBuilderContext();
const open = ref(false);

const bgSrc = computed(() => (site.hero.bgId ? fileUrl(site.hero.bgId, "small") : ""));
const eyebrow = computed(() =>
  [org.value?.city, org.value?.street_address].filter(Boolean).join(" · ")
);
</script>

<template>
  <div class="rounded-xl border t-border t-bg overflow-hidden">
    <!-- Header row (mirrors a block card, but pinned) -->
    <div class="flex items-center gap-2 px-2.5 py-2">
      <span class="w-6 h-6 rounded-md flex items-center justify-center t-bg-subtle t-text-muted shrink-0" title="Always first">
        <Icon name="lucide:pin" class="w-3.5 h-3.5" />
      </span>
      <Icon name="lucide:panel-top" class="w-4 h-4 t-text-accent shrink-0" />
      <div class="min-w-0 flex-1">
        <div class="text-sm font-medium t-text truncate">Hero</div>
        <div class="text-xs t-text-muted truncate">{{ site.hero.title || org?.name }}</div>
      </div>
      <span class="text-[10px] uppercase tracking-wide t-text-muted px-1.5 py-0.5 rounded t-bg-subtle">Header</span>
      <button
        type="button"
        class="p-1.5 rounded-md hover:t-bg-subtle"
        :class="open ? 'text-primary' : 't-text-secondary'"
        title="Edit hero"
        @click="open = !open"
      >
        <Icon name="lucide:pencil" class="w-4 h-4" />
      </button>
    </div>

    <!-- Mini hero preview strip -->
    <div
      class="relative h-24 bg-cover bg-center border-t t-border flex items-center justify-center"
      :style="bgSrc ? { backgroundImage: `url('${bgSrc}')` } : { background: '#15130f' }"
    >
      <div class="absolute inset-0 bg-gradient-to-b from-black/40 to-black/75" />
      <div class="relative text-center px-4">
        <img
          v-if="site.hero.fgId"
          :src="fileUrl(site.hero.fgId, 'small')"
          class="max-h-12 mx-auto object-contain drop-shadow"
        />
        <h3 v-else class="text-white text-sm font-light uppercase tracking-[0.25em]">
          {{ site.hero.title || org?.name }}
        </h3>
      </div>
    </div>

    <div v-if="open" class="border-t t-border px-3 py-3 t-bg-subtle/50 space-y-3">
      <div class="space-y-1.5">
        <Label>Title <span class="t-text-muted">(optional — defaults to community name)</span></Label>
        <Input v-model="site.hero.title" placeholder="Welcome to…" />
      </div>
      <div class="space-y-1.5">
        <Label>Subtitle <span class="t-text-muted">(optional — a short tagline)</span></Label>
        <Input v-model="site.hero.subtitle" placeholder="A boutique community in…" />
        <p v-if="!site.hero.subtitle && eyebrow" class="text-xs t-text-muted">
          Defaults to your address eyebrow: <span class="t-text">{{ eyebrow }}</span>
        </p>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div class="space-y-1.5">
          <Label>Background photo</Label>
          <LandingBuilderImageField v-model="site.hero.bgId" thumb-class="h-16 w-28" title="Hero background" />
        </div>
        <div class="space-y-1.5">
          <Label>Hero logo <span class="t-text-accent font-medium">— transparent PNG</span></Label>
          <LandingBuilderImageField v-model="site.hero.fgId" thumb-class="h-16 w-28" title="Hero logo" />
          <p class="text-xs t-text-muted leading-relaxed">
            Your wordmark/logo over the hero photo. A transparent PNG reads cleanly on any
            background. Aim for ~1200px wide.
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
