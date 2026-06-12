<!--
  Full-bleed editorial image gallery (swiper) for the landing narrative. Images
  come either from a hand-picked list of Directus file ids (source: "manual") or
  live from one of the org's storage folders (source: "folder", via
  /api/landing/gallery). Self-hides when there are no images. Wrapped in the
  numbered editorial shell; the swiper itself is client-only with an SSR grid
  fallback so images still render without JS.
-->
<template>
  <OrgLandingNarrativeSection
    v-if="images.length"
    id="gallery"
    :number="number"
    :numbered="numbered"
    :alt="alt"
    eyebrow="Gallery"
    :title="gallery?.caption || 'A Closer Look'"
    full-bleed
  >
    <div class="reveal">
      <ClientOnly>
        <Swiper
          :modules="modules"
          :slides-per-view="1.15"
          :centered-slides="true"
          :space-between="16"
          :loop="images.length > 2"
          :grab-cursor="true"
          :keyboard="{ enabled: true }"
          :autoplay="{ delay: 4200, disableOnInteraction: true }"
          :pagination="{ clickable: true }"
          :breakpoints="{ 768: { slidesPerView: 1.6, spaceBetween: 24 } }"
          class="landing-gallery"
        >
          <SwiperSlide v-for="(img, i) in images" :key="i" class="landing-gallery__slide">
            <img
              :src="imgUrl(img.id)"
              :alt="img.title || `${organizationName} — image ${i + 1}`"
              class="landing-gallery__img"
              loading="lazy"
              decoding="async"
            />
          </SwiperSlide>
        </Swiper>

        <!-- SSR / no-JS fallback: a simple peeking row of the first few images. -->
        <template #fallback>
          <div class="flex gap-4 overflow-x-auto px-6 lg:px-16 pb-2">
            <img
              v-for="(img, i) in images.slice(0, 4)"
              :key="i"
              :src="imgUrl(img.id)"
              :alt="img.title || organizationName"
              class="h-64 sm:h-80 w-auto object-cover rounded-sm shrink-0"
              loading="lazy"
            />
          </div>
        </template>
      </ClientOnly>
    </div>
  </OrgLandingNarrativeSection>
</template>

<script setup>
import { Swiper, SwiperSlide } from "swiper/vue";
import { Autoplay, Keyboard, Pagination, A11y } from "swiper/modules";
import "swiper/css";
import "swiper/css/pagination";
import OrgLandingNarrativeSection from "./LandingNarrativeSection.vue";

const props = defineProps({
  slug: { type: String, required: true },
  gallery: { type: Object, default: null },
  organizationName: { type: String, default: "" },
  number: { type: String, default: "" },
  numbered: { type: Boolean, default: true },
  alt: { type: Boolean, default: false },
});

const config = useRuntimeConfig();
const modules = [Autoplay, Keyboard, Pagination, A11y];

const isFolder = computed(() => props.gallery?.source === "folder");

// Folder-sourced galleries fetch their image ids; manual galleries use the
// hand-picked list. Keyed by slug + folder so it caches/SSRs cleanly.
const { data: folderData } = await useAsyncData(
  () => `landing-gallery-${props.slug}-${props.gallery?.folder || "root"}`,
  () =>
    isFolder.value
      ? $fetch("/api/landing/gallery", {
          query: { slug: props.slug, folder: props.gallery?.folder || undefined },
        })
      : Promise.resolve({ images: [] }),
  { watch: [isFolder], default: () => ({ images: [] }) }
);

const images = computed(() => {
  if (isFolder.value) return folderData.value?.images || [];
  return (props.gallery?.images || []).map((id) => ({ id, title: null }));
});

const imgUrl = (id) =>
  `${config.public.directus.url}/assets/${id}?width=1400&height=1000&fit=cover&quality=80`;
</script>

<style scoped>
.landing-gallery {
  padding-bottom: 2.5rem; /* room for pagination bullets */
}
.landing-gallery__slide {
  height: auto;
}
.landing-gallery__img {
  display: block;
  width: 100%;
  aspect-ratio: 7 / 5;
  object-fit: cover;
  border-radius: 2px;
  background: color-mix(in srgb, var(--theme-text-primary) 6%, transparent);
}
.landing-gallery :deep(.swiper-pagination-bullet) {
  background: var(--theme-text-muted);
  opacity: 0.5;
}
.landing-gallery :deep(.swiper-pagination-bullet-active) {
  background: var(--theme-accent-primary);
  opacity: 1;
}
/* Modern theme rounds the gallery imagery to match its iOS card language. */
html.theme-modern-light .landing-gallery__img,
html.theme-modern-dark .landing-gallery__img {
  border-radius: 1rem;
}
</style>
