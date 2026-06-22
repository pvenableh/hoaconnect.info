<!--
  Editorial Location section — the structural evolution of the bare LandingMap.
  Composes a grayscale map (LandingMap), walk/bike/transit scores, curated
  nearby highlights, and optional editorial stats into the numbered narrative.
  Reads `resolveLocationConfig(cfg)`, which falls back to the legacy `places`
  data so existing orgs light this up with no re-entry. Self-hides when empty.
-->
<template>
  <OrgLandingNarrativeSection
    v-if="show"
    id="location"
    :number="number"
    :numbered="numbered"
    :alt="alt"
    eyebrow="Location"
    :title="loc.heading || 'The Neighborhood'"
  >
    <p v-if="loc.intro" class="reveal landing-lede text-lg max-w-2xl mb-12 whitespace-pre-line">
      {{ loc.intro }}
    </p>

    <!-- Walk-time number band ("6 min — to the Ocean"). -->
    <div
      v-if="loc.walk_times.length"
      class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-8 py-12 mb-12 border-y t-border-divider"
    >
      <div v-for="(w, i) in loc.walk_times" :key="i" class="reveal text-center">
        <span class="t-heading text-5xl font-light leading-none block t-text">{{ w.minutes }}</span>
        <span class="text-xs tracking-wide uppercase t-text-accent-tertiary block mb-1">min</span>
        <span class="text-sm t-text-tertiary block">{{ w.label }}</span>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-start">
      <!-- Left: scores · stats · nearby highlights -->
      <div>
        <!-- Score row -->
        <div v-if="scores.length" class="grid grid-cols-3 gap-6 pb-10 mb-10 border-b t-border-divider">
          <div v-for="s in scores" :key="s.label" class="reveal text-center sm:text-left">
            <span class="t-heading text-5xl font-light leading-none block t-text">{{ s.value }}</span>
            <span class="text-xs tracking-wide uppercase t-text-accent-tertiary block mt-2">{{ s.label }}</span>
          </div>
        </div>

        <!-- Extra editorial stats -->
        <div v-if="loc.stats.length" class="grid grid-cols-2 gap-6 mb-10">
          <div v-for="(s, i) in loc.stats" :key="i" class="reveal">
            <span class="t-heading text-3xl font-light leading-none block t-text">{{ s.value }}</span>
            <span v-if="s.unit" class="text-[11px] tracking-wide uppercase t-text-accent-tertiary block">{{ s.unit }}</span>
            <span class="text-sm t-text-tertiary block mt-1">{{ s.label }}</span>
          </div>
        </div>

        <!-- Nearby highlights -->
        <div v-if="loc.highlights.length" class="reveal">
          <p class="landing-eyebrow mb-4">Nearby</p>
          <ul class="flex flex-col">
            <li
              v-for="(p, i) in loc.highlights"
              :key="i"
              class="flex items-baseline gap-3 py-3 border-b t-border-divider text-sm"
            >
              <span class="t-text font-medium">{{ p.name }}</span>
              <span class="ml-auto flex items-baseline gap-3 t-text-tertiary tabular-nums">
                <span v-if="p.walk_time">{{ p.walk_time }}</span>
                <span v-if="p.distance">{{ p.distance }}</span>
              </span>
            </li>
          </ul>
        </div>
      </div>

      <!-- Right: grayscale map (shown once coordinates are cached) -->
      <div v-if="geo" class="reveal">
        <LandingMap
          :lat="geo.lat"
          :lon="geo.lon"
          :label="organization?.name || 'the community'"
          height-class="h-72 sm:h-96 lg:h-[28rem]"
        />
      </div>
    </div>

    <!-- "Active Living, Steps Away" lifestyle gallery. -->
    <div v-if="lifestyle && lifestyle.items.length" class="mt-16 lg:mt-24">
      <div class="mb-10">
        <p v-if="lifestyle.eyebrow" class="landing-eyebrow mb-4">{{ lifestyle.eyebrow }}</p>
        <h3
          v-if="lifestyle.heading"
          class="reveal t-heading text-[clamp(1.75rem,4vw,2.5rem)] font-normal leading-tight t-text"
        >
          {{ lifestyle.heading }}
        </h3>
      </div>

      <!-- Mobile: 2-col grid -->
      <div class="grid grid-cols-2 gap-4 md:hidden">
        <div
          v-for="(it, i) in lifestyle.items"
          :key="i"
          class="reveal relative aspect-square rounded-sm bg-cover bg-center bg-no-repeat bg-black/30 bg-blend-darken flex items-end p-3"
          :style="bgStyle(it.image)"
        >
          <div>
            <Icon v-if="it.icon" :name="it.icon" class="w-5 h-5 text-white mb-1" />
            <p class="text-[11px] text-white font-medium uppercase tracking-wide">{{ it.title }}</p>
            <p v-if="it.desc" class="text-[10px] text-white/75 leading-snug">{{ it.desc }}</p>
          </div>
        </div>
      </div>

      <!-- Desktop: continuous marquee -->
      <div class="hidden md:block overflow-hidden landing-marquee">
        <div class="landing-marquee__track" :style="{ '--count': lifestyle.items.length }">
          <div
            v-for="(it, i) in lifestyleLoop"
            :key="i"
            class="landing-marquee__item rounded-sm bg-cover bg-center bg-no-repeat shrink-0 flex items-end p-4"
            :style="bgStyle(it.image)"
          >
            <div>
              <Icon v-if="it.icon" :name="it.icon" class="w-5 h-5 text-white mb-1" />
              <p class="text-xs text-white font-medium uppercase tracking-wide">{{ it.title }}</p>
              <p v-if="it.desc" class="text-[11px] text-white/75 leading-snug">{{ it.desc }}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </OrgLandingNarrativeSection>
</template>

<script setup>
import { resolveLocationConfig, hasLocationContent } from "#core/shared/utils/landing";
import OrgLandingNarrativeSection from "./LandingNarrativeSection.vue";
import LandingMap from "./LandingMap.vue";

const props = defineProps({
  organization: { type: Object, required: true },
  cfg: { type: Object, required: true },
  number: { type: String, default: "" },
  numbered: { type: Boolean, default: true },
  alt: { type: Boolean, default: false },
});

const config = useRuntimeConfig();
const loc = computed(() => resolveLocationConfig(props.cfg));
const geo = computed(() => {
  const g = props.cfg?.geo;
  return g && typeof g.lat === "number" && typeof g.lon === "number" ? g : null;
});
const show = computed(() => hasLocationContent(loc.value, !!geo.value));

// Lifestyle gallery ("Active Living, Steps Away").
const lifestyle = computed(() => loc.value.lifestyle);
const lifestyleLoop = computed(() =>
  lifestyle.value ? [...lifestyle.value.items, ...lifestyle.value.items] : []
);
const imgUrl = (id) => `${config.public.directus.url}/assets/${id}?width=1400&quality=80&format=webp`;
const bgStyle = (id) => (id ? { backgroundImage: `url('${imgUrl(id)}')` } : {});

// Walk / Bike / Transit scores, only those that are set.
const scores = computed(() =>
  [
    { value: loc.value.walk_score, label: "Walk Score" },
    { value: loc.value.bike_score, label: "Bike Score" },
    { value: loc.value.transit_score, label: "Transit" },
  ].filter((s) => s.value != null)
);
</script>

<style scoped>
/* Dependency-free lifestyle marquee (mirrors LandingContentSection's gallery). */
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
  width: 320px;
  height: 220px;
  background-color: rgba(0, 0, 0, 0.3);
  background-blend-mode: darken;
}
@keyframes landing-marquee-scroll {
  from {
    transform: translateX(0);
  }
  to {
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
