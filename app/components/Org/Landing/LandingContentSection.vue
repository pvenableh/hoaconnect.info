<!--
  Flexible editorial content section — the admin-authored landing block.
  Renders one `content` LandingBlock in its chosen layout, faithful to the
  1033lenox.com editorial language: optional numbered label (01 / Category),
  eyebrow, serif title, body, italic tagline, and captioned imagery / stat band
  / gallery. Purely token-driven (t-*/landing-* + --theme-* vars) so the classic
  and modern themes both render correctly. Uses `.reveal` for the page's shared
  scroll-in.
-->
<template>
  <section
    :id="block.id"
    class="landing-section section py-24 lg:py-32 px-6 lg:px-16 border-t t-border"
    :class="alt ? 't-bg-alt' : 't-bg'"
  >
    <div class="max-w-6xl mx-auto">
      <div class="grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-8 lg:gap-16">
        <!-- Numbered label column (1033 style); empty spacer keeps copy aligned -->
        <div v-if="hasLabel" class="reveal flex flex-col gap-2">
          <span v-if="block.number_label" class="t-heading text-sm lg:text-[26px] lg:leading-6 t-text-accent">
            {{ block.number_label }}
          </span>
          <span v-if="block.category" class="text-xs lg:text-sm tracking-wider uppercase t-text-tertiary">
            {{ block.category }}
          </span>
        </div>
        <div v-else class="hidden lg:block" />

        <div class="content-main min-w-0 overflow-x-clip">
          <!-- ============ TEXT + IMAGE (side by side, order flips) ============ -->
          <div
            v-if="layout === 'text-image' || layout === 'image-text'"
            class="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center"
          >
            <div :class="layout === 'image-text' ? 'lg:order-2' : ''">
              <component :is="CopyBlock" />
              <p
                v-if="block.tagline"
                class="section-tagline t-heading italic text-lg t-text-accent-tertiary pt-8 border-t t-border-divider reveal"
              >
                {{ block.tagline }}
              </p>
            </div>
            <div :class="layout === 'image-text' ? 'lg:order-1' : ''">
              <div
                v-if="images[0]"
                class="reveal aspect-[3/4] sm:aspect-[4/3] lg:aspect-[3/4] flex items-end justify-start rounded-sm bg-black/25 bg-blend-darken bg-no-repeat"
                :class="images[0].fit === 'contain' ? 'bg-contain bg-center' : 'bg-cover bg-center'"
                :style="bgStyle(images[0])"
              >
                <div v-if="images[0].caption_title || images[0].caption_body" class="w-full text-left p-6">
                  <p v-if="images[0].caption_title" class="text-sm text-white font-medium mb-2 uppercase tracking-wide">
                    {{ images[0].caption_title }}
                  </p>
                  <p v-if="images[0].caption_body" class="text-xs text-white/80 leading-relaxed">
                    {{ images[0].caption_body }}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <!-- ===================== IMAGE GRID ===================== -->
          <template v-else-if="layout === 'image-grid'">
            <component :is="CopyBlock" />
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6 my-8">
              <div
                v-for="(img, i) in images"
                :key="i"
                class="reveal aspect-[4/3] flex items-end justify-start rounded-sm bg-black/25 bg-blend-darken bg-no-repeat"
                :class="[
                  img.fit === 'contain' ? 'bg-contain bg-center' : 'bg-cover bg-center',
                  images.length === 3 && i === 0 ? 'md:col-span-2' : '',
                ]"
                :style="bgStyle(img)"
              >
                <div v-if="img.caption_title || img.caption_body" class="text-left p-6">
                  <p v-if="img.caption_title" class="text-sm text-white font-medium mb-2 uppercase tracking-wide">
                    {{ img.caption_title }}
                  </p>
                  <p v-if="img.caption_body" class="text-xs text-white/80 leading-relaxed">{{ img.caption_body }}</p>
                </div>
              </div>
            </div>
            <p v-if="block.tagline" class="section-tagline t-heading italic text-lg t-text-accent-tertiary pt-8 border-t t-border-divider reveal">
              {{ block.tagline }}
            </p>
          </template>

          <!-- ===================== STAT BAND ===================== -->
          <template v-else-if="layout === 'stats'">
            <component :is="CopyBlock" />
            <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-8 py-12 my-8 border-y t-border-divider">
              <div v-for="(s, i) in stats" :key="i" class="reveal text-center">
                <span class="t-heading text-5xl font-light leading-none block t-text">{{ s.value }}</span>
                <span v-if="s.unit" class="text-xs tracking-wide uppercase t-text-accent-tertiary block mb-1">{{ s.unit }}</span>
                <span class="text-sm t-text-tertiary block">{{ s.label }}</span>
              </div>
            </div>
            <p v-if="block.tagline" class="section-tagline t-heading italic text-lg t-text-accent-tertiary pt-8 border-t t-border-divider reveal">
              {{ block.tagline }}
            </p>
          </template>

          <!-- ===================== GALLERY ===================== -->
          <template v-else-if="layout === 'gallery'">
            <component :is="CopyBlock" />
            <!-- Mobile: 2-col grid -->
            <div class="grid grid-cols-2 gap-4 md:hidden my-8">
              <div
                v-for="(img, i) in images"
                :key="i"
                class="reveal aspect-square rounded-sm bg-cover bg-center bg-no-repeat"
                :style="bgStyle(img)"
              />
            </div>
            <!-- Desktop: continuous marquee (duplicated track) -->
            <div v-if="images.length" class="hidden md:block overflow-hidden my-8 landing-marquee">
              <div class="landing-marquee__track" :style="{ '--count': images.length }">
                <div
                  v-for="(img, i) in galleryLoop"
                  :key="i"
                  class="landing-marquee__item rounded-sm bg-cover bg-center bg-no-repeat shrink-0"
                  :style="bgStyle(img)"
                >
                  <div v-if="img.caption_title" class="h-full flex items-end p-4">
                    <span class="text-xs text-white font-medium uppercase tracking-wide">{{ img.caption_title }}</span>
                  </div>
                </div>
              </div>
            </div>
            <p v-if="block.tagline" class="section-tagline t-heading italic text-lg t-text-accent-tertiary pt-8 border-t t-border-divider reveal">
              {{ block.tagline }}
            </p>
          </template>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { h } from "vue";

const props = defineProps({
  block: { type: Object, required: true },
  alt: { type: Boolean, default: false },
});

const config = useRuntimeConfig();

const layout = computed(() => props.block?.layout || "text-image");
const images = computed(() => (Array.isArray(props.block?.images) ? props.block.images.filter((i) => i?.file) : []));
const stats = computed(() => (Array.isArray(props.block?.stats) ? props.block.stats : []));
const hasLabel = computed(() => !!(props.block?.number_label || props.block?.category));

// Loop the gallery images so the marquee scrolls seamlessly (duplicate once).
const galleryLoop = computed(() => [...images.value, ...images.value]);

const imgUrl = (id) => `${config.public.directus.url}/assets/${id}?key=large`;
const bgStyle = (img) => (img?.file ? { backgroundImage: `url('${imgUrl(img.file)}')` } : {});

// Shared copy sub-block (eyebrow / title / body). Render-function so the same
// markup is reused across layouts. The tagline is rendered separately by each
// layout (in the copy column for text/image, after the media otherwise).
const CopyBlock = () =>
  h("div", [
    props.block.eyebrow
      ? h(
          "p",
          { class: "section-subtitle text-sm tracking-[0.15em] uppercase t-text-accent-tertiary mb-4 reveal" },
          props.block.eyebrow
        )
      : null,
    props.block.title
      ? h(
          "h2",
          {
            class:
              "section-title landing-heading t-heading text-[clamp(2rem,5vw,3rem)] font-normal tracking-tight leading-tight mb-8 reveal",
          },
          props.block.title
        )
      : null,
    props.block.body
      ? h(
          "p",
          { class: "section-body text-[1.0625rem] leading-relaxed t-text-secondary mb-8 whitespace-pre-line reveal" },
          props.block.body
        )
      : null,
  ]);
</script>

<style scoped>
/* Dependency-free lifestyle marquee (replaces 1033's bespoke Marquee component). */
.landing-marquee__track {
  display: flex;
  gap: 0.5rem;
  width: max-content;
  animation: landing-marquee-scroll calc(var(--count, 4) * 6s) linear infinite;
}
.landing-marquee:hover .landing-marquee__track {
  animation-play-state: paused;
}
.landing-marquee__item {
  width: 280px;
  height: 280px;
  background-color: rgba(0, 0, 0, 0.25);
  background-blend-mode: darken;
}
@keyframes landing-marquee-scroll {
  from {
    transform: translateX(0);
  }
  to {
    /* Scroll exactly half (one full set of the duplicated track). */
    transform: translateX(-50%);
  }
}
@media (prefers-reduced-motion: reduce) {
  .landing-marquee__track {
    animation: none;
    overflow-x: auto;
  }
}
</style>
