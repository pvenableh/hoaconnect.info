<!--
  Full-bleed, grayscale location map for org landing pages.

  Uses the Mapbox Static Images API (a single <img>) rather than the heavy
  mapbox-gl runtime — it's SSR-safe, dependency-free, and renders instantly.
  The image is desaturated with a CSS filter for a clean monochrome look, and
  an accent pin is overlaid in CSS so the marker keeps its brand color on top
  of the grey map. Mapbox attribution is shown (required by their ToS) as a
  small caption.
-->
<template>
  <figure v-if="src" class="landing-map relative w-full select-none">
    <img
      :src="src"
      :alt="`Map of ${label}`"
      class="block w-full object-cover"
      :class="heightClass"
      loading="lazy"
      decoding="async"
    />

    <!-- Centered accent pin (the map is centered on the coordinate). -->
    <span
      class="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-full"
      aria-hidden="true"
    >
      <span
        class="block w-3.5 h-3.5 rounded-full ring-4 ring-white/80 shadow-md"
        style="background: var(--theme-accent-primary, #8b7355)"
      />
      <span
        class="mx-auto block w-px h-2"
        style="background: var(--theme-accent-primary, #8b7355)"
      />
    </span>

    <figcaption
      class="absolute bottom-1 right-2 text-[10px] leading-none text-black/45"
    >
      © Mapbox © OpenStreetMap
    </figcaption>
  </figure>
</template>

<script setup>
const props = defineProps({
  lat: { type: Number, required: true },
  lon: { type: Number, required: true },
  label: { type: String, default: "the community" },
  zoom: { type: Number, default: 14.5 },
  // Tailwind height utilities — kept as a prop so callers control the band.
  heightClass: { type: String, default: "h-72 sm:h-96" },
});

const config = useRuntimeConfig();

const src = computed(() => {
  const token = config.public.mapboxToken;
  if (!token || props.lat == null || props.lon == null) return "";
  // mapbox/light-v11 is already a minimal light basemap; the CSS grayscale
  // filter guarantees a pure monochrome result regardless of style tweaks.
  const center = `${props.lon},${props.lat},${props.zoom},0`;
  return `https://api.mapbox.com/styles/v1/mapbox/light-v11/static/${center}/1280x480@2x?access_token=${token}&logo=false&attribution=false`;
});
</script>

<style scoped>
.landing-map img {
  filter: grayscale(1) contrast(1.04) brightness(1.02);
}
</style>
