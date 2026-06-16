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

const loc = computed(() => resolveLocationConfig(props.cfg));
const geo = computed(() => {
  const g = props.cfg?.geo;
  return g && typeof g.lat === "number" && typeof g.lon === "number" ? g : null;
});
const show = computed(() => hasLocationContent(loc.value, !!geo.value));

// Walk / Bike / Transit scores, only those that are set.
const scores = computed(() =>
  [
    { value: loc.value.walk_score, label: "Walk Score" },
    { value: loc.value.bike_score, label: "Bike Score" },
    { value: loc.value.transit_score, label: "Transit" },
  ].filter((s) => s.value != null)
);
</script>
